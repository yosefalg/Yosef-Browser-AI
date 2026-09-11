const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const VECTOR = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
  android:width="108dp" android:height="108dp"
  android:viewportWidth="108" android:viewportHeight="108">
  <path android:fillColor="#070B14" android:pathData="M0,0H108V108H0Z"/>
  <path android:fillColor="#10245C" android:pathData="M54,16A38,38 0,1 0,54,92A38,38 0,1 0,54,16"/>
  <path android:fillColor="#00000000" android:strokeColor="#7C3AED" android:strokeWidth="4" android:strokeLineCap="round" android:pathData="M12,62C26,39 48,28 76,28C88,28 97,31 103,36"/>
  <path android:fillColor="#00000000" android:strokeColor="#3B82F6" android:strokeWidth="3" android:strokeLineCap="round" android:pathData="M8,70C31,86 62,88 94,70"/>
  <path android:fillColor="#F8FAFC" android:pathData="M29,25H60C75,25 84,33 84,45C84,55 77,62 66,64L85,84H68L51,65H44V84H29ZM44,38V53H58C65,53 69,50 69,45C69,40 65,38 58,38Z"/>
  <path android:fillColor="#A78BFA" android:pathData="M50,18L58,12L66,18L58,24Z"/>
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
