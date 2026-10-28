package me.vanshraja.budgetthing.updater

import android.Manifest
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class InstallRequest : Record {
  @Field val url: String = ""
  @Field val versionCode: Int = 0
  @Field val versionName: String = ""
  @Field val sha256: String = ""
  @Field val sizeBytes: Double = 0.0
  /** Skip the PackageInstaller session and open Android's installer screen (after a failed session). */
  @Field val viaSystemInstaller: Boolean = false
}

private const val NOTIFICATIONS_REQUESTED = "notifications.requested"

/** JS bridge for [Updater]. Android only; the JS wrapper is null on iOS and web. */
class UpdaterModule : Module() {
  private val context get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("BudgetThingUpdater")

    Events("onProgress", "onStatus")

    Constants {
      val info = Updater.packageInfo(context)
      mapOf(
        "versionCode" to Updater.versionCode(context).toInt(),
        "versionName" to (info.versionName ?: ""),
      )
    }

    OnCreate {
      Updater.listener = { status, message, versionCode, versionName ->
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION &&
          !Updater.showPendingConfirm(appContext.currentActivity)
        ) {
          // In the background (or no activity): leave a notice; it opens the app, which shows the prompt.
          appContext.reactContext?.let { Updater.postConfirmNotification(it, versionName) }
        }
        sendEvent(
          "onStatus",
          mapOf(
            "status" to status,
            "statusName" to Updater.statusName(status),
            "message" to message,
            "versionCode" to versionCode,
            "pendingConfirm" to (Updater.pendingConfirm != null),
          ),
        )
      }
    }

    OnDestroy {
      Updater.listener = null
    }

    OnActivityEntersForeground {
      appContext.reactContext?.let { Updater.cancelNotices(it) }
      Updater.showPendingConfirm(appContext.currentActivity)
    }

    Function("canInstall") {
      Updater.canInstall(context)
    }

    /** Settings page where the user allows BudgetThing to install updates. */
    Function("openInstallSettings") {
      val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
      val activity = appContext.currentActivity
      if (activity != null) activity.startActivity(intent) else context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** Ask once for notifications (Android 13+) so the "updated, tap to open" notice can show. */
    Function("requestNotificationPermission") {
      val activity = appContext.currentActivity
      val prefs = Updater.prefs(context)
      if (Build.VERSION.SDK_INT >= 33 && activity != null &&
        ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
        !prefs.getBoolean(NOTIFICATIONS_REQUESTED, false)
      ) {
        prefs.edit().putBoolean(NOTIFICATIONS_REQUESTED, true).apply()
        ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7_403)
      }
    }

    /** Show Android's pending install prompt again (the "Install" button). */
    Function("confirmPendingInstall") {
      Updater.showPendingConfirm(appContext.currentActivity, force = true)
    }

    Function("hasPendingConfirm") {
      Updater.pendingConfirm != null
    }

    Function("lastAttempt") {
      Updater.lastAttempt(context)
    }

    Function("getNumber") { key: String ->
      Updater.prefs(context).getLong("js.$key", 0).toDouble()
    }

    Function("setNumber") { key: String, value: Double ->
      Updater.prefs(context).edit().putLong("js.$key", value.toLong()).apply()
    }

    /**
     * Download, verify and install. Resolves "session" once the PackageInstaller session is
     * committed (results follow as onStatus events) or "system-installer" when Android's
     * installer screen was opened instead.
     */
    AsyncFunction("install") Coroutine { req: InstallRequest ->
      val ctx = context
      val release = Updater.Release(req.versionCode, req.versionName, req.sha256)
      withContext(Dispatchers.IO) {
        val file = Updater.download(ctx, req.url, release, req.sizeBytes.toLong()) { fraction ->
          sendEvent("onProgress", mapOf("fraction" to fraction.toDouble()))
        }
        Updater.armRelaunch(ctx)
        if (req.viaSystemInstaller) {
          withContext(Dispatchers.Main) { Updater.openSystemInstaller(ctx, appContext.currentActivity, release.versionCode) }
          "system-installer"
        } else {
          Updater.commit(ctx, file, release)
          "session"
        }
      }
    }
  }
}
