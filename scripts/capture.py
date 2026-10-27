#!/usr/bin/env python3
"""Capture referenced public deployment files without altering their bytes."""
import concurrent.futures
import hashlib
import json
import pathlib
import re
import subprocess
import tempfile
import sys
import urllib.parse
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
ORIGIN = 'https://musical-puppy-d5bee5.netlify.app'
SOURCE = ROOT / 'source'
MANIFEST = ROOT / 'RESOURCE-MANIFEST.json'
TEXT_EXT = {'.html', '.js', '.mjs', '.css', '.svg', '.json', '.webmanifest'}
ASSET_EXT = TEXT_EXT | {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.pdf', '.mp4', '.webm', '.mp3', '.wav', '.wasm'}
QUOTED = re.compile(r'''["'`]([^"'`\s<>]+)["'`]''')
CSS_URL = re.compile(r'''url\(\s*["']?([^\s"')]+)''')

def references(url, text):
    found = set()
    for ref in [*QUOTED.findall(text), *CSS_URL.findall(text)]:
        if '${' in ref or ref.startswith(('data:', 'blob:', '#')):
            continue
        if not ref.startswith(('/', './', '../', 'https://', 'http://', '//')):
            continue
        # These are DOM src strings in the bundle, resolved against index.html.
        base = ORIGIN + '/' if ref.startswith('./assets/') else url
        target = urllib.parse.urlsplit(urllib.parse.urljoin(base, ref))
        if target.netloc != urllib.parse.urlsplit(ORIGIN).netloc:
            continue
        if pathlib.PurePosixPath(target.path).suffix.lower() in ASSET_EXT or target.path == '/.netlify/scripts/hud':
            found.add(target.path + ('?' + target.query if target.query else ''))
    return found

def download(path):
    local_path = urllib.parse.urlsplit(path).path
    relative = 'index.html' if local_path == '/' else local_path.lstrip('/')
    if '..' in pathlib.PurePosixPath(relative).parts:
        raise ValueError('Unsafe path')
    dest = SOURCE / relative
    dest.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='musical-capture-') as temp:
        body, headers = pathlib.Path(temp)/'body', pathlib.Path(temp)/'headers'
        url = ORIGIN + urllib.parse.quote(path, safe='/@:-._~%?=&')
        command = ['curl', '-fLsS', '--retry', '3', '--retry-all-errors', '--retry-delay', '1', '--connect-timeout', '20', '--max-time', '90', '-D', str(headers), url, '-o', str(body)]
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode:
            return None, set(), {'path': path, 'error': result.stderr.strip()}
        data = body.read_bytes()
        header_text = headers.read_text(errors='replace')
        types = re.findall(r'^content-type:\s*(.+)', header_text, re.I | re.M)
        content_type = types[-1].strip() if types else ''
        if path != '/' and 'text/html' in content_type and pathlib.PurePosixPath(local_path).suffix != '.html':
            return None, set(), {'path': path, 'error': 'HTML fallback returned instead of the requested resource'}
        dest.write_bytes(data)
        row = {'path': path, 'local': str(dest.relative_to(ROOT)), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'content_type': content_type, 'url': url}
        is_text = path == '/' or pathlib.PurePosixPath(local_path).suffix.lower() in TEXT_EXT or 'javascript' in content_type
        refs = references(url, data.decode('utf-8', errors='replace')) if is_text else set()
        return row, refs, None

def main():
    resume = '--resume' in sys.argv
    if not resume and (MANIFEST.exists() or (SOURCE.exists() and any(SOURCE.rglob('*')))):
        raise SystemExit('已有原始快照，拒绝覆盖。请使用新目录重新采集。')
    SOURCE.mkdir(exist_ok=True)
    pending, seen, files, unavailable = {'/'}, set(), [], []
    if resume:
        prior = json.loads(MANIFEST.read_text())
        files = prior['files']
        for row in files:
            data = (ROOT / row['local']).read_bytes()
            if hashlib.sha256(data).hexdigest() != row['sha256']:
                raise SystemExit('原始快照校验失败，停止补充。')
            seen.add(row['path'])
            if row['path'] == '/' or pathlib.PurePosixPath(row['path']).suffix.lower() in TEXT_EXT or 'javascript' in row['content_type']:
                pending.update(references(row['url'], data.decode('utf-8', errors='replace')))
    while pending:
        batch = sorted(pending - seen)
        if not batch:
            break
        pending = set()
        seen.update(batch)
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            for row, refs, failure in pool.map(download, batch):
                if row:
                    files.append(row)
                    pending.update(refs - seen)
                if failure:
                    unavailable.append(failure)
        print(json.dumps({'captured': len(files), 'pending': len(pending), 'unavailable': len(unavailable)}, ensure_ascii=False), flush=True)
    manifest = {'origin': ORIGIN, 'entry': '/', 'captured_at': datetime.now(timezone.utc).isoformat(), 'scope': 'All same-origin public resources referenced recursively by the deployed HTML, scripts and CSS; bytes preserved.', 'files': sorted(files, key=lambda row: row['path']), 'unavailable': unavailable}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'files': len(files), 'bytes': sum(row['bytes'] for row in files), 'unavailable': unavailable}, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    main()
