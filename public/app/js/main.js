import * as store from './store.js';

/* ------------------------------------------------------------------ views */

const VIEWS = {
    index: 'index.ejs',
    auth: 'auth.ejs',
    available: 'available/index.ejs',
    availableA: 'available/A-type.ejs',
    availableB: 'available/B-type.ejs',
    availableC: 'available/C-type.ejs',
    availableD: 'available/D-type.ejs',
    book: 'book/index.ejs',
    profile: 'profile.ejs',
    dashboard: 'dashboard/index.ejs',
    dataroom: 'dashboard/dataroom.ejs',
    upload: 'upload.ejs',
    status: 'status/index.ejs'
};

const templateCache = new Map();

async function loadTemplate(name) {
    if (templateCache.has(name)) return templateCache.get(name);
    const response = await fetch(`/__views/${VIEWS[name]}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`โหลด template ไม่ได้: ${VIEWS[name]}`);
    const text = await response.text();
    templateCache.set(name, text);
    return text;
}

function sessionUserLocal() {
    const user = store.sessionUser();
    if (!user) return null;
    const profile = store.profileOf(user.id);
    return {
        id: user.id,
        email: user.email,
        tel: profile ? profile.phone : undefined,
        rank: user.rank
    };
}

function flashTake() {
    const raw = sessionStorage.getItem('kab.flash');
    sessionStorage.removeItem('kab.flash');
    if (!raw) return {};
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function flashSet(value) {
    sessionStorage.setItem('kab.flash', JSON.stringify(value));
}

/* ----------------------------------------------------------------- routes */

function currentPath() {
    return location.pathname.replace(/\/+$/, '') || '/';
}

function resolveRoute() {
    const path = currentPath();
    const flash = flashTake();
    const user = sessionUserLocal();
    const sessionUser = store.sessionUser();

    if (path === '/logout' || path === '/dashboard/logout') {
        store.signOut();
        location.replace('/');
        return null;
    }

    if (path === '/') {
        return { view: 'index', locals: { user } };
    }

    if (path === '/login' || path === '/register') {
        if (user) {
            location.replace(user.rank === 1 ? '/dashboard' : '/');
            return null;
        }
        return {
            view: 'auth',
            locals: {
                action: flash.action || 'login',
                error: flash.error === undefined ? null : flash.error,
                success: flash.success
            }
        };
    }

    if (path === '/available') return { view: 'available', locals: { user } };
    if (path === '/available/A-type') return { view: 'availableA', locals: { user } };
    if (path === '/available/B-type') return { view: 'availableB', locals: { user } };
    if (path === '/available/C-type') return { view: 'availableC', locals: { user } };
    if (path === '/available/D-type') return { view: 'availableD', locals: { user } };

    if (path === '/status') return { view: 'status', locals: {} };

    if (path.startsWith('/Book/')) {
        if (!user) return needLogin('/Book');
        const roomno = Number(path.split('/')[2]);
        const room = store.roomRows().find((row) => row.roomno === roomno);
        if (!room) {
            location.replace('/available');
            return null;
        }
        return { view: 'book', locals: { room, roomno: room.roomno, imagePath: room.image_path } };
    }

    if (path === '/Book') {
        location.replace('/available');
        return null;
    }

    if (path === '/profile') {
        if (!user) return needLogin('/profile');
        const profile = store.profileOf(sessionUser.id);
        if (!profile) {
            location.replace('/');
            return null;
        }
        const bookings = store.bookingRows()
            .filter((row) => row.user_id === sessionUser.id)
            .map((row) => {
                const end = store.bookingStart(row).getTime() + 2 * 3600000;
                const left = Math.max(0, end - Date.now());
                return {
                    ...row,
                    timeLeft: {
                        hours: Math.floor(left / 3600000) % 24,
                        minutes: Math.floor((left / 60000) % 60),
                        seconds: Math.floor((left / 1000) % 60)
                    }
                };
            });
        return { view: 'profile', locals: { title: 'User Profile', user: profile, bookings } };
    }

    if (path === '/dashboard') {
        if (!user) return needLogin('/dashboard');
        if (sessionUser.rank !== 1) {
            location.replace('/');
            return null;
        }
        return { view: 'dashboard', locals: { user } };
    }

    if (path.startsWith('/dashboard/dataroom/')) {
        if (!user) return needLogin('/dashboard');
        const roomno = Number(path.split('/')[3]);
        const room = store.roomRows().find((row) => row.roomno === roomno);
        if (!room) {
            location.replace('/dashboard');
            return null;
        }
        return {
            view: 'dataroom',
            locals: {
                title: 'Room Details',
                room: {
                    roomno: room.roomno,
                    roomname: room.roomname,
                    roomsize: room.roomsize,
                    roomtype: room.roomtype,
                    roomfloor: room.roomfloor
                },
                imagePath: room.image_path
            }
        };
    }

    if (path === '/upload') {
        if (!user) return needLogin('/upload');
        return {
            view: 'upload',
            locals: { images: store.imageRowsAll(), successMessage: flash.successMessage || [] }
        };
    }

    return null;
}

function needLogin(returnTo) {
    sessionStorage.setItem('kab.returnTo', returnTo);
    location.replace('/login');
    return null;
}

/* ------------------------------------------------------------ api routing */

function jsonResponse(body, status = 200) {
    return { status, body };
}

function humansLikes() {
    return store.roomRows();
}

function apiRoute(method, rawUrl, body) {
    let url;
    try {
        url = new URL(rawUrl, location.origin);
    } catch {
        return null;
    }
    if (url.origin !== location.origin && !/\/available\/api$|\/status\/api$/.test(url.pathname)) {
        return null;
    }

    const path = url.pathname;
    const user = store.sessionUser();
    const userId = user ? user.id : null;

    if (method === 'GET' && path === '/dashboard/api') {
        return jsonResponse({ rooms: humansLikes() });
    }

    if (method === 'GET' && /^\/dashboard\/apiImg[ABC]$/.test(path)) {
        const map = { A: 1, B: 2, C: 3 };
        const rows = store.imageRows(map[path.slice(-1)]);
        if (!rows.length) return jsonResponse({ message: 'No images found for this room type.' }, 404);
        return jsonResponse({ item: rows });
    }

    if (method === 'GET' && path === '/dashboard/apiReport') {
        return jsonResponse({ item: store.reportRows() });
    }

    if (method === 'GET' && path === '/dashboard/apiusers') {
        return jsonResponse({ item: store.userInfo() });
    }

    if (method === 'GET' && path === '/dashboard/session-time-remaining') {
        return jsonResponse({ timeRemaining: store.sessionTimeRemaining() });
    }

    if (method === 'PUT' && /^\/dashboard\/\d+$/.test(path)) {
        if (userId === null) return jsonResponse({ error: 'not logged in' }, 401);
        const roomno = Number(path.split('/')[2]);
        const status = Number(body?.status);
        if (status !== 0 && status !== 1) {
            return jsonResponse({ error: 'Invalid status value' }, 400);
        }
        try {
            store.setRoomStatus(roomno, status);
            store.addReport(userId, 'UpdateRoom', 'C');
            return jsonResponse({ success: true, message: 'Room status and log entry successfully updated' });
        } catch (error) {
            return jsonResponse({ error: error.message }, 500);
        }
    }

    if (method === 'GET' && path === '/Book/apiBook') {
        return jsonResponse({ item: store.bookingRows() });
    }

    if (method === 'POST' && /^\/Book\/\d+$/.test(path)) {
        if (userId === null) return jsonResponse({ message: 'กรุณาเข้าสู่ระบบ' }, 401);
        const roomno = Number(path.split('/')[2]);
        const result = store.createBooking({
            roomno,
            date: body?.date,
            time: body?.time,
            userId
        });
        return jsonResponse(result.body, result.status);
    }

    if (method === 'GET' && path === '/available/api') {
        return jsonResponse({ rooms: humansLikes() });
    }

    if (method === 'GET' && path === '/status/api') {
        return jsonResponse({
            rooms: store.roomRows().map((row) => ({
                roomno: row.roomno,
                STATUS: row.status
            }))
        });
    }

    if (method === 'POST' && /^\/profile\/cancel\/\d+$/.test(path)) {
        if (userId === null) return jsonResponse({ message: 'กรุณาเข้าสู่ระบบ' }, 401);
        const id = Number(path.split('/')[3]);
        const result = store.cancelBooking(id, userId);
        return jsonResponse(result.body, result.status);
    }

    return null;
}

function parseBody(init) {
    if (!init || init.body === undefined || init.body === null) return undefined;
    const raw = init.body;
    if (typeof raw === 'string') {
        if (raw.trim().startsWith('{')) {
            try {
                return JSON.parse(raw);
            } catch {
                /* fall through */
            }
        }
        const params = new URLSearchParams(raw);
        const obj = {};
        params.forEach((value, key) => {
            obj[key] = value;
        });
        return obj;
    }
    if (raw instanceof URLSearchParams) {
        const obj = {};
        raw.forEach((value, key) => {
            obj[key] = value;
        });
        return obj;
    }
    if (raw instanceof FormData) {
        const obj = {};
        raw.forEach((value, key) => {
            if (typeof value === 'string') obj[key] = value;
        });
        return obj;
    }
    return undefined;
}

function installFetch() {
    if (window.__kabNativeFetch) return;
    window.__kabNativeFetch = window.fetch.bind(window);

    window.fetch = async function (input, init) {
        const url = typeof input === 'string' ? input : input.url;
        const method = String(init?.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();

        if (url.includes('/__views/')) return window.__kabNativeFetch(input, init);

        const handled = apiRoute(method, url, parseBody(init));
        if (!handled) return window.__kabNativeFetch(input, init);

        return new Response(JSON.stringify(handled.body), {
            status: handled.status,
            headers: { 'Content-Type': 'application/json' }
        });
    };
}

function reinstallFetch() {
    installFetch();
}

function installXHR() {
    if (window.__kabNativeXHR) return;
    const Native = window.XMLHttpRequest;
    if (!Native) return;
    window.__kabNativeXHR = Native;

    class LocalXHR {
        constructor() {
            this.readyState = 0;
            this.status = 0;
            this.responseText = '';
            this.response = '';
            this.responseType = '';
            this.onload = null;
            this.onerror = null;
            this.onreadystatechange = null;
            this._headers = {};
            this._method = 'GET';
            this._url = '';
        }

        open(method, url) {
            this._method = String(method || 'GET').toUpperCase();
            this._url = url;
            this.readyState = 1;
            this._fire('readystatechange');
        }

        setRequestHeader() { /* not needed */ }

        getAllResponseHeaders() {
            return 'content-type: application/json\r\n';
        }

        getResponseHeader(name) {
            return String(name).toLowerCase() === 'content-type' ? 'application/json' : null;
        }

        abort() { /* no-op */ }

        _fire(type) {
            const handler = this['on' + type];
            if (typeof handler === 'function') handler.call(this, { type });
        }

        send(body) {
            const handled = apiRoute(this._method, this._url, parseBody({ body }));

            if (!handled) {
                const native = new Native();
                const self = this;
                native.onload = function () {
                    self.readyState = 4;
                    self.status = native.status;
                    self.responseText = native.responseText;
                    self.response = native.responseText;
                    self._fire('readystatechange');
                    self._fire('load');
                };
                native.onerror = function (event) {
                    self.status = 0;
                    self._fire('error');
                    if (typeof self.onerror === 'function') self.onerror.call(self, event);
                };
                native.open(this._method, this._url, true);
                native.send(body === undefined ? null : body);
                return;
            }

            this.status = handled.status;
            this.responseText = JSON.stringify(handled.body);
            this.response = this.responseText;
            this.readyState = 4;
            this._fire('readystatechange');
            this._fire('load');
            if (handled.status >= 400) this._fire('error');
        }
    }

    window.XMLHttpRequest = LocalXHR;
}

/* ----------------------------------------------------------- form handling */

function installForms() {
    document.addEventListener(
        'submit',
        async (event) => {
            const form = event.target;
            if (!(form instanceof HTMLFormElement)) return;

            const action = new URL(form.getAttribute('action') || location.pathname, location.origin).pathname;

            if (action === '/login') {
                event.preventDefault();
                const data = new FormData(form);
                const mode = data.get('action');

                if (mode === 'register') {
                    const result = await store.register({
                        firstname: data.get('firstname'),
                        lastname: data.get('lastname'),
                        phone: data.get('phone'),
                        email: data.get('email'),
                        password: data.get('password')
                    });
                    if (!result.ok) {
                        flashSet({ error: result.message, action: 'register' });
                        location.assign('/login');
                        return;
                    }
                    flashSet({ success: 'User registered successfully', action: 'register' });
                    location.assign('/login');
                    return;
                }

                const result = await store.login(data.get('email'), data.get('password'));
                if (!result.ok) {
                    flashSet({ error: result.message, action: 'login' });
                    location.assign('/login');
                    return;
                }
                const returnTo = sessionStorage.getItem('kab.returnTo');
                sessionStorage.removeItem('kab.returnTo');
                location.assign(returnTo || (result.user.rank === 1 ? '/dashboard' : '/'));
                return;
            }

            if (action === '/upload') {
                event.preventDefault();
                const data = new FormData(form);
                const file = data.get('image');
                const roomType = Number(data.get('roomType'));
                if (!file || !file.size) {
                    flashSet({ successMessage: ['No file selected!'] });
                    location.assign('/upload');
                    return;
                }
                const dataUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(file);
                });
                store.pushImage({
                    filename: file.name,
                    filepath: dataUrl,
                    roomType
                });
                flashSet({ successMessage: ['อัปโหลดรูปภาพสำเร็จ (เก็บใน localStorage)'] });
                location.assign('/upload');
            }
        },
        true
    );
}

/* --------------------------------------------------------------- rendering */

function waitForScript(script) {
    return new Promise((resolve) => {
        if (script.dataset.kabDone === '1') {
            resolve();
            return;
        }
        const timer = setTimeout(resolve, 8000);

        function done() {
            clearTimeout(timer);
            script.dataset.kabDone = '1';
            resolve();
        }

        script.addEventListener('load', done, { once: true });
        script.addEventListener('error', done, { once: true });
    });
}

function replayReady() {
    document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true }));
    window.dispatchEvent(new Event('load'));
}

function extractScripts(html) {
    const found = [];
    const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let match;

    while ((match = pattern.exec(html)) !== null) {
        const attrs = {};
        const attrPattern = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
        let attrMatch;

        while ((attrMatch = attrPattern.exec(match[1])) !== null) {
            attrs[attrMatch[1].toLowerCase()] = attrMatch[3] ?? attrMatch[4] ?? attrMatch[5] ?? '';
        }

        found.push({ attrs, code: match[2] });
    }

    return found;
}

async function injectScriptsSequentially(list) {
    for (const item of list) {
        const script = document.createElement('script');
        Object.entries(item.attrs).forEach(([name, value]) => script.setAttribute(name, value));
        script.textContent = item.code;

        const isModule = String(item.attrs.type || '').toLowerCase() === 'module';

        if (isModule) {
            const rewritten = item.code.replace(
                /(from\s*|import\s*\(\s*)(['"])(\.{1,2}\/[^'"]*)\2/g,
                (whole, prefix, quote, spec) =>
                    `${prefix}${quote}${new URL(spec, location.origin + location.pathname).href}${quote}`
            );
            const blob = new Blob([rewritten], { type: 'text/javascript' });
            const url = URL.createObjectURL(blob);
            try {
                await import(/* @vite-ignore */ url);
            } catch (error) {
                console.error('[kab] module error:', error);
            } finally {
                URL.revokeObjectURL(url);
            }
            continue;
        }

        document.head.appendChild(script);

        if (item.attrs.src) {
            await waitForScript(script);
        }
    }
}

async function render() {
    const route = resolveRoute();
    if (!route) return;

    const template = await loadTemplate(route.view);
    const html = ejs.render(template, route.locals || {}, {});

    const bodyHtml = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    const scripts = extractScripts(html);

    const parsed = new DOMParser().parseFromString(bodyHtml, 'text/html');

    document.title = parsed.title || 'Kab Apartment';

    document.head.querySelectorAll('[data-kab-view]').forEach((node) => node.remove());

    parsed.querySelectorAll('head link, head style').forEach((node) => {
        const clone = node.cloneNode(true);
        clone.setAttribute('data-kab-view', '1');
        document.head.appendChild(clone);
    });

    document.body.replaceChildren(...Array.from(parsed.body.childNodes));

    await injectScriptsSequentially(scripts);

    replayReady();

    if (route.view === 'auth') mountAccountPicker();
}

function mountAccountPicker() {
    if (document.getElementById('accountPicker')) return;

    const form = document.getElementById('loginForm');
    const box = document.querySelector('.boxLeft');
    if (!form || !box) return;

    const style = document.createElement('style');
    style.setAttribute('data-kab-view', '1');
    style.textContent = `
        #loginForm > img { display: none; }
        #accountPicker { margin-top: 18px; width: 100%; }
        #accountPicker .ap-title {
            font-size: 13px; font-weight: 600; letter-spacing: .06em;
            color: #996515; text-transform: uppercase; margin-bottom: 8px;
        }
        #accountPicker .ap-item {
            display: flex; align-items: center; gap: 10px; width: 260px;
            padding: 9px 12px; margin: 0 auto 8px; cursor: pointer;
            background: #fff; border: 1px solid #ddd6c9; border-radius: 4px;
            text-align: left; font-family: 'Cinzel'; transition: all .2s ease;
        }
        #accountPicker .ap-item:hover {
            border-color: #996515; box-shadow: 0 6px 14px rgba(80,80,80,.18);
        }
        #accountPicker .ap-avatar {
            width: 30px; height: 30px; border-radius: 50%; flex: 0 0 30px;
            background: #013220; color: #f5f5f5; font-size: 12px;
            display: flex; align-items: center; justify-content: center;
        }
        #accountPicker .ap-name { font-size: 13px; color: #013220; line-height: 1.2; }
        #accountPicker .ap-role { font-size: 10px; color: #996515; letter-spacing: .08em; text-transform: uppercase; }
    `;
    document.head.appendChild(style);

    const picker = document.createElement('div');
    picker.id = 'accountPicker';
    picker.innerHTML =
        '<div class="ap-title">เลือกบัญชี</div>' +
        store.ACCOUNTS.map((account) => {
            const initials = (account.firstName[0] + account.lastName[0]).toUpperCase();
            const role = account.rank === 1 ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งาน';
            return `<button type="button" class="ap-item" data-email="${account.email}" data-password="${account.password}">
                <span class="ap-avatar">${initials}</span>
                <span>
                    <span class="ap-name">${account.firstName} ${account.lastName}</span><br>
                    <span class="ap-role">${role}</span>
                </span>
            </button>`;
        }).join('');

    form.appendChild(picker);

    picker.querySelectorAll('.ap-item').forEach((button) => {
        button.addEventListener('click', () => {
            document.getElementById('email').value = button.dataset.email;
            document.getElementById('password').value = button.dataset.password;
            form.querySelector('button[type="submit"]').click();
        });
    });
}

async function boot() {
    await store.init();
    store.purgeExpiredBookings();
    installFetch();
    installXHR();
    installForms();
    await render();
}

boot().catch((error) => {
    document.body.innerHTML =
        `<pre style="font-family:monospace;padding:24px;color:#8c1d1d">` +
        `เริ่มต้นระบบไม่สำเร็จ: ${error.message}\n\nเปิดผ่าน http://localhost:3002/ เท่านั้น</pre>`;
});
