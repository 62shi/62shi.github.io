/* ============================================================
   v12-ext.js —— 系统消息按会话归属 / 可拖动禁言倒计时 / 可拖动「回到主页」
   原则：不接任何 AI；只把既有数据按原会话归位，不新增未保存内容。
   ============================================================ */
(function () {
    'use strict';
    const W = window;
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const LS = {
        get(k, d) { try { const v = localStorage.getItem('v12_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem('v12_' + k, JSON.stringify(v)); } catch (e) {} }
    };
    function pfx() { try { return (typeof APP_PREFIX !== 'undefined' && APP_PREFIX) ? APP_PREFIX : 'CHAT_APP_V3_'; } catch (e) { return 'CHAT_APP_V3_'; } }
    function curId() { try { return SESSION_ID || ''; } catch (e) { return ''; } }
    function nameOf(id) {
        try { const s = (sessionList || []).filter(x => x.id === id)[0]; if (s && s.name) return s.name; } catch (e) {}
        return id === '__me__' ? '我' : '梦角';
    }

    /* ---------- 1. 系统消息写入「指定会话」，不再一律写当前聊天框 ---------- */
    function route(sessionId, html, id) {
        const msg = {
            id: id || ('v12-' + Date.now() + '-' + Math.floor(Math.random() * 99999)),
            sender: null, type: 'system', text: html, timestamp: new Date()
        };
        const cur = curId();
        if (!sessionId || sessionId === cur) {
            try { addMessage(msg); } catch (e) {}
            return;
        }
        try {
            const key = pfx() + sessionId + '_chatMessages';
            localforage.getItem(key).then(arr => {
                if (!Array.isArray(arr)) arr = [];
                arr.push(msg);
                return localforage.setItem(key, arr);
            }).catch(() => {});
        } catch (e) {}
    }

    /* ---------- 2. 通用可拖动（鼠标 + 触摸），位置记忆 ---------- */
    function drag(el, key) {
        if (!el || el.dataset.v12Drag) return;
        el.dataset.v12Drag = '1';
        const saved = LS.get('pos_' + key, null);
        if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
            el.style.left = saved.x + 'px'; el.style.top = saved.y + 'px';
            el.style.right = 'auto'; el.style.bottom = 'auto';
        }
        let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false, moved = false;
        const start = e => {
            const t = e.touches ? e.touches[0] : e;
            if (!t) return;
            const r = el.getBoundingClientRect();
            if (!el.style.left || el.style.left === 'auto') {
                el.style.left = r.left + 'px'; el.style.top = r.top + 'px';
                el.style.right = 'auto'; el.style.bottom = 'auto';
            }
            sx = t.clientX; sy = t.clientY;
            ox = parseFloat(el.style.left) || r.left; oy = parseFloat(el.style.top) || r.top;
            dragging = true; moved = false;
            el.style.cursor = 'grabbing';
        };
        const move = e => {
            if (!dragging) return;
            const t = e.touches ? e.touches[0] : e;
            if (!t) return;
            const dx = t.clientX - sx, dy = t.clientY - sy;
            if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
            const maxX = Math.max(0, W.innerWidth - el.offsetWidth);
            const maxY = Math.max(0, W.innerHeight - el.offsetHeight);
            el.style.left = Math.max(0, Math.min(maxX, ox + dx)) + 'px';
            el.style.top = Math.max(0, Math.min(maxY, oy + dy)) + 'px';
            if (e.touches && e.cancelable) e.preventDefault();
        };
        const end = () => {
            if (!dragging) return;
            dragging = false; el.style.cursor = '';
            LS.set('pos_' + key, { x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0 });
            if (moved) {
                el.dataset.v12Moved = '1';
                setTimeout(() => { delete el.dataset.v12Moved; }, 260);
            }
        };
        el.addEventListener('mousedown', start);
        el.addEventListener('touchstart', start, { passive: true });
        document.addEventListener('mousemove', move);
        document.addEventListener('touchmove', move, { passive: false });
        document.addEventListener('mouseup', end);
        document.addEventListener('touchend', end);
        el.addEventListener('click', e => {
            if (el.dataset.v12Moved) { e.preventDefault(); e.stopPropagation(); }
        }, true);
    }

    /* ---------- 3. 汇总所有「正在生效」的禁言（按唯一 key 去重） ---------- */
    function collect() {
        const out = [], now = Date.now();
        try {
            const M = W.V8 && W.V8.Mute;
            if (M && M.data) {
                const d = M.data() || {};
                Object.keys(d).forEach(cid => {
                    const o = d[cid] || {};
                    ['them', 'me'].forEach(who => {
                        const until = Number(o[who] || 0);
                        if (until <= now) return;
                        const isG = cid.indexOf('g:') === 0;
                        const whoId = isG ? (cid.split(':')[2] || '') : cid;
                        const nm = nameOf(whoId);
                        out.push({
                            key: 'm:' + cid + ':' + who,
                            sid: isG ? (cid.split(':')[1] || '') : cid,
                            scope: isG ? '群聊' : '私聊',
                            who: who === 'them' ? '我' : nm,
                            target: who === 'them' ? nm : '我',
                            until: until
                        });
                    });
                });
            }
        } catch (e) {}
        try {
            const P = W.V8 && W.V8.PairMute;
            if (P && P.active) P.active().forEach(r => {
                if (r.until > now) out.push({
                    key: 'p:' + r.from + '>' + r.to, scope: '他们之间',
                    who: nameOf(r.from), target: nameOf(r.to), until: r.until
                });
            });
        } catch (e) {}
        try {
            const gov = W.GX && W.GX.gov && W.GX.gov();
            if (gov && gov.mutes) Object.keys(gov.mutes).forEach(k => {
                const m = gov.mutes[k];
                if (m && (m.until || 0) > now) out.push({
                    key: 'gx:' + k, scope: '群聊',
                    who: m.by || '成员', target: m.name || '成员', until: m.until
                });
            });
        } catch (e) {}
        const seen = {};
        return out.filter(x => seen[x.key] ? false : (seen[x.key] = 1, true));
    }

    function fmt(ms) {
        if (ms <= 0) return '00:00';
        const s = Math.ceil(ms / 1000);
        return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }

    function ensureBadge() {
        let el = $('v12-mute-badge');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'v12-mute-badge';
        el.innerHTML = '<div class="v12-mb-title">禁言中 · 可拖动</div><div class="v12-mb-list"></div>';
        document.body.appendChild(el);
        drag(el, 'muteBadge');
        return el;
    }

    /* v13：徽标只跟当前会话走 —— 群聊禁言只在群聊里、私聊禁言只在私聊里、主页一律不显示 */
    function uiState() {
        const hs = $('home-screen');
        const H = W.HomeExt && W.HomeExt.Home;
        let inChat;
        if (H && typeof H.shown === 'boolean') inChat = !H.shown;
        else inChat = !!(hs && W.getComputedStyle(hs).display === 'none');
        const all = (typeof sessionList !== 'undefined' && sessionList) ? sessionList : [];
        const cur = all.filter(x => x.id === curId())[0];
        return { inChat: inChat, isGroup: !!(cur && cur.type === 'group'), cur: curId() };
    }

    function paint() {
        const el = ensureBadge();
        const s = uiState();
        const list = s.inChat ? collect().filter(x => {
            if (x.scope === '他们之间') return true;
            if (s.isGroup ? (x.scope !== '群聊') : (x.scope !== '私聊')) return false;
            return !x.sid || x.sid === s.cur;
        }) : [];
        if (!list.length) { el.style.display = 'none'; return; }
        el.style.display = 'block';
        el.querySelector('.v12-mb-list').innerHTML = list.map(x =>
            '<div class="v12-mb-row"><span class="v12-mb-scope">' + esc(x.scope) + '</span>'
            + '<span class="v12-mb-who">' + esc(x.who) + ' 禁言 ' + esc(x.target) + '</span>'
            + '<span class="v12-mb-time">' + fmt(x.until - Date.now()) + '</span></div>').join('');
    }

    /* ---------- 4. 「回到主页」标识可拖动 ---------- */
    function bindHomeFab() {
        const f = $('home-back-fab');
        if (f) { drag(f, 'homeBack'); if (!/可拖动/.test(f.title || '')) f.title = '回到主页 · 可拖动'; }
    }

    function install() {
        paint();
        setInterval(paint, 1000);          // 倒计时自动更新
        bindHomeFab();
        setInterval(bindHomeFab, 1500);    // FAB 可能晚建
        document.addEventListener('click', () => setTimeout(paint, 350));
        W.addEventListener('hashchange', () => setTimeout(paint, 600));
    }

    W.V12 = { route: route, drag: drag, collect: collect, paint: paint };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else install();
})();
