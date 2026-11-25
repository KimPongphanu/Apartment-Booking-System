'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.resolve(__dirname, '..', 'dist');
const PORT = Number(process.argv[2] || 3100);

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
    '/', '/login', '/register', '/available',
    '/available/A-type', '/available/B-type', '/available/C-type', '/available/D-type',
    '/status', '/profile', '/upload', '/dashboard'
];

function send(res, status, type, body) {
    res.writeHead(status, { 'Content-Type': type });
    res.end(body);
}

const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(String(req.url || '/').split('?')[0]);

    if (APP_ROUTES.includes(pathname) || /^\/(Book|dashboard\/dataroom)\/\d+$/.test(pathname)) {
        const index = path.join(DIST, 'app', 'index.html');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(index));
        return;
    }

    const file = path.resolve(DIST, '.' + pathname);
    if (!file.startsWith(DIST) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        send(res, 404, 'text/plain; charset=utf-8', 'not found: ' + pathname);
        return;
    }

    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`[dist] ${DIST}`);
    console.log(`[dist] http://localhost:${PORT}/`);
});
