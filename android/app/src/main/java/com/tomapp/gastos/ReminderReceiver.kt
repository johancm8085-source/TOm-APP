package com.tomapp.gastos

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import java.text.NumberFormat
import java.util.Locale

// Se dispara cuando llega la hora de un recordatorio, con la app abierta,
// cerrada o el teléfono bloqueado.
class ReminderReceiver : BroadcastReceiver() {

    override fun onReceive(ctx: Context, intent: Intent) {
        val id = intent.getStringExtra(ReminderScheduler.EXTRA_ID) ?: return
        val r = ReminderStore.find(ctx, id) ?: return
        if (r.done) return

        ReminderScheduler.ensureChannel(ctx)
        showNotification(ctx, r)

        // Si se repite, deja programada la siguiente de una vez: así la cadena
        // no depende de que el usuario abra la app.
        val next = ReminderScheduler.nextOccurrence(r.dueAt, r.repeat, r.customDays)
        if (next != null) {
            val updated = r.copy(dueAt = next)
            ReminderStore.replace(ctx, updated)
            ReminderScheduler.schedule(ctx, updated)
        }
    }

    private fun money(v: Double): String {
        return try {
            val nf = NumberFormat.getNumberInstance(Locale("es", "CO"))
            nf.maximumFractionDigits = 0
            "$" + nf.format(v)
        } catch (e: Exception) { "$" + v.toInt() }
    }

    private fun showNotification(ctx: Context, r: Reminder) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val cuerpo = StringBuilder()
        cuerpo.append("Hoy debes pagar:\n").append(r.title)
        if (r.amount > 0) cuerpo.append("\n").append(money(r.amount))
        cuerpo.append("\nVence hoy.")
        if (r.note.isNotEmpty()) cuerpo.append("\n").append(r.note)

        val notifId = r.id.hashCode()

        // Tocar la notificación abre la app en ese pendiente.
        val openIntent = Intent(ctx, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("open_reminder", r.id)
            data = android.net.Uri.parse("tomopen://${r.id}")
        }
        val openPi = PendingIntent.getActivity(ctx, notifId, openIntent, piFlags())

        val prioridadAndroid = when (r.priority) {
            "alta" -> NotificationCompat.PRIORITY_MAX
            "baja" -> NotificationCompat.PRIORITY_DEFAULT
            else -> NotificationCompat.PRIORITY_HIGH
        }

        val b = NotificationCompat.Builder(ctx, ReminderScheduler.CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle("🔔 Recordatorio")
            .setContentText(r.title + if (r.amount > 0) " · " + money(r.amount) else "")
            .setStyle(NotificationCompat.BigTextStyle().bigText(cuerpo.toString()))
            .setPriority(prioridadAndroid)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)  // se ve en pantalla bloqueada
            .setDefaults(NotificationCompat.DEFAULT_SOUND or NotificationCompat.DEFAULT_VIBRATE)
            .setAutoCancel(true)
            .setContentIntent(openPi)
            .addAction(0, "✓ Realizado", actionPi(ctx, "done", r.id, notifId))
            .addAction(0, "⏰ Posponer 1 h", actionPi(ctx, "snooze60", r.id, notifId))
            .addAction(0, "✏ Editar", openPi)

        try { nm.notify(notifId, b.build()) } catch (e: Exception) { }
    }

    private fun piFlags(): Int {
        var f = PendingIntent.FLAG_UPDATE_CURRENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) f = f or PendingIntent.FLAG_IMMUTABLE
        return f
    }

    private fun actionPi(ctx: Context, action: String, id: String, notifId: Int): PendingIntent {
        val i = Intent(ctx, ReminderActionReceiver::class.java).apply {
            this.action = action
            putExtra(ReminderScheduler.EXTRA_ID, id)
            putExtra("notif_id", notifId)
            data = android.net.Uri.parse("tomaction://$action/$id")
        }
        return PendingIntent.getBroadcast(ctx, (action + id).hashCode(), i, piFlags())
    }
}
