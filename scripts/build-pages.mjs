import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = path.join(root, 'dist');
const output = path.join(root, 'pages-dist');
const staging = path.join(root, `.pages-build-${process.pid}`);
const hudPath = '/.netlify/scripts/hud?variant=public';

if (!fs.existsSync(path.join(source, 'index.html'))) throw new Error('Run npm run build first.');
try {
  fs.cpSync(source, staging, { recursive: true });
  const indexPath = path.join(staging, 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  if (!html.includes(hudPath)) throw new Error('Expected the original Netlify HUD reference.');
  // Preserve the original badge while making its script portable to a Pages subpath.
  fs.copyFileSync(path.join(staging, '.netlify/scripts/hud'), path.join(staging, 'assets/netlify-hud.js'));
  fs.writeFileSync(indexPath, html.replace(hudPath, './assets/netlify-hud.js?variant=public'));
  fs.rmSync(path.join(staging, '.netlify'), { recursive: true, force: true });
  fs.rmSync(output, { recursive: true, force: true });
  fs.renameSync(staging, output);
  console.log('GitHub Pages artifact prepared in pages-dist/.');
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
