const { withAppBuildGradle, withMainApplication, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PACKAGE = 'com.yosef.raidbrowser';
const WG_VERSION = '1.0.20260102';

function withWireGuardGradle(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes(`com.wireguard.android:tunnel:${WG_VERSION}`)) {
      src = src.replace(/dependencies\s*\{/, (m) => `${m}\n    implementation("com.wireguard.android:tunnel:${WG_VERSION}")\n    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")`);
    }
    if (!src.includes('coreLibraryDesugaringEnabled true')) {
      src = src.replace(/android\s*\{/, (m) => `${m}\n    compileOptions {\n        sourceCompatibility JavaVersion.VERSION_17\n        targetCompatibility JavaVersion.VERSION_17\n        coreLibraryDesugaringEnabled true\n    }`);
    }
    cfg.modResults.contents = src;
    return cfg;
  });
}

function withWireGuardMainApplication(config) {
  return withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes('RaidVpnPackage')) {
      src = src.replace(
        /PackageList\(this\)\.packages\.apply\s*\{/,
        (m) => `${m}\n          add(RaidVpnPackage())`
      );
    }
    cfg.modResults.contents = src;
    return cfg;
  });
}

function withWireGuardNativeFiles(config) {
  return withDangerousMod(config, ['android', async (cfg) => {
    const javaDir = path.join(cfg.modRequest.projectRoot, 'android', 'app', 'src', 'main', 'java', ...PACKAGE.split('.'));
    fs.mkdirSync(javaDir, { recursive: true });

    const moduleSource = `package ${PACKAGE}

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Tunnel
import com.wireguard.config.Config
import java.io.ByteArrayInputStream
import java.nio.charset.StandardCharsets
import java.util.concurrent.Executors

class RaidVpnModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {
    private val backend = GoBackend(reactContext)
    private val executor = Executors.newSingleThreadExecutor()
    private val tunnel = object : Tunnel {
        override fun getName(): String = "raid"
        override fun onStateChange(newState: Tunnel.State) = Unit
    }
    @Volatile private var activeConfig: Config? = null
    private var pendingPromise: Promise? = null
    private var pendingConfigText: String? = null

    init { reactContext.addActivityEventListener(this) }

    override fun getName(): String = "RaidVpn"

    private fun parseConfig(text: String): Config = Config.parse(ByteArrayInputStream(text.toByteArray(StandardCharsets.UTF_8)))

    private fun startTunnel(text: String, promise: Promise) {
        executor.execute {
            try {
                val config = parseConfig(text)
                backend.setState(tunnel, Tunnel.State.UP, config)
                activeConfig = config
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("VPN_CONNECT_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun connect(configText: String, promise: Promise) {
        if (configText.isBlank()) {
            promise.reject("VPN_CONFIG_EMPTY", "WireGuard configuration is empty")
            return
        }
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("VPN_NO_ACTIVITY", "No foreground activity available")
            return
        }
        val permissionIntent = VpnService.prepare(reactContext)
        if (permissionIntent != null) {
            synchronized(this) {
                if (pendingPromise != null) {
                    promise.reject("VPN_REQUEST_IN_PROGRESS", "طلب إذن VPN قيد التنفيذ بالفعل. أكمل نافذة Android الحالية ثم حاول مجددًا.")
                    return
                }
                pendingPromise = promise
                pendingConfigText = configText
            }
            try {
                activity.startActivityForResult(permissionIntent, REQUEST_VPN_PERMISSION)
            } catch (e: Exception) {
                synchronized(this) {
                    if (pendingPromise === promise) {
                        pendingPromise = null
                        pendingConfigText = null
                    }
                }
                promise.reject("VPN_PERMISSION_FAILED", "تعذر فتح نافذة إذن VPN في Android.", e)
            }
        } else {
            startTunnel(configText, promise)
        }
    }

    @ReactMethod
    fun disconnect(promise: Promise) {
        executor.execute {
            try {
                backend.setState(tunnel, Tunnel.State.DOWN, null)
                activeConfig = null
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("VPN_DISCONNECT_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun getStatus(promise: Promise) {
        executor.execute {
            try {
                promise.resolve(backend.getState(tunnel) == Tunnel.State.UP)
            } catch (e: Exception) {
                promise.reject("VPN_STATUS_FAILED", e.message, e)
            }
        }
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_VPN_PERMISSION) return
        val (promise, text) = synchronized(this) {
            val currentPromise = pendingPromise
            val currentText = pendingConfigText
            pendingPromise = null
            pendingConfigText = null
            Pair(currentPromise, currentText)
        }
        if (promise == null) return
        if (resultCode != Activity.RESULT_OK || text == null) {
            promise.reject("VPN_PERMISSION_DENIED", "Android VPN permission was denied")
            return
        }
        startTunnel(text, promise)
    }

    override fun onNewIntent(intent: Intent) = Unit

    companion object { private const val REQUEST_VPN_PERMISSION = 7341 }
}
`;

    const packageSource = `package ${PACKAGE}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class RaidVpnPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(RaidVpnModule(reactContext))
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
`;

    fs.writeFileSync(path.join(javaDir, 'RaidVpnModule.kt'), moduleSource);
    fs.writeFileSync(path.join(javaDir, 'RaidVpnPackage.kt'), packageSource);
    return cfg;
  }]);
}

module.exports = function withRaidWireGuard(config) {
  config = withWireGuardGradle(config);
  config = withWireGuardMainApplication(config);
  config = withWireGuardNativeFiles(config);
  return config;
};
