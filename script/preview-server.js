'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const APP_DIR = path.join(PUBLIC_DIR, 'app');
const VIEWS_DIR = path.join(ROOT, 'views');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const INDEX_FILE = path.join(APP_DIR, 'index.html');
const HOST = '127.0.0.1';
const PORT = Number(process.argv[2] || process.env.PORT || 3002);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.ejs': 'text/plain; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

const APP_ROUTES = [
    '/', '/login', '/register', '/logout',
    '/available', '/available/A-type', '/available/B-type', '/available/C-type', '/available/D-type',
    '/status', '/Book', '/profile', '/dashboard', '/upload',
    '/dashboard/logout', '/dashboard/dataroom'
];

function isInside(base, target) {
    const relative = path.relative(base, target);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function statFile(file) {
    try {
        const stat = fs.statSync(file);
        return stat.isFile() ? stat : null;
    } catch {
        return null;
    }
}

function send(res, status, contentType, body, extraHeaders) {
    res.writeHead(status, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...(extraHeaders || {})
    });
    res.end(body);
}

function sendFile(req, res, file, stat) {
    res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin': '*'
    });
    if (req.method === 'HEAD') {
        res.end();
        return;
    }
    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
}

function renderIndex(req, res) {
    const stat = statFile(INDEX_FILE);
    if (!stat) {
        send(res, 500, 'text/plain; charset=utf-8', 'missing app/index.html');
        return;
    }
    sendFile(req, res, INDEX_FILE, stat);
}

function isAppRoute(pathname) {
    if (APP_ROUTES.includes(pathname)) return true;
    if (/^\/(available\/[A-D]-type)$/.test(pathname)) return true;
    if (/^\/Book\/\d+$/.test(pathname)) return true;
    if (/^\/dashboard\/dataroom\/\d+$/.test(pathname)) return true;
    return false;
}

const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        send(res, 405, 'text/plain; charset=utf-8', 'Method not allowed', { Allow: 'GET, HEAD' });
        return;
    }

    let pathname;
    try {
        pathname = decodeURIComponent(String(req.url || '/').split('?')[0].split('#')[0]);
    } catch {
        send(res, 400, 'text/plain; charset=utf-8', 'Bad request');
        return;
    }

    if (pathname === '/app') {
        res.writeHead(301, { Location: '/app/' });
        res.end();
        return;
    }

    if (pathname.startsWith('/__views/')) {
        const rel = pathname.slice('/__views/'.length);
        const file = path.resolve(VIEWS_DIR, rel);
        if (!isInside(VIEWS_DIR, file)) {
            send(res, 403, 'text/plain; charset=utf-8', 'Forbidden');
            return;
        }
        const stat = statFile(file);
        if (!stat) {
            send(res, 404, 'text/plain; charset=utf-8', 'template not found: ' + rel);
            return;
        }
        sendFile(req, res, file, stat);
        return;
    }

    if (pathname.startsWith('/uploads/')) {
        const rel = pathname.slice('/uploads/'.length);
        const file = path.resolve(UPLOADS_DIR, rel);
        if (!isInside(UPLOADS_DIR, file)) {
            send(res, 403, 'text/plain; charset=utf-8', 'Forbidden');
            return;
        }
        const stat = statFile(file);
        if (!stat) {
            send(res, 404, 'text/plain; charset=utf-8', 'not found');
            return;
        }
        sendFile(req, res, file, stat);
        return;
    }

    if (pathname === '/app/' || pathname === '/app/index.html') {
        renderIndex(req, res);
        return;
    }

    if (isAppRoute(pathname)) {
        renderIndex(req, res);
        return;
    }

    const staticFile = path.resolve(PUBLIC_DIR, '.' + pathname);
    if (isInside(PUBLIC_DIR, staticFile)) {
        const stat = statFile(staticFile);
        if (stat) {
            sendFile(req, res, staticFile, stat);
            return;
        }
    }

    send(res, 404, 'text/html; charset=utf-8',
        `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><title>404</title>
<style>body{font-family:system-ui,sans-serif;background:#f5f5f2;color:#14211c;display:flex;
min-height:100vh;align-items:center;justify-content:center;margin:0}
.box{background:#fff;border:1px solid #e3e6e3;border-radius:14px;padding:32px 40px;max-width:520px}
h1{font-size:20px;margin:0 0 8px;color:#013220}p{margin:0 0 16px;color:#55635d;font-size:14px}
a{color:#996515;font-weight:600}code{background:#f3f4f0;padding:2px 6px;border-radius:5px;font-size:13px}
</style></head><body><div class="box"><h1>ไม่พบหน้าที่ร้องขอ</h1>
<p><code>${pathname}</code></p><p><a href="/">กลับไปหน้าแรก</a></p></div></body></html>`);
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`[preview] port ${PORT} is already in use. Try: node script/preview-server.js 3003`);
    } else {
        console.error('[preview] server error:', error.message);
    }
    process.exit(1);
});

server.listen(PORT, HOST, () => {
    console.log(`[preview] views   : ${VIEWS_DIR} (served read-only as-is)`);
    console.log(`[preview] app     : ${APP_DIR}`);
    console.log(`[preview] database: none (localStorage only)`);
    console.log(`[preview] url     : http://localhost:${PORT}/`);
});
