const fs = require('fs');
const path = require('path');

const exeName = process.platform === 'win32' ? 'server.exe' : 'server';
const exePath = path.join(__dirname, '..', 'backend', exeName);

if (!fs.existsSync(exePath)) {
  console.error(`[build] Missing backend executable: ${exePath}`);
  console.error('[build] Run: npm run build:backend');
  process.exit(1);
}

console.log(`[build] Backend executable found: ${exePath}`);
