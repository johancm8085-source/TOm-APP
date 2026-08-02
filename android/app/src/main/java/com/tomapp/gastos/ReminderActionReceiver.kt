package com.tomapp.gastos

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Botones de la notificación. Funcionan con la app cerrada: actualizan el
// almacén nativo y dejan la acción anotada para que Luna la aplique cuando
// la app se vuelva a abrir.
class ReminderActionReceiver : BroadcastReceiver() {

    override fun onReceive(ctx: Context, intent: Intent) {
        val id = intent.getStringExtra(ReminderScheduler.EXTRA_ID) ?: return
        val notifId = intent.getIntExtra("notif_id", id.hashCode())
        val r = ReminderStore.find(ctx, id) ?: return

        when (intent.action) {
            "done" -> {
                // OJO: si es recurrente, ReminderReceiver YA adelantó dueAt a la
                // siguiente fecha al disparar la notificación y dejó esa alarma
                // programada. Volver a adelantar aquí se saltaría un período
                // entero (marcar el pago de agosto saltaría septiembre).
                // Así que aquí solo se confirma la fecha que ya quedó puesta.
                if (r.repeat != "once") {
                    ReminderStore.addPendingAction(ctx, "done", id, r.dueAt)
                } else {
                    val updated = r.copy(done = true)
                    ReminderStore.replace(ctx, updated)
                    ReminderScheduler.cancel(ctx, id)
                    ReminderStore.addPendingAction(ctx, "done", id, 0L)
                }
            }
            "snooze60" -> {
                val newDue = System.currentTimeMillis() + 60L * 60L * 1000L
                val updated = r.copy(dueAt = newDue, done = false)
                ReminderStore.replace(ctx, updated)
                ReminderScheduler.cancel(ctx, id)
                ReminderScheduler.schedule(ctx, updated)
                ReminderStore.addPendingAction(ctx, "snooze", id, newDue)
            }
        }

        try {
            (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(notifId)
        } catch (e: Exception) { }
    }
}
