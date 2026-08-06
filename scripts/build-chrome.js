import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = resolve(root, 'dist');
const distChrome = resolve(root, 'dist-chrome');
const release = resolve(root, 'release');

function normalizeEnvValue(value) {
  return value?.trim().replace(/^['"]|['"]$/g, '');
}

await rm(distChrome, { recursive: true, force: true });
await cp(dist, distChrome, { recursive: true });

const manifestPath = resolve(distChrome, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));

delete manifest.browser_specific_settings;

// Chrome requires "tabs" permission for tabs.query(); Firefox doesn't
if (!manifest.permissions.includes('tabs')) {
  manifest.permissions.unshift('tabs');
}

const env = loadEnv('production', root, 'VITE_');
const googleClientId = normalizeEnvValue(
  process.env.VITE_GOOGLE_CLIENT_ID ?? env.VITE_GOOGLE_CLIENT_ID,
);

if (!googleClientId || googleClientId.startsWith('YOUR_')) {
  throw new Error('VITE_GOOGLE_CLIENT_ID is required to build the Chrome extension');
}

manifest.oauth2 = {
  client_id: googleClientId,
  scopes: ['openid', 'email', 'profile'],
};

await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

const zipPath = resolve(release, `prismi-dashboard-v${manifest.version}-chrome.zip`);
await mkdir(release, { recursive: true });
await rm(zipPath, { force: true });

await new Promise((resolvePromise, reject) => {
  const command = process.platform === 'win32'
    ? resolve(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
    : 'zip';
  const args = process.platform === 'win32'
    ? ['-a', '-c', '-f', zipPath, '-C', distChrome, '*']
    : ['-qr', zipPath, '.'];
  const cwd = process.platform === 'win32' ? undefined : distChrome;
  const child = spawn(command, args, { cwd, stdio: 'inherit' });

  child.once('error', reject);
  child.once('exit', (code) => {
    if (code === 0) resolvePromise();
    else reject(new Error(`Failed to create Chrome ZIP (exit code ${code ?? 'unknown'})`));
  });
});

console.log(`✅ Chrome build pronto em dist-chrome/`);
console.log(`✅ Chrome ZIP pronto em ${zipPath}`);
