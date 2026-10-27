import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const project = 'musical-puppy-local';
const root = fs.realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const siteRoot = path.join(root, 'dist');
const host = '127.0.0.1';
const port = 8773;
const address = `http://${host}:${port}/`;
const stateDirectory = path.join(root, '.local-preview');
const stateFile = path.join(stateDirectory, 'server.json');
const logFile = path.join(stateDirectory, 'server.log');
const errorLogFile = path.join(stateDirectory, 'server-error.log');
const lockDirectory = path.join(stateDirectory, 'lifecycle.lock');
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function expectedHealth(value) {
  let canonicalSiteRoot;
  try { canonicalSiteRoot = fs.realpathSync(siteRoot); } catch { return false; }
  return value?.project === project && value.root === root && value.siteRoot === canonicalSiteRoot
    && value.host === host && value.port === port && Number.isSafeInteger(value.pid)
    && value.pid > 1 && typeof value.instance === 'string' && value.instance.length > 0;
}

function readState() {
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return null; }
}

function stateMatches(health) {
  const saved = readState();
  return expectedHealth(saved) && saved.pid === health.pid && saved.instance === health.instance;
}

function requestHealth() {
  return new Promise(resolve => {
    const request = http.get({ host, port, path: '/__local_preview_health', timeout: 650 }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
        if (body.length > 16384) response.destroy();
      });
      response.on('end', () => {
        try { resolve(response.statusCode === 200 ? JSON.parse(body) : null); } catch { resolve(null); }
      });
      response.on('error', () => resolve(null));
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
  });
}

function portIsOpen() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(500);
    socket.on('connect', () => finish(true));
    socket.on('error', error => {
      if (error.code === 'EPERM' || error.code === 'EACCES') {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(new Error('当前执行环境未获准访问本地网络，无法检查预览服务。请允许本地网络访问后重试。'));
        return;
      }
      finish(error.code !== 'ECONNREFUSED');
    });
    socket.on('timeout', () => finish(true));
  });
}

async function inspect() {
  const health = await requestHealth();
  if (expectedHealth(health)) return { kind: 'running', health };
  if (await portIsOpen()) return { kind: 'occupied' };
  return { kind: 'stopped' };
}

function occupiedError() {
  return new Error(`端口 ${port} 已被其他服务占用，或健康检查的项目标识/目录不匹配。未停止任何进程，也未切换端口。`);
}

function printRunning(health, reused = false) {
  console.log(`${reused ? '已复用运行中的' : '正在运行'}本地预览：${address}`);
  console.log(`PID：${health.pid}`);
  console.log(`可编辑目录：${path.join(root, "app")}（编辑后运行 npm run build）`);
  console.log(`预览目录：${siteRoot}`);
  console.log(`运行日志：${logFile}`);
  console.log(`错误日志：${errorLogFile}`);
}

function processExists(pid) {
  if (!Number.isSafeInteger(pid) || pid < 2) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}

async function withLock(action) {
  fs.mkdirSync(stateDirectory, { recursive: true });
  try {
    fs.mkdirSync(lockDirectory);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let owner;
    try { owner = JSON.parse(fs.readFileSync(path.join(lockDirectory, 'owner.json'), 'utf8')); } catch {}
    if (!owner) {
      await delay(200);
      try { owner = JSON.parse(fs.readFileSync(path.join(lockDirectory, 'owner.json'), 'utf8')); } catch {}
    }
    if (owner && processExists(owner.pid)) throw new Error('另一个启动或停止操作正在执行，请稍后重试。');
    if (!owner && Date.now() - fs.statSync(lockDirectory).mtimeMs < 30000) {
      throw new Error('另一个启动或停止操作正在初始化，请稍后重试。');
    }
    fs.rmSync(lockDirectory, { recursive: true, force: true });
    fs.mkdirSync(lockDirectory);
  }
  fs.writeFileSync(path.join(lockDirectory, 'owner.json'), JSON.stringify({ pid: process.pid }));
  try { await action(); }
  finally { fs.rmSync(lockDirectory, { recursive: true, force: true }); }
}

