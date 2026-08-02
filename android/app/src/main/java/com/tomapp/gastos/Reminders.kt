package com.tomapp.gastos

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

// ============================================================================
// Recordatorios de Luna: almacenamiento y programación nativos
// ============================================================================
// La web (Luna) es la dueña de la edición, pero NO puede sonar con la app
// cerrada, así que en cada cambio empuja la lista completa aquí. Este módulo
// la guarda en SharedPreferences y programa una alarma exacta por cada uno.
// Así los recordatorios sobreviven a: cerrar la app, actualizarla y reiniciar
// el teléfono (ver BootReceiver).

data class Reminder(
    val id: String,
    val title: String,
    val amount: Double,
    val dueAt: Long,
    val repeat: String,       // once | daily | weekly | biweekly | monthly | yearly | custom
    val customDays: Int,
    val priority: String,     // baja | media | alta
    val note: String,
    val done: Boolean
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id); put("title", title); put("amount", amount)
        put("dueAt", dueAt); put("repeat", repeat); put("customDays", customDays)
        put("priority", priority); put("note", note); put("done", done)
    }

    companion object {
        fun fromJson(o: JSONObject) = Reminder(
            id = o.optString("id"),
            title = o.optString("title"),
            amount = o.optDouble("amount", 0.0),
            dueAt = o.optLong("dueAt", 0L),
            repeat = o.optString("repeat", "once"),
            customDays = o.optInt("customDays", 0),
            priority = o.optString("priority", "media"),
            note = o.optString("note", ""),
            done = o.optBoolean("done", false)
        )
    }
}

object ReminderStore {
    private const val PREFS = "tom_reminders"
    private const val KEY_LIST = "list"
    private const val KEY_PENDING = "pending_actions"

    fun load(ctx: Context): MutableList<Reminder> {
        val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_LIST, "[]")
        val out = mutableListOf<Reminder>()
        try {
            val arr = JSONArray(raw)
            for (i in 0 until arr.length()) out.add(Reminder.fromJson(arr.getJSONObject(i)))
        } catch (e: Exception) { }
        return out
    }

    fun save(ctx: Context, list: List<Reminder>) {
        val arr = JSONArray()
        list.forEach { arr.put(it.toJson()) }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY_LIST, arr.toString()).apply()
    }

    fun find(ctx: Context, id: String): Reminder? = load(ctx).firstOrNull { it.id == id }

    fun replace(ctx: Context, updated: Reminder) {
        val list = load(ctx)
        val idx = list.indexOfFirst { it.id == updated.id }
        if (idx >= 0) list[idx] = updated else list.add(updated)
        save(ctx, list)
    }

    // Acciones hechas desde la notificación con la app cerrada. La web las
    // consume la próxima vez que se abre, para no perder nada.
    fun addPendingAction(ctx: Context, action: String, id: String, newDueAt: Long) {
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val arr = try { JSONArray(prefs.getString(KEY_PENDING, "[]")) } catch (e: Exception) { JSONArray() }
        arr.put(JSONObject().apply {
            put("action", action); put("id", id)
            put("dueAt", newDueAt); put("at", System.currentTimeMillis())
        })
        prefs.edit().putString(KEY_PENDING, arr.toString()).apply()
    }

    fun consumePendingActions(ctx: Context): String {
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY_PENDING, "[]") ?: "[]"
        prefs.edit().putString(KEY_PENDING, "[]").apply()
        return raw
    }
}

object ReminderScheduler {
    const val CHANNEL_ID = "tom_reminders"
    const val EXTRA_ID = "reminder_id"

    fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID, "Recordatorios de Luna", NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Avisos de pendientes, pagos y tareas programadas."
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 400, 200, 400)
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
            setShowBadge(true)
        }
        nm.createNotificationChannel(channel)
    }

    // Un requestCode estable por recordatorio para poder cancelar/reprogramar
    // exactamente la misma alarma más adelante.
    private fun requestCodeOf(id: String): Int = id.hashCode()

    private fun alarmIntent(ctx: Context, id: String): PendingIntent {
        val intent = Intent(ctx, ReminderReceiver::class.java).apply {
            action = "com.tomapp.gastos.FIRE"
            putExtra(EXTRA_ID, id)
            // El id en los datos evita que Android reutilice un PendingIntent
            // de otro recordatorio con extras distintos.
            data = android.net.Uri.parse("tomreminder://$id")
        }
        var flags = PendingIntent.FLAG_UPDATE_CURRENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags = flags or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getBroadcast(ctx, requestCodeOf(id), intent, flags)
    }

    fun cancel(ctx: Context, id: String) {
        try {
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            am.cancel(alarmIntent(ctx, id))
        } catch (e: Exception) { }
    }

    fun schedule(ctx: Context, r: Reminder) {
        if (r.done || r.dueAt <= 0L) return
        // Si ya pasó y no se repite, no tiene sentido programarla.
        val fireAt = if (r.dueAt > System.currentTimeMillis()) r.dueAt
                     else nextOccurrence(r.dueAt, r.repeat, r.customDays) ?: return
        try {
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val pi = alarmIntent(ctx, r.id)
            // setExactAndAllowWhileIdle es la forma recomendada: es exacta pero
            // respeta Doze, así que no desperdicia batería manteniendo el
            // dispositivo despierto.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
                // Sin permiso de alarmas exactas: se programa inexacta en vez
                // de fallar en silencio (puede retrasarse unos minutos).
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt, pi)
            } else {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt, pi)
            }
        } catch (e: Exception) { }
    }

    fun rescheduleAll(ctx: Context) {
        ensureChannel(ctx)
        ReminderStore.load(ctx).forEach { schedule(ctx, it) }
    }

    fun cancelAll(ctx: Context, list: List<Reminder>) {
        list.forEach { cancel(ctx, it.id) }
    }

    // Siguiente ocurrencia según la repetición, saltando las que ya pasaron.
    fun nextOccurrence(from: Long, repeat: String, customDays: Int): Long? {
        if (repeat == "once") return null
        val cal = Calendar.getInstance().apply { timeInMillis = from }
        val now = System.currentTimeMillis()
        var guard = 0
        do {
            when (repeat) {
                "daily"    -> cal.add(Calendar.DAY_OF_MONTH, 1)
                "weekly"   -> cal.add(Calendar.DAY_OF_MONTH, 7)
                "biweekly" -> cal.add(Calendar.DAY_OF_MONTH, 14)
                "monthly"  -> cal.add(Calendar.MONTH, 1)
                "yearly"   -> cal.add(Calendar.YEAR, 1)
                "custom"   -> cal.add(Calendar.DAY_OF_MONTH, if (customDays > 0) customDays else 1)
                else -> return null
            }
            guard++
        } while (cal.timeInMillis <= now && guard < 500)
        return cal.timeInMillis
    }
}
