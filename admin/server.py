#!/usr/bin/env python3
"""WRPedia local admin: serves the project, saves data/schedule.js and data/players.js,
and publishes the site to Netlify (data release: bumps the third version digit).

Run from the project root:  python3 admin/server.py   then open http://127.0.0.1:8770/admin/
Listens on 127.0.0.1 only. admin/ is never copied to dist/ by tools/build-site.js.
Standard library only; works with Python 3.8+.
"""
import argparse
import hashlib
import http.server
import json
import os
import re
import shutil
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
BACKUP_DIR = ROOT / 'admin' / 'backups'
KEEP_BACKUPS = 40
MAX_BODY = 20 * 1024 * 1024
DATA_FILES = {
    'schedule': (ROOT / 'data' / 'schedule.js', 'window.WR_LEAGUE = '),
    'players': (ROOT / 'data' / 'players.js', 'window.WR_PLAYERS = '),
}
# Players are written first: a schedule save may reference a player added in the same request.
WRITE_ORDER = ('players', 'schedule')
write_lock = threading.Lock()


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def digest(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def split_text(text, marker, label):
    """Return (header comment, parsed value) for a "window.X = <json>;" data file."""
    if text.startswith(marker):
        start = 0
    else:
        start = text.find('\n' + marker)
        if start < 0:
            raise ApiError(500, '%s 中找不到 %s' % (label, marker.strip()))
        start += 1
    body = text[start + len(marker):].rstrip()
    if not body.endswith(';'):
        raise ApiError(500, '%s 结尾缺少分号' % label)
    try:
        return text[:start], json.loads(body[:-1])
    except ValueError as error:
        raise ApiError(500, '%s 不是有效 JSON：%s' % (label, error))


def split_data_file(name):
    """Return (header comment, parsed value, hash). The header is kept verbatim on save."""
    path, marker = DATA_FILES[name]
    text = path.read_text(encoding='utf-8')
    header, value = split_text(text, marker, path.name)
    return header, value, digest(text)


def serialize(name, header, value):
    # Same layout as JSON.stringify(value, null, 2), so unchanged records stay byte-identical.
    return header + DATA_FILES[name][1] + json.dumps(value, ensure_ascii=False, indent=2) + ';\n'


def check_shape(name, value):
    if name == 'schedule':
        if not isinstance(value, dict) or not isinstance(value.get('teams'), list) or not isinstance(value.get('rounds'), list):
            raise ApiError(400, '赛程数据缺少 teams / rounds')
        for round_ in value['rounds']:
            if not isinstance(round_, dict) or not isinstance(round_.get('matches'), list):
                raise ApiError(400, '赛程轮次格式错误')
            for match in round_['matches']:
                if not isinstance(match, dict) or not isinstance(match.get('games'), list):
                    raise ApiError(400, '比赛格式错误')
    else:
        if not isinstance(value, list):
            raise ApiError(400, '选手数据必须是数组')
        ids = set()
        for player in value:
            if not isinstance(player, dict) or not all(isinstance(player.get(k), str) and player.get(k) for k in ('id', 'teamId', 'name', 'role')):
                raise ApiError(400, '选手记录缺少 id / teamId / name / role')
            key = player['id'].lower()
            if key in ids:
                raise ApiError(400, '选手 ID 重复：%s' % player['id'])
            ids.add(key)


def backup(name, text):
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime('%Y%m%d-%H%M%S')
    target = BACKUP_DIR / ('%s-%s.js' % (name, stamp))
    counter = 1
    while target.exists():
        counter += 1
        target = BACKUP_DIR / ('%s-%s-%d.js' % (name, stamp, counter))
    target.write_text(text, encoding='utf-8')
    old = sorted(BACKUP_DIR.glob(name + '-*.js'))
    for stale in old[:-KEEP_BACKUPS]:
        stale.unlink()
    return target.relative_to(ROOT).as_posix()


def write_atomic(path, text):
    temp = path.with_name(path.name + '.tmp')
    temp.write_text(text, encoding='utf-8')
    os.replace(temp, path)


def save(payload):
    if not isinstance(payload, dict) or not any(name in payload for name in DATA_FILES):
        raise ApiError(400, '没有需要保存的数据')
    with write_lock:
        pending = []
        for name in WRITE_ORDER:
            if name not in payload:
                continue
            entry = payload[name]
            if not isinstance(entry, dict) or 'value' not in entry:
                raise ApiError(400, '%s 缺少 value' % name)
            check_shape(name, entry['value'])
            header, _, current = split_data_file(name)
            if entry.get('hash') != current:
                raise ApiError(409, '%s 已在别处被修改，请重新载入后再保存' % DATA_FILES[name][0].name)
            pending.append((name, header, entry['value']))
        result = {}
        for name, header, value in pending:
            path = DATA_FILES[name][0]
            old_text = path.read_text(encoding='utf-8')
            new_text = serialize(name, header, value)
            if new_text == old_text:
                result[name] = {'hash': digest(new_text), 'changed': False}
                continue
            saved_backup = backup(name, old_text)
            write_atomic(path, new_text)
            result[name] = {'hash': digest(new_text), 'changed': True, 'backup': saved_backup}
        return result


# ---------- publishing (same result as `node tools/build-site.js` + `netlify deploy --dir=dist --no-build --prod`) ----------
NETLIFY_API = os.environ.get('NETLIFY_API_URL', 'https://api.netlify.com/api/v1').rstrip('/')
SITE_FILE = ROOT / 'data' / 'site.js'
CHANGELOG = ROOT / 'CHANGELOG.md'
README = ROOT / 'README.md'
DIST = ROOT / 'dist'
VERSION_RE = re.compile(r"version:\s*'(\d+)\.(\d+)\.(\d+)'")
RELEASED_RE = re.compile(r"releasedAt:\s*'([^']*)'")
DEPLOY_TIMEOUT = 180


def netlify_credentials():
    """Token from NETLIFY_AUTH_TOKEN or the Netlify CLI login; site from NETLIFY_SITE_ID or .netlify/state.json."""
    token, source = os.environ.get('NETLIFY_AUTH_TOKEN'), '环境变量 NETLIFY_AUTH_TOKEN'
    if not token:
        home = Path.home()
        for path in (home / 'Library' / 'Preferences' / 'netlify' / 'config.json',
                     Path(os.environ.get('APPDATA', home)) / 'netlify' / 'Config' / 'config.json',
                     Path(os.environ.get('XDG_CONFIG_HOME', home / '.config')) / 'netlify' / 'config.json'):
            try:
                config = json.loads(path.read_text(encoding='utf-8'))
            except (OSError, ValueError):
                continue
            user = (config.get('users') or {}).get(config.get('userId')) or {}
            token = (user.get('auth') or {}).get('token')
            if token:
                source = 'Netlify CLI 登录' + ('（%s）' % user['email'] if user.get('email') else '')
                break
    site = os.environ.get('NETLIFY_SITE_ID')
    if not site:
        try:
            site = json.loads((ROOT / '.netlify' / 'state.json').read_text(encoding='utf-8')).get('siteId')
        except (OSError, ValueError):
            site = None
    if not token:
        raise ApiError(400, '找不到 Netlify 登录：请先运行一次 netlify login，或设置环境变量 NETLIFY_AUTH_TOKEN')
    if not site:
        raise ApiError(400, '找不到站点 ID：.netlify/state.json 缺失，可设置环境变量 NETLIFY_SITE_ID')
    return token, site, source


def http_request(method, url, token=None, body=None, data=None, timeout=60):
    headers = {'User-Agent': 'WRPedia-admin'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if body is not None:
        data = json.dumps(body).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    elif data is not None:
        headers['Content-Type'] = 'application/octet-stream'
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode('utf-8', 'replace')[:300]
        raise ApiError(502, '%s %s 失败（HTTP %d）：%s' % (method, url.split('?')[0], error.code, detail))
    except (urllib.error.URLError, OSError) as error:
        raise ApiError(502, '无法连接 %s：%s' % (urlsplit(url).netloc, getattr(error, 'reason', error)))


def netlify(method, path, token, body=None, data=None):
    raw = http_request(method, NETLIFY_API + path, token, body, data)
    return json.loads(raw.decode('utf-8')) if raw.strip() else {}


def build_layout():
    """Read the page and directory lists from tools/build-site.js so both builders stay identical."""
    text = (ROOT / 'tools' / 'build-site.js').read_text(encoding='utf-8')
    pages = re.search(r'const pages = \[([^\]]*)\]', text)
    dirs = re.search(r'for \(const directory of \[([^\]]*)\]\)', text)
    if not pages or not dirs:
        raise ApiError(500, '无法从 tools/build-site.js 读取页面列表')
    return re.findall(r"'([^']+)'", pages.group(1)), re.findall(r"'([^']+)'", dirs.group(1))


def source_files():
    """{published path: source file}: what dist/ will contain, plus netlify.toml (uploaded by the CLI too)."""
    pages, dirs = build_layout()
    files = {'/' + page: ROOT / page for page in pages}
    for directory in dirs:
        for current, subdirs, names in os.walk(ROOT / directory):
            subdirs[:] = sorted(d for d in subdirs if not d.startswith('.'))
            for name in sorted(names):
                if not name.startswith('.'):
                    full = Path(current) / name
                    files['/' + full.relative_to(ROOT).as_posix()] = full
    if (ROOT / 'netlify.toml').exists():
        files['/netlify.toml'] = ROOT / 'netlify.toml'
    return files


def build_dist():
    pages, dirs = build_layout()
    shutil.rmtree(DIST, ignore_errors=True)
    DIST.mkdir(parents=True)
    for page in pages:
        shutil.copy2(ROOT / page, DIST / page)
    for directory in dirs:
        shutil.copytree(ROOT / directory, DIST / directory, ignore=lambda _, names: [n for n in names if n.startswith('.')])


def sha1(path):
    return hashlib.sha1(path.read_bytes()).hexdigest()


def read_version(text):
    match = VERSION_RE.search(text)
    if not match:
        raise ApiError(500, 'data/site.js 中找不到版本号')
    released = RELEASED_RE.search(text)
    return '.'.join(match.groups()), released.group(1) if released else ''


def next_version(version, kind='data'):
    """Version rule: data updates bump the third digit, feature updates bump the second and reset the third."""
    major, minor, patch = (int(x) for x in version.split('.'))
    return '%d.%d.0' % (major, minor + 1) if kind == 'feature' else '%d.%d.%d' % (major, minor, patch + 1)


def site_info(token, site):
    info = netlify('GET', '/sites/' + site, token)
    return {'name': info.get('name'), 'url': (info.get('ssl_url') or info.get('url') or '').rstrip('/'), 'account': info.get('account_slug')}


def live_text(url, path):
    return http_request('GET', '%s/%s?admin=%d' % (url, path, time.time() * 1000), timeout=30).decode('utf-8')


def publish_status():
    token, site, source = netlify_credentials()
    info = site_info(token, site)
    local_version, local_date = read_version(SITE_FILE.read_text(encoding='utf-8'))
    live = {'error': None}
    try:
        live['version'], live['releasedAt'] = read_version(live_text(info['url'], 'data/site.js'))
        live['schedule'] = split_text(live_text(info['url'], 'data/schedule.js'), DATA_FILES['schedule'][1], '公网 schedule.js')[1]
        live['players'] = split_text(live_text(info['url'], 'data/players.js'), DATA_FILES['players'][1], '公网 players.js')[1]
    except ApiError as error:
        live['error'] = str(error)
    # Netlify stores deploy paths lowercased; netlify.toml is uploaded in the CLI's normalized form, so skip it.
    remote = {f['id'].lower(): f['sha'] for f in netlify('GET', '/sites/%s/files' % site, token)}
    local = {path: sha1(file) for path, file in source_files().items() if path != '/netlify.toml'}
    changed = sorted(path for path, digest_ in local.items() if remote.get(path.lower()) != digest_)
    lowered = {path.lower() for path in local}
    removed = sorted(path for path in remote if path not in lowered and path != '/netlify.toml')
    hashes = {name: split_data_file(name)[2] for name in DATA_FILES}
    return {'site': info, 'auth': source, 'local': {'version': local_version, 'releasedAt': local_date},
            'next': next_version(local_version), 'nextFeature': next_version(local_version, 'feature'), 'live': live, 'changed': changed, 'removed': removed, 'hashes': hashes}


def release_files(version, today, notes):
    """New text for site.js, CHANGELOG.md and README.md (README only if it states the version)."""
    site_text = SITE_FILE.read_text(encoding='utf-8')
    site_text = VERSION_RE.sub("version: '%s'" % version, site_text, count=1)
    site_text = RELEASED_RE.sub("releasedAt: '%s'" % today, site_text, count=1)
    entry = '## V%s — %s\n\n%s\n\n' % (version, today, '\n'.join('- ' + line for line in notes))
    log = CHANGELOG.read_text(encoding='utf-8') if CHANGELOG.exists() else '# 更新记录\n\n'
    head = re.match(r'# [^\n]*\n\n', log)
    log = log[:head.end()] + entry + log[head.end():] if head else '# 更新记录\n\n' + entry + log
    out = {SITE_FILE: site_text, CHANGELOG: log}
    if README.exists():
        readme = README.read_text(encoding='utf-8')
        updated = re.sub(r'当前网站版本：\*\*V[\d.]+\*\*', '当前网站版本：**V%s**' % version, readme, count=1)
        if updated != readme:
            out[README] = updated
    return out


def publish(payload):
    notes = [str(line).strip().lstrip('-').strip() for line in payload.get('notes') or [] if str(line).strip()]
    if not notes:
        raise ApiError(400, '请填写更新说明')
    token, site, _ = netlify_credentials()
    with write_lock:
        for name in DATA_FILES:
            if (payload.get('hashes') or {}).get(name) != split_data_file(name)[2]:
                raise ApiError(409, '数据在打开发布页后有变化，请刷新发布页后重新确认')
        current, _ = read_version(SITE_FILE.read_text(encoding='utf-8'))
        kind = payload.get('kind', 'data')
        if kind not in ('data', 'feature'):
            raise ApiError(400, '未知的版本类型')
        version = next_version(current, kind)
        if payload.get('version') != version:
            raise ApiError(409, '版本号已变为 V%s，请刷新发布页' % current)
        info = site_info(token, site)
        today = time.strftime('%Y-%m-%d')
        originals = {path: path.read_text(encoding='utf-8') for path in (SITE_FILE, CHANGELOG, README) if path.exists()}
        title = 'WRPedia V%s: %s' % (version, notes[0])
        started = time.time()
        uploaded = False
        try:
            for path, text in release_files(version, today, notes).items():
                write_atomic(path, text)
            build_dist()
            files = {'/' + f.relative_to(DIST).as_posix(): f for f in sorted(DIST.rglob('*')) if f.is_file()}
            if (ROOT / 'netlify.toml').exists():
                files['/netlify.toml'] = ROOT / 'netlify.toml'  # headers config, as the CLI uploads it
            digests = {path: sha1(file) for path, file in files.items()}
            log('发布 V%s：%d 个文件，创建部署…' % (version, len(files)))
            deploy = netlify('POST', '/sites/%s/deploys' % site, token, {'files': digests, 'draft': False, 'title': title})
            required = set(deploy.get('required') or [])
            sent = set()
            for path, digest_ in digests.items():
                if digest_ in required and digest_ not in sent:
                    netlify('PUT', '/deploys/%s/files/%s' % (deploy['id'], quote(path.lstrip('/'))), token, data=files[path].read_bytes())
                    sent.add(digest_)
                    log('  已上传 %s' % path)
            uploaded = True
            state = deploy.get('state')
            while state not in ('ready', 'error') and time.time() - started < DEPLOY_TIMEOUT:
                time.sleep(1.5)
                deploy = netlify('GET', '/deploys/%s' % deploy['id'], token)
                state = deploy.get('state')
            if state == 'error':
                uploaded = False  # Nothing went live: roll the version back.
                raise ApiError(502, 'Netlify 部署失败：%s' % (deploy.get('error_message') or '未知错误'))
        except Exception:
            if not uploaded:
                for path, text in originals.items():
                    write_atomic(path, text)
                log('发布失败，已恢复版本号 V%s' % current)
            raise
        verified = False
        if state == 'ready':
            for _ in range(8):
                try:
                    if read_version(live_text(info['url'], 'data/site.js'))[0] == version:
                        verified = True
                        break
                except ApiError:
                    pass
                time.sleep(1)
        log('发布 V%s：%s，上传 %d 个文件%s' % (version, state, len(sent), '，公网已确认' if verified else ''))
        return {'version': version, 'releasedAt': today, 'state': state, 'verified': verified, 'uploaded': sorted(
            p for p, d in digests.items() if d in sent), 'deployId': deploy.get('id'), 'url': info['url'],
            'seconds': round(time.time() - started, 1)}


def log(message):
    sys.stderr.write('[%s] %s\n' % (time.strftime('%H:%M:%S'), message))
    sys.stderr.flush()


class Handler(http.server.SimpleHTTPRequestHandler):
    server_version = 'WRPediaAdmin/1.0'
    # Explicit types: some Windows registries map .js to text/plain.
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map, **{
        '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8'})

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_request(self, code='-', size='-'):
        # Static files are noisy (one request per champion icon); only log API calls and failures.
        if self.path.startswith('/api/') or str(getattr(code, 'value', code))[:1] in '45':
            super().log_request(code, size)

    def host_allowed(self):
        port = self.server.server_address[1]
        return self.headers.get('Host', '') in ('127.0.0.1:%d' % port, 'localhost:%d' % port)

    def send_json(self, status, value):
        data = json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if not self.host_allowed():
            return self.send_error(403)
        path = urlsplit(self.path).path
        if path == '/api/data':
            try:
                body = {}
                for name in DATA_FILES:
                    _, value, hashed = split_data_file(name)
                    body[name] = {'value': value, 'hash': hashed}
                return self.send_json(200, body)
            except ApiError as error:
                return self.send_json(error.status, {'error': str(error)})
        if path == '/api/publish/status':
            # Uses the Netlify token server-side; the token itself is never sent to the page.
            if self.headers.get('X-WRPedia-Admin') != '1':
                return self.send_json(403, {'error': '拒绝的请求'})
            try:
                return self.send_json(200, publish_status())
            except ApiError as error:
                return self.send_json(error.status, {'error': str(error)})
        parts = [p for p in unquote(path).split('/') if p]
        if any(p.startswith('.') for p in parts) or parts[:2] == ['admin', 'backups']:
            return self.send_error(404)
        if path in ('/', ''):
            self.send_response(302)
            self.send_header('Location', '/admin/')
            return self.end_headers()
        return super().do_GET()

    def do_POST(self):
        # Reject cross-site requests: a page on another origin cannot set this header without a preflight we never answer.
        port = self.server.server_address[1]
        origin = self.headers.get('Origin')
        if (not self.host_allowed() or self.headers.get('X-WRPedia-Admin') != '1'
                or (origin and origin not in ('http://127.0.0.1:%d' % port, 'http://localhost:%d' % port))
                or not self.headers.get('Content-Type', '').startswith('application/json')):
            return self.send_json(403, {'error': '拒绝的请求'})
        handler = {'/api/save': save, '/api/publish': publish}.get(urlsplit(self.path).path)
        if not handler:
            return self.send_json(404, {'error': '未知接口'})
        try:
            length = int(self.headers.get('Content-Length') or 0)
            if length <= 0 or length > MAX_BODY:
                raise ApiError(413, '请求体大小异常')
            payload = json.loads(self.rfile.read(length).decode('utf-8'))
            return self.send_json(200, handler(payload))
        except ApiError as error:
            return self.send_json(error.status, {'error': str(error)})
        except ValueError as error:
            return self.send_json(400, {'error': '无效 JSON：%s' % error})
        except Exception as error:  # e.g. disk errors while building dist/
            log('请求失败：%r' % error)
            return self.send_json(500, {'error': '%s：%s' % (type(error).__name__, error)})


def main():
    parser = argparse.ArgumentParser(description='WRPedia 本地录入后台')
    parser.add_argument('--port', type=int, default=8770)
    parser.add_argument('--no-browser', action='store_true', help='不要自动打开浏览器')
    args = parser.parse_args()
    for name in DATA_FILES:
        split_data_file(name)  # Fail fast if a data file cannot be parsed.
    try:
        httpd = http.server.ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    except OSError as error:
        sys.exit('端口 %d 无法使用（%s）。可改用：python3 admin/server.py --port 8771' % (args.port, error))
    url = 'http://127.0.0.1:%d/admin/' % args.port
    print('WRPedia 后台已启动：%s' % url)
    print('数据目录：%s' % (ROOT / 'data'))
    print('按 Ctrl+C 停止。')
    if not args.no_browser:
        threading.Timer(0.6, webbrowser.open, (url,)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止。')


if __name__ == '__main__':
    main()
