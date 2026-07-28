import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = resolve(root, 'dist');
const distChrome = resolve(root, 'dist-chrome');

await rm(distChrome, { recursive: true, force: true });
await cp(dist, distChrome, { recursive: true });

const manifestPath = resolve(distChrome, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));

delete manifest.browser_specific_settings;

// Chrome requires "tabs" permission for tabs.query(); Firefox doesn't
if (!manifest.permissions.includes('tabs')) {
  manifest.permissions.unshift('tabs');
}

await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log('✅ Chrome build pronto em dist-chrome/');
