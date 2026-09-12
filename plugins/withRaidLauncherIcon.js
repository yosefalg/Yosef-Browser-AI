const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const VECTOR = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
  android:width="108dp" android:height="108dp"
  android:viewportWidth="108" android:viewportHeight="108">
  <path android:fillColor="#071018" android:pathData="M0,0H108V108H0Z"/>
  <path android:fillColor="#0E2A2B" android:pathData="M54,14A40,40 0,1 0,54,94A40,40 0,1 0,54,14"/>
  <path android:fillColor="#00000000" android:strokeColor="#8BE0CC" android:strokeWidth="3" android:strokeLineCap="round" android:pathData="M18,64C29,36 55,23 88,31"/>
  <path android:fillColor="#00000000" android:strokeColor="#8A63D2" android:strokeWidth="4" android:strokeLineCap="round" android:pathData="M15,76C36,91 70,91 94,70"/>
  <path android:fillColor="#F8FAFC" android:pathData="M30,25H59C74,25 83,33 83,45C83,55 77,62 66,64L84,84H67L51,65H45V84H30ZM45,38V53H58C65,53 69,50 69,45C69,40 65,38 58,38Z"/>
  <path android:fillColor="#8BE0CC" android:pathData="M82,18A6,6 0,1 0,82,30A6,6 0,1 0,82,18"/>
  <path android:fillColor="#FFFFFF" android:fillAlpha="0.12" android:pathData="M22,28L78,82L82,78L26,24Z"/>
</vector>`;

module.exports = function withRaidLauncherIcon(config) {
  config = withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0]?.$;
    if (application) {
      application['android:icon'] = '@drawable/raid_launcher_icon';
      application['android:roundIcon'] = '@drawable/raid_launcher_icon';
    }
    return cfg;
  });
  return withDangerousMod(config, ['android', async (cfg) => {
    const resDir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'drawable');
    fs.mkdirSync(resDir, { recursive: true });
    fs.writeFileSync(path.join(resDir, 'raid_launcher_icon.xml'), VECTOR, 'utf8');
    return cfg;
  }]);
};