async function start() {
  await withLock(async () => {
    const existing = await inspect();
    if (existing.kind === 'occupied') throw occupiedError();
    if (existing.kind === 'running') {
      if (!stateMatches(existing.health)) throw new Error('服务存在，但状态文件与健康检查不一致。请先检查日志和状态文件。未重复启动。');
      printRunning(existing.health, true);
      return;
    }
    if (!fs.statSync(siteRoot, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`站点目录不存在：${siteRoot}`);
    }
    if (!fs.statSync(path.join(siteRoot, 'index.html'), { throwIfNoEntry: false })?.isFile()) {
      throw new Error('dist/index.html 不存在，请先准备本地站点资源。');
    }
    const logDescriptor = fs.openSync(logFile, 'a', 0o600);
    const errorDescriptor = fs.openSync(errorLogFile, 'a', 0o600);
    let child;
    try {
      child = spawn(process.execPath, [path.join(root, 'scripts', 'serve.mjs')], {
        cwd: root,
        detached: true,
        stdio: ['ignore', logDescriptor, errorDescriptor],
      });
    } finally {
      fs.closeSync(logDescriptor);
      fs.closeSync(errorDescriptor);
    }
    let spawnError;
    let exitCode;
    child.on('error', error => { spawnError = error; });
    child.on('exit', code => { exitCode = code; });
    child.unref();
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      const health = await requestHealth();
      if (expectedHealth(health) && health.pid === child.pid && stateMatches(health)) {
        printRunning(health);
        return;
      }
      if (exitCode !== undefined) throw new Error(`服务启动失败（退出码 ${exitCode}）。请查看：${errorLogFile}`);
      await delay(150);
    }
    throw new Error(`服务未在 10 秒内通过项目和目录健康检查。请查看：${errorLogFile}`);
  });
}

async function stop() {
  await withLock(async () => {
    const current = await inspect();
    if (current.kind === 'occupied') throw occupiedError();
    if (current.kind === 'stopped') {
      console.log(`本地预览已停止（端口 ${port}）。`);
      return;
    }
    const health = current.health;
    if (!stateMatches(health)) {
      throw new Error('状态文件与健康检查的项目、目录、PID 或实例标识不一致。为避免误停止，未向任何进程发送信号。');
    }
    // Recheck immediately before signalling, so stale PID files cannot stop unrelated services.
    const verified = await requestHealth();
    if (!expectedHealth(verified) || verified.pid !== health.pid || verified.instance !== health.instance) {
      throw new Error('停止前健康检查发生变化，未向任何进程发送信号。');
    }
    try { process.kill(health.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const latest = await requestHealth();
      if (!expectedHealth(latest) || latest.instance !== health.instance) {
        if (!processExists(health.pid)) {
          const saved = readState();
          if (saved?.instance === health.instance) fs.unlinkSync(stateFile);
          console.log(`本地预览已停止（端口 ${port}）。`);
          return;
        }
      }
      await delay(150);
    }
    throw new Error(`进程尚未确认退出，请查看日志：${errorLogFile}。未强制停止进程。`);
  });
}

async function status() {
  const current = await inspect();
  if (current.kind === 'occupied') throw occupiedError();
  if (current.kind === 'stopped') console.log(`本地预览未运行（端口 ${port}）。`);
  else {
    printRunning(current.health);
    if (!stateMatches(current.health)) throw new Error('健康检查正常，但状态文件不匹配；停止操作将拒绝发送信号。');
  }
}

try {
  const command = process.argv[2];
  if (command === 'start') await start();
  else if (command === 'stop') await stop();
  else if (command === 'status') await status();
  else throw new Error('用法：node scripts/preview.mjs start|status|stop');
} catch (error) {
  console.error(`本地预览：${error.message}`);
  process.exitCode = 1;
}
