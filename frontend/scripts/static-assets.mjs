// Static (GitHub Pages) build helpers: before the build copy the claim book into public/data so the browser can
// fetch it; after the build copy index.html to 404.html so deep links (/queue, /?scenario=…) survive a full reload.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
if (process.argv.includes('--post')) {
  fs.copyFileSync(path.join(root, 'dist', 'index.html'), path.join(root, 'dist', '404.html'));
  console.log('[static] dist/404.html written');
} else {
  fs.mkdirSync(path.join(root, 'public', 'data'), { recursive: true });
  fs.copyFileSync(path.join(root, '..', 'backend', 'data', 'claims.json'), path.join(root, 'public', 'data', 'claims.json'));
  const ev = path.join(root, '..', 'backend', 'data', 'evaluation.json');
  if (fs.existsSync(ev)) fs.copyFileSync(ev, path.join(root, 'public', 'data', 'evaluation.json'));
  console.log('[static] public/data/claims.json' + (fs.existsSync(ev) ? ' + evaluation.json' : '') + ' copied');
}
