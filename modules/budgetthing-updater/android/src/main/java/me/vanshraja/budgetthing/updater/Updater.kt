package me.vanshraja.budgetthing.updater

import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageInstaller
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/** Android's installer reads the downloaded APK through this (own class so it can't clash with other providers). */
class UpdateFileProvider : FileProvider()

/**
 * Self-update for the sideloaded APK, ported from BookThing's AppUpdater. The JS side
 * reads `latest.json` from the feed; this downloads the APK, checks its SHA-256 and
 * installs it with a [PackageInstaller] session. Android asks for one confirmation per
 * update for sideloaded apps; once BudgetThing has installed itself it is the installer
 * of record and later updates can skip it (Android 12+, USER_ACTION_NOT_REQUIRED).
 * After a failed or aborted session the next try opens Android's installer screen instead,
 * which explains its errors.
 */
object Updater {
  data class Release(val versionCode: Int, val versionName: String, val sha256: String)

  /** Status reports for the JS module (set while the module is alive). */
  @Volatile var listener: ((status: Int, message: String?, versionCode: Int, versionName: String) -> Unit)? = null

  /** Android wants the user to confirm the install; shown when the app is in front. */
  @Volatile var pendingConfirm: Intent? = null
  @Volatile var confirmShown = false

  const val TAG = "BudgetThingUpdater"
  private const val APK_MIME = "application/vnd.android.package-archive"
  private const val CHANNEL = "updates"
  private const val CONFIRM_NOTIFICATION_ID = 7_401
  private const val UPDATED_NOTIFICATION_ID = 7_402
  private const val RELAUNCH_WINDOW_MS = 30L * 60 * 1000
  internal const val EXTRA_VERSION = "versionName"
  internal const val EXTRA_VERSION_CODE = "versionCode"

  private const val K_STATUS = "attempt.status"
  private const val K_MESSAGE = "attempt.message"
  private const val K_CODE = "attempt.versionCode"
  private const val K_AT = "attempt.at"
  private const val K_RELAUNCH_AT = "relaunch.at"

  fun prefs(context: Context) = context.getSharedPreferences("budgetthing.updates", Context.MODE_PRIVATE)

  @Suppress("DEPRECATION")
  fun packageInfo(context: Context): PackageInfo = context.packageManager.getPackageInfo(context.packageName, 0)

  fun versionCode(context: Context): Long {
    val info = packageInfo(context)
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
  }

