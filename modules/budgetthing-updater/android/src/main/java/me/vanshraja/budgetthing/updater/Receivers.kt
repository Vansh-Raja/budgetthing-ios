package me.vanshraja.budgetthing.updater

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build

/**
 * PackageInstaller results. The result is persisted before anything else (the process may be
 * killed around an install) and passed to the JS module when it's alive. A confirmation request
 * is kept as [Updater.pendingConfirm]: launching it from here is blocked while the app is in the
 * background, so the module shows it when the app comes to the front (or a notice is posted).
 */
class UpdateStatusReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
    val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
    val versionCode = intent.getIntExtra(Updater.EXTRA_VERSION_CODE, 0)
    Updater.recordAttempt(context, status, message, versionCode)

    if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
      @Suppress("DEPRECATION")
      val confirm = if (Build.VERSION.SDK_INT >= 33) {
        intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
      } else {
        intent.getParcelableExtra(Intent.EXTRA_INTENT)
      }
      Updater.pendingConfirm = confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      Updater.confirmShown = false
      val listener = Updater.listener
      if (listener == null) {
        Updater.postConfirmNotification(context, intent.getStringExtra(Updater.EXTRA_VERSION) ?: "")
      }
      listener?.invoke(status, message, versionCode)
      return
    }
    Updater.pendingConfirm = null
    Updater.listener?.invoke(status, message, versionCode)
  }
}

/** BudgetThing was just replaced by a newer APK: record it and offer a tap-to-open notice. */
class UpdatedReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    Updater.onPackageReplaced(context.applicationContext)
  }
}
