// Builds a shareable debug APK that opens the hosted portal instead of localhost.
// Usage (from mobile/): LIVE_URL=https://sahyadri-heights.onrender.com node scripts/build-live.js
// Needs JDK 21 (Android Studio's JBR) in JAVA_HOME and the Android SDK (android/local.properties).
// The dev config (localhost over adb reverse) is restored afterwards.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const cfgPath = path.join(root, 'capacitor.config.json');
const live = (process.env.LIVE_URL || 'https://sahyadri-heights.onrender.com').replace(/\/+$/, '');
const original = fs.readFileSync(cfgPath, 'utf8');
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit', env: process.env });

try {
  const cfg = JSON.parse(original);
  cfg.server = { url: live + '/m/', cleartext: false, androidScheme: 'https' };
  cfg.android = { allowMixedContent: false };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  run('npx cap sync android');
  const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
  run(`${gradlew} assembleDebug`, path.join(root, 'android'));
  const apk = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  const outDir = path.join(root, 'dist');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, 'sahyadri-heights.apk');
  fs.copyFileSync(apk, out);
  console.log('Built', out, (fs.statSync(out).size / 1048576).toFixed(1) + ' MB, opens ' + live + '/m/');
} finally {
  fs.writeFileSync(cfgPath, original);
  try { run('npx cap sync android'); } catch { /* dev config restored on disk; re-run cap sync manually */ }
}
