const { withAndroidManifest } = require('expo/config-plugins');

const SAFE_BROWSING_META = 'android.webkit.WebView.EnableSafeBrowsing';

module.exports = function withRaidWebViewSecurity(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) return cfg;

    application.$ = application.$ || {};

    // RAID is a browser, so explicit http:// destinations must remain reachable.
    // HTTPS pages still keep mixed-content protection inside react-native-webview.
    application.$['android:usesCleartextTraffic'] = 'true';

    const metadata = application['meta-data'] || [];
    let safeBrowsing = metadata.find(
      (item) => item?.$?.['android:name'] === SAFE_BROWSING_META,
    );

    if (!safeBrowsing) {
      safeBrowsing = {
        $: {
          'android:name': SAFE_BROWSING_META,
          'android:value': 'true',
        },
      };
      metadata.push(safeBrowsing);
    } else {
      safeBrowsing.$ = safeBrowsing.$ || {};
      safeBrowsing.$['android:value'] = 'true';
    }

    application['meta-data'] = metadata;
    return cfg;
  });
};
