import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const project = 'musical-puppy-local';
const root = fs.realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const siteRoot = fs.realpathSync(path.join(root, 'dist'));
const host = '127.0.0.1';
const port = 8773;
const healthPath = '/__local_preview_health';
const netlifyHudPath = '/.netlify/scripts/hud';
const stateDirectory = path.join(root, '.local-preview');
const stateFile = path.join(stateDirectory, 'server.json');
const instance = randomUUID();
const health = {
  project,
  root,
  siteRoot,
  host,
  port,
  pid: process.pid,
  instance,
  startedAt: new Date().toISOString(),
};

const mimeTypes = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.zip': 'application/zip',
}));

function reply(response, status, message, method = 'GET', headers = {}) {
  const body = Buffer.from(message);
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  response.end(method === 'HEAD' ? undefined : body);
}

function fileStat(filename) {
  try {
    return fs.statSync(filename);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}

function insideSite(filename) {
  return filename === siteRoot || filename.startsWith(siteRoot + path.sep);
}

const server = http.createServer((request, response) => {
  const method = request.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    reply(response, 405, '仅支持 GET 和 HEAD。\n', method, { Allow: 'GET, HEAD' });
    return;
  }

  try {
    const requestTarget = request.url ?? '/';
    const separator = requestTarget.indexOf('?');
    const rawPath = separator === -1 ? requestTarget : requestTarget.slice(0, separator);
    const query = separator === -1 ? '' : requestTarget.slice(separator);
    let pathname;
    try {
      pathname = decodeURIComponent(rawPath);
    } catch {
      reply(response, 400, 'URL 编码无效。\n', method);
      return;
    }
    if (!pathname.startsWith('/') || pathname.includes('\0') || pathname.includes('\\')) {
      reply(response, 400, '请求路径无效。\n', method);
      return;
    }
    if (pathname !== netlifyHudPath && pathname.split('/').some(segment => segment.startsWith('.'))) {
      reply(response, 403, '禁止访问此路径。\n', method);
      return;
    }

    if (pathname === healthPath) {
      reply(response, 200, JSON.stringify(health) + '\n', method, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      return;
    }

    let filename = path.resolve(siteRoot, '.' + pathname);
    if (!insideSite(filename)) {
      reply(response, 403, '禁止访问此路径。\n', method);
      return;
    }
    let stat = fileStat(filename);
    if (stat?.isDirectory()) {
      if (!pathname.endsWith('/')) {
        reply(response, 301, '目录地址已补全。\n', method, {
          Location: encodeURI(pathname + '/').replace(/#/g, '%23').replace(/\?/g, '%3F') + query,
        });
        return;
      }
      filename = path.join(filename, 'index.html');
      stat = fileStat(filename);
    }
    if (!stat?.isFile()) {
      // Only page navigation can use the SPA entry; missing assets must remain 404.
      const extension = path.extname(pathname).toLowerCase();
      const accepts = request.headers.accept ?? '*/*';
      const pagePath = !extension || extension === '.html' || extension === '.htm';
      const resourcePath = pathname === netlifyHudPath || /^\/(?:assets|static|api|images|fonts|media)(?:\/|$)/i.test(pathname);
      const acceptsPage = accepts.includes('text/html') || accepts.includes('*/*');
      if (pagePath && acceptsPage && !resourcePath) {
        filename = path.join(siteRoot, 'index.html');
        stat = fileStat(filename);
      }
    }
    if (!stat?.isFile()) {
      reply(response, 404, '找不到该文件。\n', method);
      return;
    }
    const realFilename = fs.realpathSync(filename);
    if (!insideSite(realFilename)) {
      reply(response, 403, '禁止访问站点目录之外的文件。\n', method);
      return;
    }

    response.writeHead(200, {
      'Content-Type': pathname === netlifyHudPath
        ? 'text/javascript; charset=utf-8'
        : mimeTypes.get(path.extname(filename).toLowerCase()) ?? 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (method === 'HEAD') {
      response.end();
      return;
    }
    const stream = fs.createReadStream(realFilename);
    stream.on('error', error => {
      console.error('读取文件失败：', error.message);
      response.destroy(error);
    });
    request.on('aborted', () => stream.destroy());
    stream.pipe(response);
  } catch (error) {
    console.error('处理请求失败：', error.message);
    if (!response.headersSent) reply(response, 500, '读取本地资源失败。\n', method);
    else response.destroy(error);
  }
});

function removeOwnState() {
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (saved.instance === instance && saved.pid === process.pid) fs.unlinkSync(stateFile);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('清理状态文件失败：', error.message);
  }
}

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  console.log(`[${new Date().toISOString()}] 正在停止本地预览。`);
  server.close(() => {
    removeOwnState();
    process.exit(0);
  });
  server.closeIdleConnections?.();
  setTimeout(() => {
    removeOwnState();
    process.exit(0);
  }, 1500).unref();
}

process.on('SIGTERM', stop);
process.on('SIGINT', stop);
process.on('exit', removeOwnState);
server.on('error', error => {
  console.error(`[${new Date().toISOString()}] 启动失败：${error.message}`);
  process.exit(1);
});
server.listen({ host, port, exclusive: true }, () => {
  fs.mkdirSync(stateDirectory, { recursive: true });
  const temporaryState = `${stateFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryState, JSON.stringify(health, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporaryState, stateFile);
  console.log(`[${new Date().toISOString()}] ${project} 就绪：http://${host}:${port}/`);
  console.log(`站点目录：${siteRoot}`);
});
