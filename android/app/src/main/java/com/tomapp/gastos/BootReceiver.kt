package com.tomapp.gastos

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Android borra TODAS las alarmas al apagar el teléfono y al actualizar la
// app. Sin esto, los recordatorios dejarían de sonar tras un reinicio.
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val a = intent.action ?: return
        if (a == Intent.ACTION_BOOT_COMPLETED ||
            a == Intent.ACTION_MY_PACKAGE_REPLACED ||
            a == "android.intent.action.QUICKBOOT_POWERON" ||
            a == "android.intent.action.LOCKED_BOOT_COMPLETED") {
            try { ReminderScheduler.rescheduleAll(ctx) } catch (e: Exception) { }
        }
    }
}
