import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'RESOURCE-MANIFEST.json'), 'utf8'));
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(path.join(dir, item.name)) : [path.join(dir, item.name)]);
const assert = (ok, message) => { if (!ok) throw new Error(message); };
assert(!manifest.unavailable.length, '仍有引用资源未下载');
for (const row of manifest.files) {
  const data = fs.readFileSync(path.join(root, row.local));
  assert(data.length === row.bytes && hash(data) === row.sha256, `原始快照已变化：${row.local}`);
}
const appFiles = files(path.join(root, 'app'));
const distFiles = files(path.join(root, 'dist'));
assert(appFiles.length === distFiles.length, 'app 与 dist 文件数不一致，请运行 npm run build');
for (const file of appFiles) {
  const rel = path.relative(path.join(root, 'app'), file);
  assert(hash(fs.readFileSync(file)) === hash(fs.readFileSync(path.join(root, 'dist', rel))), `预览未更新：${rel}`);
  if (/\.(?:m?js)$/.test(file) || rel === '.netlify/scripts/hud') execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  if (/\.(?:m?js)$/.test(file)) {
    assert(!/\b(?:jsx|jsxs)\(\s*["']select["']/.test(fs.readFileSync(file, 'utf8')),
      `发现未统一的原生下拉框：${rel}，请复用 NativeSelect/共享下拉组件。`);
    assert(!/className:\s*["']talent-search-field(?:\s|["'])/.test(fs.readFileSync(file, 'utf8')),
      `发现旧的独立搜索框：${rel}，请复用共享 SearchField/SearchActions。`);
  }
}
if (process.argv.includes('--origin')) {
  assert(appFiles.length === manifest.files.length, '编辑副本文件数与原始快照不同');
  for (const row of manifest.files) {
    const rel = row.local.slice('source/'.length);
    assert(hash(fs.readFileSync(path.join(root, 'app', rel))) === row.sha256, `编辑副本与原站不同：${rel}`);
  }
  console.log(`原站一致性通过：${manifest.files.length} 个文件字节完全相同。`);
}
console.log(`检查通过：${manifest.files.length} 个原始资源校验、脚本语法、app/dist 一致性。`);
if (process.argv.includes('--http')) {
  const base = 'http://127.0.0.1:8773';
  for (const file of appFiles) {
    const rel = path.relative(path.join(root, 'app'), file);
    const resourcePath = rel === 'index.html' ? '/' : '/' + rel.split(path.sep).join('/');
    const response = await fetch(base + resourcePath);
    assert(response.status === 200, `资源 HTTP ${response.status}：${resourcePath}`);
    assert(hash(Buffer.from(await response.arrayBuffer())) === hash(fs.readFileSync(path.join(root, 'dist', rel))), `HTTP 内容不符：${resourcePath}`);
    if (resourcePath.includes('/hud') || /\.m?js$/.test(rel)) assert(response.headers.get('content-type').includes('javascript'), `脚本 MIME 类型不正确：${resourcePath}`);
    if (rel.endsWith('.css')) assert(response.headers.get('content-type').includes('text/css'), `样式 MIME 类型不正确：${resourcePath}`);
  }
  for (const resource of ['/assets/missing.js', '/assets/missing.png', '/assets/missing', '/api/missing']) {
    assert((await fetch(base + resource)).status === 404, `缺失资源不应回退至HTML：${resource}`);
  }
  assert((await fetch(base + '/.env')).status === 403, '隐藏文件应禁止访问');
  assert((await fetch(base + '/preview-navigation', { headers: { Accept: 'text/html' } })).status === 200, 'SPA 回退失败');
  const health = await (await fetch(base + '/__local_preview_health')).json();
  assert(health.project === 'musical-puppy-local' && health.port === 8773, '服务身份不匹配');
  console.log(`HTTP 检查通过：${appFiles.length} 个当前文件、MIME、404、隐藏文件保护、SPA 回退及服务身份。`);
}
