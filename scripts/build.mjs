import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const input = path.join(root, 'app');
const output = path.join(root, 'dist');
const staging = path.join(root, `.dist-build-${process.pid}`);
if (!fs.statSync(path.join(input, 'index.html'), { throwIfNoEntry: false })?.isFile()) {
  throw new Error('app/index.html 缺失，未改动预览目录。');
}
try {
  fs.cpSync(input, staging, { recursive: true });
  fs.rmSync(output, { recursive: true, force: true });
  fs.renameSync(staging, output);
  console.log('已将 app/ 完整同步到 dist/。刷新本地预览即可查看。');
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
