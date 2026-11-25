const NS = 'kab.v1.';
const K = {
    users: NS + 'users',
    userInfo: NS + 'user_info',
    room: NS + 'room',
    bookings: NS + 'bookings',
    images2: NS + 'images2',
    report: NS + 'report',
    session: NS + 'session',
    seeded: NS + 'seeded'
};

export const SESSION_TTL = 24 * 60 * 60 * 1000;

function read(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function nextId(rows, field) {
    const key = field || 'id';
    return rows.reduce((max, row) => Math.max(max, Number(row[key]) || 0), 0) + 1;
}

function toHex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

function fromHex(hex) {
    return new Uint8Array(hex.match(/.{2}/g).map((pair) => parseInt(pair, 16)));
}

function nowStamp() {
    const date = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
        `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function todayValue() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

async function derive(password, salt) {
    if (!globalThis.crypto || !crypto.subtle) {
        throw new Error('เบราว์เซอร์ไม่รองรับ WebCrypto — เปิดผ่าน http://localhost ไม่ใช่ file://');
    }
    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, key, 256
    );
    return toHex(bits);
}

async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return `${toHex(salt)}:${await derive(password, salt)}`;
}

async function verifyPassword(password, stored) {
    const [saltHex, expected] = String(stored || '').split(':');
    if (!saltHex || !expected) return false;
    return (await derive(password, fromHex(saltHex))) === expected;
}

const SEED_ROWS = [
    [1, 'A', 100, 0], [2, 'A', 101, 0], [3, 'A', 102, 0], [4, 'B', 103, 0],
    [5, 'B', 104, 0], [6, 'A', 200, 0], [7, 'A', 201, 0], [8, 'A', 202, 0],
    [9, 'B', 203, 0], [10, 'B', 204, 0], [11, 'A', 300, 0], [12, 'A', 301, 0],
    [13, 'A', 302, 0], [14, 'B', 303, 0], [15, 'B', 304, 0], [16, 'C', 400, 0]
];

const SEED_IMAGES = [
    [1, 'image-1728572453126.png', 'uploads\\image-1728572453126.png', 1],
    [2, 'image-1728572723747.png', 'uploads\\image-1728572723747.png', 1],
    [3, 'image-1728572732127.png', 'uploads\\image-1728572732127.png', 1],
    [4, 'image-1728573081732.png', 'uploads\\image-1728573081732.png', 2],
    [7, 'image-1728589203874.jpg', 'uploads\\image-1728589203874.jpg', 1],
    [8, 'image-1728589245968.jpg', 'uploads\\image-1728589245968.jpg', 2],
    [9, 'image-1728589266011.jpg', 'uploads\\image-1728589266011.jpg', 3],
    [11, 'image-1728622379689.png', 'uploads\\image-1728622379689.png', 2],
    [15, 'image-1728623771380.png', 'uploads\\image-1728623771380.png', 3],
    [19, 'image-1728633837706.png', 'uploads\\image-1728633837706.png', 1]
];

const DEMO_USERS = [
    { email: 'admin@apartment.local', password: 'admin1234', firstName: 'System', lastName: 'Admin', phone: '022130356', rank: 1 },
    { email: 'user@apartment.local', password: 'user1234', firstName: 'Lapin', lastName: 'Srisoi', phone: '0674694503', rank: 0 }
];

export const ACCOUNTS = DEMO_USERS;

export async function init() {
    const rooms = read(K.room, []);
    const users = read(K.users, []);
    const seeded = localStorage.getItem(K.seeded) === 'true';

    if (seeded && rooms.length > 0 && users.length > 0) {
        await syncDemoAccounts();
        purgeExpiredBookings();
        return;
    }

    const userRows = [];
    const infoRows = [];

    for (const demo of DEMO_USERS) {
        const id = userRows.length + 1;
        userRows.push({ id, email: demo.email, password: await hashPassword(demo.password), rank: demo.rank });
        infoRows.push({
            user_id: id,
            first_name: demo.firstName,
            last_name: demo.lastName,
            email: demo.email,
            phone: demo.phone
        });
    }

    write(K.users, userRows);
    write(K.userInfo, infoRows);
    write(K.room, SEED_ROWS.map(([id, type, roomno, status]) => ({
        id, type, roomno, status, image_path: null
    })));
    write(K.bookings, []);
    write(K.images2, SEED_IMAGES.map(([id, filename, filepath, room_type]) => ({
        id, filename, filepath, room_type
    })));
    write(K.report, []);
    localStorage.setItem(K.seeded, 'true');
}

async function syncDemoAccounts() {
    const userRows = read(K.users, []);
    const infoRows = read(K.userInfo, []);
    let changed = false;

    for (let index = 0; index < DEMO_USERS.length; index += 1) {
        const demo = DEMO_USERS[index];
        const id = index + 1;
        const row = userRows.find((item) => item.id === id);
        const info = infoRows.find((item) => item.user_id === id);
        const sameAccount = row && String(row.email).toLowerCase() === demo.email;

        if (row && sameAccount && info && info.first_name === demo.firstName) continue;

        if (row) {
            row.email = demo.email;
            row.rank = demo.rank;
            row.password = await hashPassword(demo.password);
        } else {
            userRows.push({
                id,
                email: demo.email,
                password: await hashPassword(demo.password),
                rank: demo.rank
            });
        }

        if (info) {
            info.first_name = demo.firstName;
            info.last_name = demo.lastName;
            info.email = demo.email;
            info.phone = demo.phone;
        } else {
            infoRows.push({
                user_id: id,
                first_name: demo.firstName,
                last_name: demo.lastName,
                email: demo.email,
                phone: demo.phone
            });
        }

        changed = true;
    }

    if (changed) {
        write(K.users, userRows);
        write(K.userInfo, infoRows);
    }
}

export function resetAll() {
    Object.values(K).forEach((key) => localStorage.removeItem(key));
}

/* --------------------------------------------------------------- tables */

export function users() {
    return read(K.users, []);
}

export function userInfo() {
    return read(K.userInfo, []);
}

export function roomRows() {
    return read(K.room, []).slice().sort((a, b) => a.id - b.id);
}

export function bookingRows() {
    return read(K.bookings, []).slice().sort((a, b) => a.id - b.id);
}

export function imageRows(roomType) {
    const rows = read(K.images2, []).filter((row) => row.room_type === Number(roomType));
    return rows.sort((a, b) => b.id - a.id).slice(0, 1);
}

export function imageRowsAll() {
    return read(K.images2, []).slice().sort((a, b) => a.id - b.id);
}

export function reportRows() {
    return read(K.report, []).slice().sort((a, b) => a.id - b.id);
}

export function setRoomStatus(roomno, status) {
    const rows = read(K.room, []);
    const row = rows.find((item) => item.roomno === Number(roomno));
    if (!row) throw new Error('ไม่พบห้อง');
    row.status = status;
    write(K.room, rows);
    return row;
}

export function pushImage({ filename, filepath, roomType }) {
    const rows = read(K.images2, []);
    const row = { id: nextId(rows), filename, filepath, room_type: Number(roomType) };
    rows.push(row);
    write(K.images2, rows);
    return row;
}

export function addReport(userId, action, type) {
    const rows = read(K.report, []);
    rows.push({ id: nextId(rows), user_id: userId, function: action, datetime: nowStamp(), type });
    write(K.report, rows.slice(-400));
}

/* -------------------------------------------------------------- session */

export function getSession() {
    const session = read(K.session, null);
    if (!session) return null;
    if (!session.expiresAt || Date.now() >= session.expiresAt) {
        localStorage.removeItem(K.session);
        return null;
    }
    return session;
}

export function sessionUser() {
    const session = getSession();
    if (!session) return null;
    return users().find((user) => user.id === session.userId) || null;
}

export function sessionTimeRemaining() {
    const session = getSession();
    return session ? Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000)) : 0;
}

export function startSession(userId) {
    const now = Date.now();
    write(K.session, { userId, issuedAt: now, expiresAt: now + SESSION_TTL });
}

export function signOut() {
    localStorage.removeItem(K.session);
}

export function profileOf(userId) {
    return userInfo().find((row) => row.user_id === Number(userId)) || null;
}

/* ----------------------------------------------------------------- auth */

export async function login(email, password) {
    const user = users().find(
        (row) => String(row.email).toLowerCase() === String(email || '').trim().toLowerCase()
    );
    if (!user) return { ok: false, message: 'Username or password is incorrect' };
    if (!(await verifyPassword(password, user.password))) {
        return { ok: false, message: 'Username or password is incorrect' };
    }
    startSession(user.id);
    addReport(user.id, 'Login-Successful', 'login');
    return { ok: true, user };
}

export async function register({ firstname, lastname, phone, email, password }) {
    const rows = users();
    const clean = String(email || '').trim().toLowerCase();

    if (!firstname || !lastname || !phone || !clean || !password) {
        return { ok: false, message: 'All fields are required' };
    }
    if (rows.some((row) => String(row.email).toLowerCase() === clean)) {
        return { ok: false, message: 'Username already exists' };
    }

    const id = nextId(rows);
    rows.push({ id, email: clean, password: await hashPassword(password), rank: 0 });
    write(K.users, rows);

    const info = userInfo();
    info.push({
        user_id: id,
        first_name: firstname,
        last_name: lastname,
        email: clean,
        phone
    });
    write(K.userInfo, info);

    addReport(id, 'Register-Successful', 'register');
    return { ok: true, id };
}

/* ------------------------------------------------------------- bookings */

export function bookingStart(row) {
    return new Date(`${row.date}T${String(row.time).slice(0, 5)}:00`);
}

export function purgeExpiredBookings() {
    const rows = read(K.bookings, []);
    const alive = rows.filter((row) => bookingStart(row).getTime() + 2 * 3600000 > Date.now());
    if (alive.length !== rows.length) {
        write(K.bookings, alive);
        return rows.length - alive.length;
    }
    return 0;
}

export function createBooking({ roomno, date, time, userId }) {
    const room = roomRows().find((row) => row.roomno === Number(roomno));
    if (!room) return { status: 404, body: { message: 'ไม่พบห้อง' } };

    const rows = bookingRows();

    if (rows.some((row) => row.user_id === userId && row.room_type === room.type)) {
        return { status: 409, body: { message: 'คุณได้จองห้องประเภทนี้ไปแล้ว' } };
    }
    if (rows.some((row) => row.user_id === userId && row.date === date && row.time === time)) {
        return { status: 409, body: { message: 'คุณไม่สามารถจองห้องอีกห้องในวันและเวลานี้ได้' } };
    }
    if (rows.some((row) => row.room_no === room.roomno && row.date === date && row.time === time)) {
        return { status: 409, body: { message: 'ห้องนี้ถูกจองไปแล้วในช่วงเวลานี้' } };
    }

    const row = {
        id: nextId(rows),
        user_id: userId,
        room_no: room.roomno,
        room_type: room.type,
        date,
        time,
        created_at: nowStamp()
    };
    rows.push(row);
    write(K.bookings, rows);
    addReport(userId, 'Create-Booking', 'booking');
    return { status: 200, body: { success: true, message: 'การจองสำเร็จ!' } };
}

export function cancelBooking(id, userId) {
    const rows = bookingRows();
    const target = rows.find((row) => row.id === Number(id) && row.user_id === Number(userId));
    if (!target) {
        return { status: 404, body: { message: 'ไม่พบการจองที่ต้องการยกเลิก' } };
    }
    write(K.bookings, rows.filter((row) => row.id !== target.id));
    addReport(userId, 'Cancel-Booking', 'C');
    return { status: 200, body: { success: true, message: 'การจองถูกยกเลิกเรียบร้อยแล้ว' } };
}

export { todayValue, nowStamp };
