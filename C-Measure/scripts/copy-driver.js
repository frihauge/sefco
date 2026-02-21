const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
  console.error(`[driver] dist folder not found: ${distDir}`);
  process.exit(1);
}

const candidates = [];
const envPath = process.env.PHIDGET_DRIVER_INSTALLER;
if (envPath) {
  candidates.push(envPath);
}

const localDriversDir = path.join(__dirname, '..', 'drivers');
if (fs.existsSync(localDriversDir)) {
  const files = fs.readdirSync(localDriversDir);
  files.forEach((file) => {
    const full = path.join(localDriversDir, file);
    if (fs.statSync(full).isFile()) {
      candidates.push(full);
    }
  });
}

const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
const fallbackDirs = [
  path.join(programFiles, 'Phidgets', 'Phidget22'),
  path.join(programFiles, 'Phidgets'),
];
fallbackDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    return;
  }
  fs.readdirSync(dir).forEach((file) => {
    const full = path.join(dir, file);
    if (fs.statSync(full).isFile()) {
      candidates.push(full);
    }
  });
});

const driverPattern = /(driver|installer|setup|phidget)/i;
const allowedExt = new Set(['.exe', '.msi']);
const driverFile = candidates.find((file) => {
  const ext = path.extname(file).toLowerCase();
  return allowedExt.has(ext) && driverPattern.test(path.basename(file));
});

if (!driverFile || !fs.existsSync(driverFile)) {
  console.error('[driver] No Phidget driver installer found.');
  console.error('[driver] Provide it via:');
  console.error('  1) Set PHIDGET_DRIVER_INSTALLER to the installer path, or');
  console.error('  2) Put the installer in ./drivers/ (e.g. drivers/Phidget22Drivers.exe)');
  process.exit(1);
}

const target = path.join(distDir, path.basename(driverFile));
fs.copyFileSync(driverFile, target);
console.log(`[driver] Copied installer to ${target}`);
