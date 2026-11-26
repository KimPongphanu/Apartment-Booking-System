'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const MAX_FILE_BYTES = 4 * 1024 * 1024;

// Folders that are referenced by no view or script in this project.
const SKIP_PATHS = [
    path.join('public', 'images', 'view'),
    path.join('public', 'images', 'login')
];

// Only the room photos seeded into images2 are reachable from the app.
const UPLOAD_WHITELIST = new Set([
    'image-1728572453126.png',
    'image-1728572723747.png',
    'image-1728572732127.png',
    'image-1728573081732.png',
    'image-1728589203874.jpg',
    'image-1728589245968.jpg',
    'image-1728589266011.jpg',
    'image-1728622379689.png',
    'image-1728623771380.png',
    'image-1728633837706.png'
]);

const COPIES = [
    { from: path.join(ROOT, 'public'), to: DIST },
    { from: path.join(ROOT, 'views'), to: path.join(DIST, '__views') },
    { from: path.join(ROOT, 'uploads'), to: path.join(DIST, 'uploads') }
];

const stats = { copied: 0, skippedSize: 0, skippedUnused: 0, bytes: 0 };

function shouldSkip(absolute) {
    const relative = path.relative(ROOT, absolute);
    return SKIP_PATHS.some((skip) => relative.startsWith(skip));
}

function isUploadsDir(absolute) {
    return path.relative(ROOT, absolute) === path.join('uploads');
}

function copyDir(from, to) {
    if (!fs.existsSync(from)) {
        console.log(`[build] skip (missing): ${path.relative(ROOT, from)}`);
        return;
    }

    fs.mkdirSync(to, { recursive: true });

    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const source = path.join(from, entry.name);
        const target = path.join(to, entry.name);

        if (entry.isDirectory()) {
            if (shouldSkip(source)) {
                const count = fs.readdirSync(source, { withFileTypes: true }).length;
                stats.skippedUnused += count;
                console.log(`[build] skip (unused): ${path.relative(ROOT, source)}`);
                continue;
            }
            copyDir(source, target);
            continue;
        }

        if (!entry.isFile()) continue;

        if (isUploadsDir(from) && !UPLOAD_WHITELIST.has(entry.name)) {
            stats.skippedUnused += 1;
            continue;
        }

        const size = fs.statSync(source).size;
        if (size > MAX_FILE_BYTES) {
            stats.skippedSize += 1;
            console.log(`[build] skip (${(size / 1048576).toFixed(1)} MB): ${path.relative(ROOT, source)}`);
            continue;
        }

        fs.copyFileSync(source, target);
        stats.copied += 1;
        stats.bytes += size;
    }
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

for (const job of COPIES) {
    const before = stats.copied;
    copyDir(job.from, job.to);
    console.log(`[build] ${path.relative(ROOT, job.from)} -> ${path.relative(ROOT, job.to)} (${stats.copied - before} files)`);
}

const index = path.join(DIST, 'app', 'index.html');
if (!fs.existsSync(index)) {
    console.error('[build] missing dist/app/index.html — public/app was not copied');
    process.exit(1);
}

console.log(
    `[build] done: ${stats.copied} files, ${(stats.bytes / 1048576).toFixed(1)} MB ` +
    `(skipped ${stats.skippedSize} oversized, ${stats.skippedUnused} unused)`
);