  fun canInstall(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()

  fun apkFile(context: Context, versionCode: Int) = File(File(context.cacheDir, "updates"), "BudgetThing-$versionCode.apk")

  /** Download (reusing an intact earlier download) and verify. [onProgress] gets 0..1. */
  fun download(context: Context, url: String, release: Release, sizeBytes: Long, onProgress: (Float) -> Unit): File {
    val dir = File(context.cacheDir, "updates").apply { mkdirs() }
    val out = apkFile(context, release.versionCode)
    if (out.isFile && release.sha256.isNotBlank() && sha256(out).equals(release.sha256, ignoreCase = true)) return out
    dir.listFiles()?.forEach { it.delete() } // one update at a time; drop stale APKs

    val conn = (URL(url).openConnection() as HttpURLConnection).apply {
      connectTimeout = 15_000
      readTimeout = 60_000
    }
    val digest = MessageDigest.getInstance("SHA-256")
    try {
      if (conn.responseCode !in 200..299) error("Download failed (HTTP ${conn.responseCode})")
      val total = conn.contentLengthLong.takeIf { it > 0 } ?: sizeBytes
      var read = 0L
      var lastEmit = 0L
      conn.inputStream.use { input ->
        out.outputStream().use { output ->
          val buf = ByteArray(64 * 1024)
          while (true) {
            val n = input.read(buf)
            if (n < 0) break
            output.write(buf, 0, n)
            digest.update(buf, 0, n)
            read += n
            if (total > 0 && read - lastEmit > 256 * 1024) {
              lastEmit = read
              onProgress((read.toFloat() / total).coerceIn(0f, 1f))
            }
          }
        }
      }
    } finally {
      conn.disconnect()
    }
    val hex = digest.digest().joinToString("") { "%02x".format(it) }
    if (release.sha256.isNotBlank() && !hex.equals(release.sha256, ignoreCase = true)) {
      out.delete()
      error("Downloaded update didn't match its checksum")
    }
    return out
  }

  private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buf = ByteArray(64 * 1024)
      while (true) {
        val n = input.read(buf)
        if (n < 0) break
        digest.update(buf, 0, n)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  /** Commit a PackageInstaller session; the result arrives at [UpdateStatusReceiver]. */
  fun commit(context: Context, file: File, release: Release) {
    val installer = context.packageManager.packageInstaller
    // Earlier sessions that never finished (prompt dismissed, app killed): only this one should wait on the user.
    installer.mySessions.filter { it.appPackageName == context.packageName }.forEach {
      try {
        installer.abandonSession(it.sessionId)
      } catch (e: Exception) {
        Log.w(TAG, "Couldn't abandon stale session ${it.sessionId}", e)
      }
    }
    val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
      setAppPackageName(context.packageName)
      setSize(file.length())
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
      }
    }
    val sessionId = installer.createSession(params)
    Log.i(TAG, "Session $sessionId for ${release.versionName} (${file.length()} bytes)")
    installer.openSession(sessionId).use { session ->
      session.openWrite("base.apk", 0, file.length()).use { out ->
        file.inputStream().use { it.copyTo(out) }
        session.fsync(out)
      }
      val intent = Intent(context, UpdateStatusReceiver::class.java)
        .putExtra(EXTRA_VERSION, release.versionName)
        .putExtra(EXTRA_VERSION_CODE, release.versionCode)
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or
        (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
      val pending = PendingIntent.getBroadcast(context, sessionId, intent, flags)
      session.commit(pending.intentSender)
    }
  }

  /** Hand the downloaded APK to Android's installer screen (fallback; it shows its own errors). */
  fun openSystemInstaller(context: Context, activity: Activity?, versionCode: Int) {
    val file = apkFile(context, versionCode)
    if (!file.isFile) error("The downloaded update is gone. Tap Update to fetch it again.")
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", file)
    val intent = Intent(Intent.ACTION_VIEW)
      .setDataAndType(uri, APK_MIME)
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    if (activity != null) activity.startActivity(intent)
    else context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  /** Show a pending confirmation prompt if there is one and it hasn't been shown yet. */
  fun showPendingConfirm(activity: Activity?, force: Boolean = false): Boolean {
    val confirm = pendingConfirm ?: return false
    if (activity == null || (confirmShown && !force)) return false
    return try {
      activity.startActivity(confirm)
      confirmShown = true
      NotificationManagerCompat.from(activity).cancel(CONFIRM_NOTIFICATION_ID)
      true
    } catch (e: Exception) {
      Log.w(TAG, "Couldn't show the install prompt", e)
      false
    }
  }

  /** The app is in the background while Android waits for the confirmation: leave a notice. */
  fun postConfirmNotification(context: Context, versionName: String) {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    notify(context, CONFIRM_NOTIFICATION_ID, "BudgetThing $versionName is ready", "Tap to install the update.", launch, null)
  }

  /** Persist a PackageInstaller result synchronously (the process may die right after). */
  fun recordAttempt(context: Context, status: Int, message: String?, versionCode: Int) {
    Log.i(TAG, "install status $status for $versionCode: $message")
    prefs(context).edit()
      .putInt(K_STATUS, status)
      .putString(K_MESSAGE, message)
      .putInt(K_CODE, versionCode)
      .putLong(K_AT, System.currentTimeMillis())
      .commit()
  }

  /** The last recorded install result, or null. */
  fun lastAttempt(context: Context): Map<String, Any?>? {
    val p = prefs(context)
    if (!p.contains(K_STATUS)) return null
    val status = p.getInt(K_STATUS, PackageInstaller.STATUS_FAILURE)
    return mapOf(
      "status" to status,
      "statusName" to statusName(status),
      "message" to p.getString(K_MESSAGE, null),
      "versionCode" to p.getInt(K_CODE, 0),
      "at" to p.getLong(K_AT, 0).toDouble(),
    )
  }

  /** An install was started from inside the app: offer to reopen it once it's replaced. */
  fun armRelaunch(context: Context) {
    prefs(context).edit().putLong(K_RELAUNCH_AT, System.currentTimeMillis()).commit()
  }

  /** [UpdatedReceiver]: the new version is in place. */
  fun onPackageReplaced(context: Context) {
    val p = prefs(context)
    val armedAt = p.getLong(K_RELAUNCH_AT, 0)
    recordAttempt(context, PackageInstaller.STATUS_SUCCESS, null, versionCode(context).toInt())
    if (armedAt == 0L || System.currentTimeMillis() - armedAt > RELAUNCH_WINDOW_MS) return
    p.edit().remove(K_RELAUNCH_AT).commit()
    // Android 14+ blocks the app from reopening itself after the update (background activity
    // start), so leave a tap-to-open notice; the module clears it when the app comes to the front.
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    val name = packageInfo(context).versionName ?: ""
    notify(context, UPDATED_NOTIFICATION_ID, "BudgetThing updated to $name", "Tap to open.", launch, 10 * 60 * 1000L)
  }

  fun cancelNotices(context: Context) {
    NotificationManagerCompat.from(context).cancel(UPDATED_NOTIFICATION_ID)
  }

  private fun notify(context: Context, id: Int, title: String, text: String, open: Intent, timeoutMs: Long?) {
    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return
    manager.createNotificationChannel(
      NotificationChannelCompat.Builder(CHANNEL, NotificationManagerCompat.IMPORTANCE_DEFAULT)
        .setName("App updates")
        .build(),
    )
    val pending = PendingIntent.getActivity(
      context, id, open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val builder = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(android.R.drawable.stat_sys_download_done)
      .setContentTitle(title)
      .setContentText(text)
      .setContentIntent(pending)
      .setAutoCancel(true)
    if (timeoutMs != null) builder.setTimeoutAfter(timeoutMs)
    try {
      manager.notify(id, builder.build())
    } catch (e: SecurityException) {
      Log.w(TAG, "Couldn't post notification $id", e)
    }
  }

  fun statusName(status: Int): String = when (status) {
    PackageInstaller.STATUS_SUCCESS -> "installed"
    PackageInstaller.STATUS_PENDING_USER_ACTION -> "waiting for confirmation"
    PackageInstaller.STATUS_FAILURE_ABORTED -> "cancelled"
    PackageInstaller.STATUS_FAILURE_BLOCKED -> "blocked by Android"
    PackageInstaller.STATUS_FAILURE_CONFLICT -> "conflicts with the installed app"
    PackageInstaller.STATUS_FAILURE_INCOMPATIBLE -> "incompatible with this device"
    PackageInstaller.STATUS_FAILURE_INVALID -> "invalid package"
    PackageInstaller.STATUS_FAILURE_STORAGE -> "not enough storage"
    8 /* STATUS_FAILURE_TIMEOUT, API 34 */ -> "timed out"
    else -> "failed (status $status)"
  }
}
