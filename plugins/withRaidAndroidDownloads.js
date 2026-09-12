const { withMainApplication, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PACKAGE = 'com.yosef.raidbrowser';

function withDownloadMainApplication(config) {
  return withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes('RaidDownloadPackage')) {
      src = src.replace(
        /PackageList\(this\)\.packages\.apply\s*\{/,
        (m) => `${m}\n          add(RaidDownloadPackage())`
      );
    }
    cfg.modResults.contents = src;
    return cfg;
  });
}

function withDownloadNativeFiles(config) {
  return withDangerousMod(config, ['android', async (cfg) => {
    const javaDir = path.join(cfg.modRequest.projectRoot, 'android', 'app', 'src', 'main', 'java', ...PACKAGE.split('.'));
    fs.mkdirSync(javaDir, { recursive: true });

    const moduleSource = `package ${PACKAGE}

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.WebSettings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class RaidDownloadModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val manager: DownloadManager
        get() = reactContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

    override fun getName(): String = "RaidDownload"

    @ReactMethod
    fun enqueue(url: String, fileName: String, referer: String?, promise: Promise) {
        try {
            val uri = Uri.parse(url)
            if (uri.scheme != "https") {
                promise.reject("DOWNLOAD_INSECURE", "Only HTTPS downloads are allowed")
                return
            }
            val safeName = fileName.ifBlank { "download-" + System.currentTimeMillis() }
            val request = DownloadManager.Request(uri)
                .setTitle(safeName)
                .setDescription("RAID Browser")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(true)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, safeName)

            if (!referer.isNullOrBlank()) request.addRequestHeader("Referer", referer)
            try {
                val cookie = CookieManager.getInstance().getCookie(url)
                if (!cookie.isNullOrBlank()) request.addRequestHeader("Cookie", cookie)
            } catch (_: Exception) {}
            try {
                val userAgent = WebSettings.getDefaultUserAgent(reactContext)
                if (!userAgent.isNullOrBlank()) request.addRequestHeader("User-Agent", userAgent)
            } catch (_: Exception) {}

            promise.resolve(manager.enqueue(request).toDouble())
        } catch (e: Exception) {
            promise.reject("DOWNLOAD_ENQUEUE_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun query(id: Double, promise: Promise) {
        val downloadId = id.toLong()
        val cursor = try { manager.query(DownloadManager.Query().setFilterById(downloadId)) } catch (e: Exception) {
            promise.reject("DOWNLOAD_QUERY_FAILED", e.message, e)
            return
        }
        cursor.use {
            if (!it.moveToFirst()) {
                promise.resolve(null)
                return
            }
            fun longColumn(name: String): Long {
                val index = it.getColumnIndex(name)
                return if (index >= 0) it.getLong(index) else -1L
            }
            fun stringColumn(name: String): String? {
                val index = it.getColumnIndex(name)
                return if (index >= 0) it.getString(index) else null
            }
            val map = Arguments.createMap()
            map.putDouble("id", downloadId.toDouble())
            map.putInt("status", longColumn(DownloadManager.COLUMN_STATUS).toInt())
            map.putInt("reason", longColumn(DownloadManager.COLUMN_REASON).toInt())
            map.putDouble("totalBytes", longColumn(DownloadManager.COLUMN_TOTAL_SIZE_BYTES).toDouble())
            map.putDouble("downloadedBytes", longColumn(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR).toDouble())
            map.putString("localUri", stringColumn(DownloadManager.COLUMN_LOCAL_URI))
            map.putString("mediaType", stringColumn(DownloadManager.COLUMN_MEDIA_TYPE))
            map.putString("title", stringColumn(DownloadManager.COLUMN_TITLE))
            promise.resolve(map)
        }
    }

    @ReactMethod
    fun remove(id: Double, promise: Promise) {
        try {
            promise.resolve(manager.remove(id.toLong()) > 0)
        } catch (e: Exception) {
            promise.reject("DOWNLOAD_REMOVE_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun open(id: Double, promise: Promise) {
        try {
            val uri = manager.getUriForDownloadedFile(id.toLong())
            if (uri == null) {
                promise.reject("DOWNLOAD_NOT_READY", "Downloaded file is not ready")
                return
            }
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, reactContext.contentResolver.getType(uri))
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DOWNLOAD_OPEN_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun share(id: Double, promise: Promise) {
        try {
            val uri = manager.getUriForDownloadedFile(id.toLong())
            if (uri == null) {
                promise.reject("DOWNLOAD_NOT_READY", "Downloaded file is not ready")
                return
            }
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = reactContext.contentResolver.getType(uri) ?: "application/octet-stream"
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            reactContext.startActivity(Intent.createChooser(intent, "مشاركة الملف").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DOWNLOAD_SHARE_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun openDownloads(promise: Promise) {
        try {
            val intent = Intent(DownloadManager.ACTION_VIEW_DOWNLOADS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DOWNLOADS_OPEN_FAILED", e.message, e)
        }
    }
}
`;

    const packageSource = `package ${PACKAGE}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class RaidDownloadPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(RaidDownloadModule(reactContext))
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
`;

    fs.writeFileSync(path.join(javaDir, 'RaidDownloadModule.kt'), moduleSource);
    fs.writeFileSync(path.join(javaDir, 'RaidDownloadPackage.kt'), packageSource);
    return cfg;
  }]);
}

module.exports = function withRaidAndroidDownloads(config) {
  config = withDownloadMainApplication(config);
  config = withDownloadNativeFiles(config);
  return config;
};
