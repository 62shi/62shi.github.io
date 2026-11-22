/* ============================================================
   v8-ext.js —— 统一同意请求 / 分人昵称头像 / 心情表情 / 单聊禁言 /
                主动消息未读 / 朋友圈全屏与封面 / 字卡给谁用 / 拥有群聊
   原则：不接任何 AI；所有展示内容都来自用户自己保存过的库或输入。
   ============================================================ */
(function () {
    'use strict';
    const W = window;
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, t) => { try { if (typeof showNotification === 'function') showNotification(m, t || 'success'); } catch (e) {} };
    const HX = () => W.HomeExt;
    const H = {
        get(k, d) { try { const v = localStorage.getItem('v8_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem('v8_' + k, JSON.stringify(v)); } catch (e) {} }
    };
    function sid() { try { return SESSION_ID || '0'; } catch (e) { return '0'; } }
    function myName() { try { return (settings && settings.myName) || '我'; } catch (e) { return '我'; } }
    function partnerName() { try { const s = (sessionList || []).filter(x => x.id === sid())[0]; return (s && s.name) || (settings && settings.partnerName) || '梦角'; } catch (e) { return '梦角'; } }
    function contacts() { try { return (sessionList || []).filter(s => s.type !== 'group' && s.type !== 'person'); } catch (e) { return []; } }
    function groups() { try { return (sessionList || []).filter(s => s.type === 'group'); } catch (e) { return []; } }
    function nameOf(id) { try { const s = (sessionList || []).filter(x => x.id === id)[0]; if (s && s.name) return s.name; } catch (e) {} return id === sid() ? partnerName() : '梦角'; }
    function sysMsg(html, id, session) {
        try {
            const mid = id || ('v8-' + Date.now() + '-' + Math.floor(Math.random() * 999));
            if (W.V12 && W.V12.route) { W.V12.route(session, html, mid); }
            else { addMessage({ id: mid, sender: null, type: 'system', text: html, timestamp: new Date() }); }
            /* v15：原站保存是 500ms 节流，邀请卡片一旦在这窗口内退出就会丢，
               刷新后卡片不见、用户自然「点了没反应」。这里立即落盘一次。 */
            try { if (typeof saveData === 'function') saveData(); } catch (e) {}
        } catch (e) {}
    }
    function panel(id, title, html) { return HX() ? HX().makePanel(id, title, html) : null; }
    function body(id) { return HX() ? HX().panelBody(id) : null; }
    function open(id) { return HX() ? HX().openPanel(id) : null; }
    function close(id) { return HX() ? HX().closePanel(id) : null; }
    function home() { return HX() ? HX().Home : null; }
    function refreshHome() { try { if (home()) home().render(); } catch (e) {} }
    function shrink(file, max) { return HX() ? HX().shrink(file, max) : Promise.reject(new Error('no HX')); }
    /* v16：毫秒 -> 「x小时xx分 / x分xx秒 / x秒」，用于同意卡片旁的用时小字 */
    function fmtUsed(ms) {
        let t = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
        const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), ss = t % 60;
        const p = n => String(n).padStart(2, '0');
        if (h > 0) return h + '小时' + p(m) + '分';
        if (m > 0) return m + '分' + p(ss) + '秒';
        return ss + '秒';
    }

    /* ============================================================
       1. 统一「同意」：所有需要我 / TA 点头的请求都发到聊天框
       ============================================================ */
    const Consent = {
        _apply: {},
        key: 'consent',
        all() { return H.get(this.key, []); },
        save(l) { H.set(this.key, l); },
        /* 只有「他们发来的」才需要我点头 */
        pending() { return this.all().filter(x => x.status === 'pending' && x.from !== 'me'); },
        mine() { return this.all().filter(x => x.status === 'pending' && x.from === 'me'); },
        ask(o) {
            const id = 'c' + Date.now() + Math.floor(Math.random() * 1000);
            /* 方向只认「谁发起」：我发起 = me（等他们同意或拒绝），他们发来 = them（我同意或拒绝） */
            const from = (o.from === 'them') ? 'them' : 'me';
            const ts = Date.now();
            const rec = {
                id: id, kind: o.kind || '', title: o.title || '一条请求', detail: o.detail || '',
                by: o.by || (from === 'me' ? myName() : partnerName()),
                from: from,
                to: from === 'me' ? (o.to || partnerName()) : myName(),
                cid: o.cid || '', ts: ts, status: 'pending',
                payload: o.payload || null,
                /* v16：他们同意或拒绝最长 1 小时；时间戳持久化，刷新 / 重开都不丢 */
                decideAt: from === 'me'
                    ? ts + 20000 + Math.floor((3600000 - 20000) * Math.pow(Math.random(), 3))
                    : 0
            };
            const l = this.all(); l.unshift(rec); this.save(l.slice(0, 400));
            this._apply[id] = o.apply || function () {};
            const dir = from === 'me'
                ? '我发送了一条信息 · 等 ' + esc(rec.to) + ' 同意或拒绝'
                : esc(rec.by) + ' 发送给我一条信息 · 等我同意或拒绝';
            const used = '<span class="v8-consent-used" data-v8ts="' + ts + '">用时 0秒</span>';
            const card = '<div class="v8-consent ' + (from === 'me' ? 'from-me' : 'from-them') + '" data-v8id="' + id + '"'
                + (rec.payload ? ' data-v8pay="' + esc(JSON.stringify(rec.payload)) + '"' : '') + '>'
                + '<div class="v8-consent-dir">' + dir + '</div>'
                + '<div class="v8-consent-t">' + esc(rec.title) + '</div>'
                + '<div class="v8-consent-d">' + esc(rec.detail) + '</div>'
                + (from === 'me'
                    ? '<div class="v8-consent-b"><span class="v8-consent-wait" data-v8wait="' + id + '">等 ' + esc(rec.to) + ' 同意或拒绝…</span>' + used + '</div>'
                    : '<div class="v8-consent-b"><button data-v8-agree="' + id + '">同意</button>'
                      + '<button class="ghost" data-v8-deny="' + id + '">拒绝</button>' + used + '</div>')
                + '</div>';
            sysMsg(card, 'v8-consent-' + id, o.session);
            /* 我发出的：只是发送了一条信息，不提醒、不加未读；他们发来的：有信息提醒 */
            if (from === 'them') {
                toast(rec.by + ' 发送给我一条信息');
                try { Unread.add(rec.cid || sid(), rec.by + ' 发送给我一条信息', rec.by); } catch (e) {}
            }
            if (from === 'me') this.autoDecide(id);
            this.paint();
            return id;
        },
        /* v16：我发出去的请求，由他们在「最长 1 小时」内决定。
           决定时刻存在记录里，页面关掉再开也会按时间戳补上，不会永远挂着。 */
        autoDecide(id) {
            const l = this.all();
            const r = l.filter(x => x.id === id)[0];
            if (!r) return;
            if (!r.decideAt) { r.decideAt = (r.ts || Date.now()) + 3600000; this.save(l); }
            const left = r.decideAt - Date.now();
            if (left <= 0) { this.decideNow(id); return; }
            setTimeout(() => this.decideNow(id), Math.min(left, 2147483000));
        },
        /* 到点真正落决定：写回状态与用时，并刷新页面上的卡片 */
        decideNow(id) {
            const l = this.all();
            const r = l.filter(x => x.id === id)[0];
            if (!r || r.status !== 'pending' || r.from !== 'me') return;
            if ((r.decideAt || 0) > Date.now()) return;
            const ok = Math.random() < 0.9;
            r.status = ok ? 'agreed' : 'denied';
            r.used = Date.now() - (r.ts || Date.now());
            this.save(l);
            if (ok) { try { (this._apply[id] || function () {})(); } catch (e) {} }
            const word = ok ? esc(r.to) + ' 已同意' : esc(r.to) + ' 已拒绝';
            document.querySelectorAll('.v8-consent[data-v8id="' + id + '"]').forEach(el => {
                const b = el.querySelector('.v8-consent-b');
                if (b) b.innerHTML = '<span class="v8-consent-r">' + word + '</span>'
                    + '<span class="v8-consent-used" data-v8ts="' + (r.ts || Date.now()) + '">用时 ' + fmtUsed(r.used) + '</span>';
            });
            this.paint();
        },
        /* 刷新后内存回调会丢，按记录里的 payload 重建效果（群邀请） */
        rebuild(rec, ok) {
            if (!ok || !rec) return false;
            const p = rec.payload || {};
            if (rec.kind === 'groupInviteMe' && p.gid) {
                try {
                    const has = (sessionList || []).some(x => x.id === p.gid);
                    if (!has) {
                        sessionList.push({ id: p.gid, name: p.gname || '新群', type: 'group',
                            members: p.members || [], owner: 'them', createdAt: Date.now() });
                        try {
                            localforage.setItem((typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'CHAT_APP_V3_') + 'sessionList', sessionList);
                        } catch (e) {}
                    }
                    if (W.HomeExt && W.HomeExt.switchSession) W.HomeExt.switchSession(p.gid, { force: true });
                    return true;
                } catch (e) { return false; }
            }
            return false;
        },
        markCard(id, word) {
            try {
                const r = this.all().filter(x => x.id === id)[0];
                const used = r ? (r.used != null ? r.used : Date.now() - (r.ts || Date.now())) : 0;
                const extra = r ? '<span class="v8-consent-used" data-v8ts="' + (r.ts || Date.now()) + '">用时 ' + fmtUsed(used) + '</span>' : '';
                document.querySelectorAll('.v8-consent[data-v8id="' + id + '"]').forEach(el => {
                    const b = el.querySelector('.v8-consent-b');
                    if (b) b.innerHTML = '<span class="v8-consent-r">' + esc(word) + '</span>' + extra;
                });
            } catch (e) {}
        },
        resolve(id, ok, el) {
            const l = this.all();
            const r = l.filter(x => x.id === id)[0];
            if (!r) {
                /* v15：记录被裁掉了，但卡片上还带着重建信息 —— 照样把群建出来 */
                if (ok && el && el.dataset && el.dataset.v8pay) {
                    try {
                        const pay = JSON.parse(el.dataset.v8pay);
                        if (this.rebuild({ kind: 'groupInviteMe', payload: pay }, true)) {
                            this.markCard(id, '已同意');
                            toast('已加入群「' + (pay.gname || '新群') + '」');
                            this.paint();
                            return;
                        }
                    } catch (e) {}
                }
                this.markCard(id, '已失效');
                toast('这条请求已经失效，让对方重新发一次', 'warning');
                return;
            }
            if (r.from === 'me') { toast('这是你发出的，等对方回应'); return; }
            if (r.status !== 'pending') {
                this.markCard(id, r.status === 'agreed' ? '已同意' : '已拒绝');
                toast('这条已经处理过了');
                return;
            }
            r.status = ok ? 'agreed' : 'denied';
            r.used = Date.now() - (r.ts || Date.now());
            this.save(l);
            let hit = false;
            try { if (this._apply[id]) { this._apply[id](); hit = true; } } catch (e) {}
            if (!hit) { try { hit = this.rebuild(r, ok); } catch (e) {} }
            this.markCard(id, ok ? '已同意' : '已拒绝');
            toast(ok ? '已同意' : '已拒绝');
            this.paint();
        },
        paint() {
            const n = this.pending().length;
            const b = $('v8-consent-fab');
            if (b) {
                b.style.display = n ? '' : 'none';
                const s = b.querySelector('.v8-fab-n');
                if (s) s.textContent = n;
            }
        },
        open() {
            const wait = this.pending(), sent = this.mine();
            const row = (r, canAct) =>
                '<div class="hx-item"><div class="hx-item-main"><div class="hx-item-name">' + esc(r.title) + '</div>'
                + '<div class="hx-item-sub">' + esc(r.detail) + ' · ' + esc(r.by) + ' · '
                + (r.status === 'pending' ? (r.from === 'me' ? '等 ' + esc(r.to) + ' 同意或拒绝' : '等我同意或拒绝')
                    : (r.status === 'agreed' ? '已同意' : '已拒绝'))
                + ' · 用时 ' + fmtUsed(r.used != null ? r.used : Date.now() - (r.ts || Date.now())) + '</div></div>'
                + (canAct && r.status === 'pending' ? '<div class="hx-item-act"><button class="hx-btn primary" style="padding:5px 9px;font-size:11px;" data-v8-agree="' + r.id + '">同意</button>'
                    + '<button class="hx-btn" style="padding:5px 8px;font-size:11px;" data-v8-deny="' + r.id + '">拒绝</button></div>' : '')
                + '</div>';
            panel('v8-consent-panel', '待同意',
                '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-bell"></i>等我处理</div>'
                + '<div class="hx-list">' + (wait.length ? wait.map(r => row(r, true)).join('') : '<div class="hx-empty">暂时没有</div>') + '</div></div>'
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-paper-plane"></i>我发出的</div>'
                + '<div class="hx-list">' + (sent.length ? sent.map(r => row(r, false)).join('') : '<div class="hx-empty">暂时没有</div>') + '</div></div>');
            open('v8-consent-panel');
        },
        ensureFab() {
            if ($('v8-consent-fab')) return;
            const b = document.createElement('button');
            b.id = 'v8-consent-fab';
            b.innerHTML = '<i class="fas fa-bell"></i><span class="v8-fab-n">0</span>';
            b.onclick = () => { W.__hxBackToUs = false; this.open(); };
            document.body.appendChild(b);
            this.paint();
        }
    };

    /* ============================================================
       2. 心情：联系人自己从他 / 我的表情包里挑一个
       ============================================================ */
    const MOOD_DEFAULT = ['🥰', '😴', '🌙', '☁️', '🧸', '🎧', '✨', '🌷', '☕', '😀', '🥺'];
    const Mood = {
        key: 'moodmap',
        imgKey: 'moodimg',
        imgs() { return H.get(this.imgKey, []); },
        isImg(v) { return /^data:image\//i.test(String(v || '')); },
        pool() {
            const ms = (HX() && HX().Materials) ? HX().Materials.lib() : [];
            const em = ms.filter(m => m.type === 'emoji').map(m => m.content);
            return (em.length ? em : MOOD_DEFAULT.slice()).concat(this.imgs());
        },
        data() { return H.get(this.key, {}); },
        pick(cid, who) {
            const pool = this.pool();
            const d = this.data();
            const k = cid || sid();
            const others = Object.keys(d).filter(x => x !== k).map(x => d[x].e);
            let cand = pool.filter(e => others.indexOf(e) < 0);
            if (!cand.length) cand = pool;
            d[k] = { e: cand[Math.floor(Math.random() * cand.length)], who: who || nameOf(k), ts: Date.now() };
            H.set(this.key, d);
            refreshHome();
            return d[k].e;
        },
        get(cid) {
            const k = cid || sid(), d = this.data();
            if (!d[k] || d[k].e === '🍰') this.pick(k, nameOf(k));   /* v14：旧蛋糕自动换成别的 */
            return (this.data()[k] || {}).e || MOOD_DEFAULT[0];
        },
        who(cid) {
            const d = this.data()[cid || sid()];
            return d ? (d.who + ' 自己选的') : '';
        },
        set(cid, e, who) {
            const d = this.data();
            d[cid || sid()] = { e: e, who: who || nameOf(cid || sid()), ts: Date.now() };
            H.set(this.key, d);
            refreshHome();
        },
        /* 我的心情（不自动编造，未选时是「无」） */
        meMood() {
            let v = H.get('moodme', '😶');
            if (v === '🍰') { v = '😶'; H.set('moodme', v); }   /* v14：蛋糕不要了，旧数据顺手换掉 */
            return v || '😶';
        },
        setMe(e) { H.set('moodme', e); refreshHome(); },
        addImg(url) { const l = this.imgs(); l.unshift(url); H.set(this.imgKey, l.slice(0, 12)); },
        html(v) { return this.isImg(v) ? '<img class="v8-mood-img" src="' + esc(v) + '" alt="">' : esc(v); },
        /* 我发出的请求：TA 收下后自己挑一个 */
        askThem(cid) {
            const k = cid || sid(), nm = nameOf(k);
            Consent.ask({
                kind: 'mood', title: '请 ' + nm + ' 自己换一个心情', detail: '来自心情', by: myName(), from: 'me', cid: k,
                apply: () => { setTimeout(() => { this.pick(k, nm); toast(nm + ' 换好心情了'); }, 1600 + Math.random() * 1600); }
            });
        },
        open(cid) {
            const k = cid || sid();
            const nm = nameOf(k);
            const pool = this.pool();
            panel('v8-mood-panel', '心情',
                '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-face-smile"></i>' + esc(nm) + ' 的心情</div>'
                + '<div class="v8-mood-now" id="v8-mood-now">' + this.html(this.get(k)) + '</div>'
                + '<div class="hx-empty" style="margin:4px 0 10px;">' + esc(this.who(k)) + '</div>'
                + '<button class="hx-btn block primary" id="v8-mood-repick"><i class="fas fa-paper-plane"></i> 让 ' + esc(nm) + ' 自己换一个</button></div>'
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-image"></i>添加图片（' + esc(nm) + ' 也能选）</div>'
                + '<button class="hx-btn block" id="v8-mood-imgbtn"><i class="fas fa-upload"></i> 添加一张图片</button>'
                + '<input type="file" id="v8-mood-file" accept="image/*" style="display:none;">'
                + '<div class="hx-empty" style="margin-top:6px;">' + (this.imgs().length ? '已有 ' + this.imgs().length + ' 张图片可用' : '还没有图片') + '</div></div>');
            const bd = body('v8-mood-panel');
            const repick = bd.querySelector('#v8-mood-repick');
            if (repick) repick.onclick = () => { this.askThem(k); close('v8-mood-panel'); };
            const ib = bd.querySelector('#v8-mood-imgbtn');
            const fi = bd.querySelector('#v8-mood-file');
            if (ib && fi) {
                ib.onclick = () => fi.click();
                fi.onchange = async e => {
                    const f = e.target.files && e.target.files[0];
                    if (!f) return;
                    try { this.addImg(await shrink(f, 420)); toast('图片已加入，' + nm + ' 也能选'); this.open(k); }
                    catch (err) { toast('这张图片读不了', 'warning'); }
                    e.target.value = '';
                };
            }
            open('v8-mood-panel');
        }
    };

    /* ============================================================
       3. 昵称：两位分别修改 + 两个独立的昵称库
       ============================================================ */
    const Nicknames = {
        key: 'nicklib',
        lib(cid) { return H.get(this.key + '_' + (cid || 'me'), []); },
        saveLib(cid, l) { H.set(this.key + '_' + (cid || 'me'), l); },
        nameOfC(cid) { return cid === '__me__' ? myName() : nameOf(cid); },
        applyName(cid, v) {
            try {
                if (cid === '__me__') {
                    settings.myName = v;
                } else {
                    const s = (sessionList || []).filter(x => x.id === cid)[0];
                    if (s) { s.name = v; localforage.setItem((typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'CHAT_APP_V3_') + 'sessionList', sessionList).catch(() => {}); }
                    if (cid === sid()) settings.partnerName = v;
                }
                if (typeof throttledSaveData === 'function') throttledSaveData();
                if (typeof updateUI === 'function') updateUI();
            } catch (e) {}
            refreshHome();
        },
        open() {
            const cs = contacts();
            /* v10：明确「让谁帮我选」——按联系人逐个列出，不再含糊的「让 TA 帮我选」 */
            const askers = cs.filter(c => c.id);
            const nickAskBtns = (askers.length ? askers : [{ id: sid(), name: partnerName() }]).map(c =>
                '<button class="hx-btn" data-v8-nickaskme="' + esc(c.id) + '">让 ' + esc(c.name || nameOf(c.id)) + ' 帮我选</button>').join('');
            const c1 = cs[0] || { id: sid(), name: partnerName() };
            const c2 = cs[1] || { id: '', name: '第二位' };
            const person = (c, idx) => {
                if (!c.id) {
                    return '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-user-edit"></i>第 ' + idx + ' 位</div>'
                        + '<div class="hx-empty">还没有第二位联系人，先在「聊天」里新建一位</div></div>';
                }
                const lib = this.lib(c.id);
                const nm = c.name || ('第' + idx + '位');
                return '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-user-edit"></i>修改「' + esc(nm) + '」的昵称</div>'
                    + '<div style="display:flex;gap:8px;"><input class="hx-input" id="v8-nick-' + idx + '" value="' + esc(nm) + '" maxlength="12">'
                    + '<button class="hx-btn primary" data-v8-nicksave="' + esc(c.id) + '|' + idx + '">保存</button></div>'
                    + '<div class="hx-sec-title" style="margin-top:12px;"><i class="fas fa-list"></i>' + esc(nm) + ' 的昵称库</div>'
                    + '<div class="hx-chipline">' + (lib.length ? lib.map((n, i) =>
                        '<button class="hx-chip" data-v8-nickpick="' + esc(c.id) + '|' + i + '">' + esc(n) + '</button>').join('')
                        : '<span class="hx-empty">还没有</span>') + '</div>'
                    + '<div style="display:flex;gap:8px;margin-top:8px;"><input class="hx-input" id="v8-nicknew-' + idx + '" placeholder="加一个昵称" maxlength="12">'
                    + '<button class="hx-btn" data-v8-nickadd="' + esc(c.id) + '|' + idx + '">添加</button></div>'
                    + '<div class="v8-nick-acts">'
                    + '<button class="hx-btn" data-v8-nickthem="' + esc(c.id) + '|' + idx + '">让 TA 自己选</button>'
                    + '<button class="hx-btn" data-v8-nickhelp="' + esc(c.id) + '|' + idx + '">我帮 TA 选</button>'
                    + '<button class="hx-btn" data-v8-nickassist="' + esc(c.id) + '|' + idx + '">让 TA 帮我选</button>'
                    + '</div></div>';
            };
            const meLib = this.lib('__me__');
            panel('v8-nick-panel', '昵称',
                person(c1, 1) + person(c2, 2)
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-user"></i>我的昵称</div>'
                + '<div style="display:flex;gap:8px;"><input class="hx-input" id="v8-nick-me" value="' + esc(myName()) + '" maxlength="12">'
                + '<button class="hx-btn primary" id="v8-nick-mesave">保存</button></div>'
                + '<div class="hx-sec-title" style="margin-top:12px;"><i class="fas fa-list"></i>我的昵称库</div>'
                + '<div class="hx-chipline">' + (meLib.length ? meLib.map((n, i) =>
                    '<button class="hx-chip" data-v8-mepick="' + i + '">' + esc(n) + '</button>').join('')
                    : '<span class="hx-empty">还没有</span>') + '</div>'
                + '<div style="display:flex;gap:8px;margin-top:8px;"><input class="hx-input" id="v8-nick-menew" placeholder="加一个昵称" maxlength="12">'
                + '<button class="hx-btn" id="v8-nick-meadd">添加</button></div>'
                + '<div class="v8-nick-acts">' + nickAskBtns + '</div></div>');
            const bd = body('v8-nick-panel');
            bd.querySelectorAll('[data-v8-nicksave]').forEach(b => b.onclick = () => {
                const parts = b.dataset.v8Nicksave.split('|'), cid = parts[0], i = parts[1];
                const v = (bd.querySelector('#v8-nick-' + i).value || '').trim();
                if (!v) return;
                this.applyName(cid, v);
                toast('昵称已修改');
                this.open();
            });
            bd.querySelectorAll('[data-v8-nickadd]').forEach(b => b.onclick = () => {
                const parts = b.dataset.v8Nickadd.split('|'), cid = parts[0], i = parts[1];
                const v = (bd.querySelector('#v8-nicknew-' + i).value || '').trim();
                if (!v) return;
                const l = this.lib(cid); l.push(v); this.saveLib(cid, l);
                this.open();
            });
            bd.querySelectorAll('[data-v8-nickpick]').forEach(b => b.onclick = () => {
                const parts = b.dataset.v8Nickpick.split('|'), cid = parts[0], i = Number(parts[1]);
                const v = this.lib(cid)[i];
                if (!v) return;
                this.applyName(cid, v);
                toast('已换成「' + v + '」');
                this.open();
            });
            /* 让 TA 自己从他的昵称库里选 */
            bd.querySelectorAll('[data-v8-nickthem]').forEach(b => b.onclick = () => {
                const p = b.dataset.v8Nickthem.split('|'), cid = p[0], i = p[1];
                const lib = this.lib(cid), nm = this.nameOfC(cid);
                if (!lib.length) { toast('先给 TA 加几个昵称', 'warning'); return; }
                Consent.ask({
                    kind: 'nickSelf', title: '让 ' + nm + ' 自己选一个昵称', detail: '来自昵称库', by: myName(), from: 'me', cid: cid,
                    apply: () => {
                        const v = lib[Math.floor(Math.random() * lib.length)];
                        this.applyName(cid, v);
                        setTimeout(() => toast(nm + ' 选了「' + v + '」'), 200);
                    }
                });
            });
            /* 我帮 TA 选：需要 TA 同意 */
            bd.querySelectorAll('[data-v8-nickhelp]').forEach(b => b.onclick = () => {
                const p = b.dataset.v8Nickhelp.split('|'), cid = p[0], i = p[1];
                const lib = this.lib(cid), nm = this.nameOfC(cid);
                if (!lib.length) { toast('先给 TA 加几个昵称', 'warning'); return; }
                panel('v8-nick-pick', '我帮 ' + nm + ' 选',
                    '<div class="hx-sec"><div class="hx-chipline">' + lib.map((n, j) =>
                        '<button class="hx-chip" data-v8-helpsel="' + j + '">' + esc(n) + '</button>').join('') + '</div></div>');
                const bd2 = body('v8-nick-pick');
                bd2.querySelectorAll('[data-v8-helpsel]').forEach(x => x.onclick = () => {
                    const v = lib[Number(x.dataset.v8Helpsel)];
                    close('v8-nick-pick');
                    Consent.ask({
                        kind: 'nickHelp', title: '我帮 ' + nm + ' 把昵称改成「' + v + '」', detail: '需要 TA 同意', by: myName(), from: 'me', cid: cid,
                        apply: () => this.applyName(cid, v)
                    });
                    });
                open('v8-nick-pick');
            });
            /* 请 TA 帮我从我的昵称库里选：需要我同意 */
            const askMine = (fromCid, fromName) => {
                const lib = this.lib('__me__');
                if (!lib.length) { toast('先在我的昵称库里加几个', 'warning'); return; }
                const v = lib[Math.floor(Math.random() * lib.length)];
                Consent.ask({
                    kind: 'nickMe', title: fromName + ' 想让我用「' + v + '」', detail: '来自我的昵称库',
                    by: fromName, from: 'them', cid: fromCid,
                    apply: () => this.applyName('__me__', v)
                });
            };
            bd.querySelectorAll('[data-v8-nickassist]').forEach(b => b.onclick = () => {
                const p = b.dataset.v8Nickassist.split('|'), cid = p[0];
                askMine(cid, this.nameOfC(cid));
            });
            const me = bd.querySelector('#v8-nick-mesave');
            if (me) me.onclick = () => {
                const v = (bd.querySelector('#v8-nick-me').value || '').trim();
                if (!v) return;
                this.applyName('__me__', v);
                toast('已更新');
                this.open();
            };
            bd.querySelectorAll('[data-v8-mepick]').forEach(b => b.onclick = () => {
                const v = meLib[Number(b.dataset.v8Mepick)];
                if (!v) return;
                this.applyName('__me__', v);
                toast('已换成「' + v + '」');
                this.open();
            });
            const meadd = bd.querySelector('#v8-nick-meadd');
            if (meadd) meadd.onclick = () => {
                const v = (bd.querySelector('#v8-nick-menew').value || '').trim();
                if (!v) return;
                const l = this.lib('__me__'); l.push(v); this.saveLib('__me__', l);
                this.open();
            };
            bd.querySelectorAll('[data-v8-nickaskme]').forEach(b => b.onclick = () => {
                const cid = b.dataset.v8Nickaskme;
                askMine(cid, this.nameOfC(cid));
            });
            open('v8-nick-panel');
        }
    };

    /* ============================================================
       4. 头像：两位各一套库 + 双向「换头像」请求
       ============================================================ */
    const Avatars = {
        key: 'avatars',
        lib(cid) { return H.get(this.key + '_' + (cid || sid()), []); },
        saveLib(cid, l) { H.set(this.key + '_' + (cid || sid()), l); },
        apply(cid, url) {
            try {
                const s = (sessionList || []).filter(x => x.id === cid)[0];
                if (s) { s.avatar = url; localforage.setItem((typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'CHAT_APP_V3_') + 'sessionList', sessionList).catch(() => {}); }
                if (cid === sid()) {
                    const t = document.querySelector('#partner-avatar');
                    if (t) t.innerHTML = '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
                    localforage.setItem((typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'CHAT_APP_V3_') + sid() + '_partnerAvatar', url).catch(() => {});
                }
                if (typeof updateUI === 'function') updateUI();
            } catch (e) {}
            refreshHome();
        },
        open() {
            const cs = contacts();
            const c1 = cs[0] || { id: sid(), name: partnerName() };
            const c2 = cs[1] || { id: 'v8_empty2', name: '第二位' };
            const who = (c, idx) => {
                const lib = this.lib(c.id);
                const cur = (c.avatar || H.get('avPartner' + (idx === 2 ? '2' : ''), ''));
                return '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-user-circle"></i>' + esc(c.name || '梦角') + ' 的头像库</div>'
                    + '<div class="v8-av-now">' + (cur ? '<img src="' + esc(cur) + '">' : '<i class="fas fa-user"></i>') + '</div>'
                    + '<div class="hx-grid2" style="margin-top:10px;">' + (lib.length ? lib.map((u, i) =>
                        '<div class="hx-thumb" data-v8-avpick="' + esc(c.id) + '|' + i + '" style="background-image:url(\'' + u + '\');background-size:cover;background-position:center;">'
                        + '<button class="hx-thumb-del" data-v8-avdel="' + esc(c.id) + '|' + i + '"><i class="fas fa-times"></i></button></div>').join('')
                        : '<div class="hx-empty" style="grid-column:1/-1;">还没有</div>') + '</div>'
                    + '<div style="display:flex;gap:8px;margin-top:8px;">'
                    + '<button class="hx-btn primary" style="flex:1;" data-v8-avup="' + esc(c.id) + '"><i class="fas fa-upload"></i> 上传</button>'
                    + '<button class="hx-btn" data-v8-avask="' + esc(c.id) + '">让 TA 换头像</button></div>'
                    + '<button class="hx-btn block" data-v8-avset="' + esc(c.id) + '" style="margin-top:8px;"><i class="fas fa-shuffle"></i> 帮他换头像（不用同意）</button>'
                    + '</div>';
            };
            panel('v8-av-panel', '头像与头像库',
                who(c1, 1) + who(c2, 2)
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-heart"></i>我的头像</div>'
                + (cs.length ? cs.map(c => '<button class="hx-btn block" data-v8-avaskme="' + esc(c.id) + '" style="margin-top:6px;"><i class="fas fa-exchange-alt"></i> 让 ' + esc(c.name || nameOf(c.id)) + ' 帮我换头像</button>').join('')
                    : '<button class="hx-btn block" id="v8-av-meask"><i class="fas fa-exchange-alt"></i> 让 TA 帮我换头像</button>')
                + '<div id="v8-av-mylib" class="hx-grid2" style="margin-top:10px;"></div>'
                + '<input type="file" id="v8-av-file" accept="image/*" style="display:none;"></div>');
            const bd = body('v8-av-panel');
            const file = bd.querySelector('#v8-av-file');
            let target = null;
            bd.querySelectorAll('[data-v8-avup]').forEach(b => b.onclick = () => { target = b.dataset.v8Avup; file.click(); });
            file.onchange = async e => {
                const f = e.target.files && e.target.files[0];
                if (!f || !target) return;
                try {
                    const url = await shrink(f, 500);
                    const l = this.lib(target); l.unshift(url); this.saveLib(target, l.slice(0, 24));
                    toast('已加入头像库'); this.open();
                } catch (err) { toast('这张图片读不了', 'warning'); }
                e.target.value = '';
            };
            bd.querySelectorAll('[data-v8-avpick]').forEach(b => b.onclick = e => {
                if (e.target.closest('[data-v8-avdel]')) return;
                const p = b.dataset.v8Avpick.split('|'), cid = p[0], i = Number(p[1]);
                const u = this.lib(cid)[i];
                if (u) { this.apply(cid, u); toast('头像已更换'); this.open(); }
            });
            bd.querySelectorAll('[data-v8-avdel]').forEach(b => b.onclick = e => {
                e.stopPropagation();
                const p = b.dataset.v8Avdel.split('|'), cid = p[0], i = Number(p[1]);
                const l = this.lib(cid); l.splice(i, 1); this.saveLib(cid, l);
                this.open();
            });
            bd.querySelectorAll('[data-v8-avset]').forEach(b => b.onclick = () => {
                const cid = b.dataset.v8Avset, lib = this.lib(cid);
                if (!lib.length) { toast('先上传几张 TA 的头像', 'warning'); return; }
                const u = lib[Math.floor(Math.random() * lib.length)];
                this.apply(cid, u);
                toast('已帮他换好头像');
                this.open();
            });
            bd.querySelectorAll('[data-v8-avask]').forEach(b => b.onclick = () => {
                const cid = b.dataset.v8Avask, nm = nameOf(cid);
                const lib = this.lib(cid);
                if (!lib.length) { toast('先上传几张头像', 'warning'); return; }
                const u = lib[Math.floor(Math.random() * lib.length)];
                Consent.ask({
                    kind: 'avatar', title: '请 ' + nm + ' 换一张头像', detail: '来自头像库', by: myName(), from: 'me', cid: cid,
                    apply: () => this.apply(cid, u)
                });
            });
            const doMeAsk = (who) => {
                const nm = who ? nameOf(who) : partnerName();
                const lib = H.get(this.key + '_me', []);
                const u = lib.length ? lib[Math.floor(Math.random() * lib.length)] : (this.lib(sid())[0] || '');
                Consent.ask({
                    kind: 'avatarMe', title: nm + ' 想帮我换一张头像',
                    detail: '来自头像库 · 让 ' + nm + ' 帮我换', by: nm, from: 'them', cid: who || '',
                    apply: () => {
                        try {
                            if (u) localforage.setItem((typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'CHAT_APP_V3_') + sid() + '_myAvatar', u).catch(() => {});
                            const t = document.querySelector('#my-avatar');
                            if (t && u) t.innerHTML = '<img src="' + u + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
                        } catch (e) {}
                    }
                });
            };
            bd.querySelectorAll('[data-v8-avaskme]').forEach(b => b.onclick = () => doMeAsk(b.dataset.v8Avaskme));
            const meAsk = bd.querySelector('#v8-av-meask');
            if (meAsk) meAsk.onclick = () => doMeAsk('');
            const ml = bd.querySelector('#v8-av-mylib');
            if (ml) {
                const lib = H.get(this.key + '_me', []);
                ml.innerHTML = lib.length ? lib.map((u, i) =>
                    '<div class="hx-thumb" style="background-image:url(\'' + u + '\');background-size:cover;"></div>').join('')
                    : '<div class="hx-empty" style="grid-column:1/-1;">还没有</div>';
            }
            open('v8-av-panel');
        }
    };

    /* ============================================================
       4b. 他们之间互相禁言：直接生效、不需要同意；我可以直接解除
       ============================================================ */
    const PairMute = {
        key: 'mutepair',
        all() { const o = H.get(this.key, {}); return (o && typeof o === 'object') ? o : {}; },
        save(o) { H.set(this.key, o); },
        k(from, to) { return String(from) + '>' + String(to); },
        set(from, to, mins) {
            const m = Math.max(1, Math.min(30, Number(mins) || 10));
            const o = this.all();
            o[this.k(from, to)] = { from: from, to: to, mins: m, until: Date.now() + m * 60000, ts: Date.now() };
            this.save(o);
        },
        clear(from, to) { const o = this.all(); delete o[this.k(from, to)]; this.save(o); },
        until(from, to) { const r = this.all()[this.k(from, to)]; return (r && r.until > Date.now()) ? r.until : 0; },
        left(from, to) { const u = this.until(from, to); return u ? Math.ceil((u - Date.now()) / 60000) : 0; },
        active() { const o = this.all(); return Object.keys(o).map(k => o[k]).filter(r => r && r.until > Date.now()); }
    };

    /* ============================================================
       4c. 我被禁言时，他们其中一位可以替我去向「禁言我的那一位」申请解除；
           必须由禁言我的那一位同意才生效，全程不打扰我
       ============================================================ */
    const PairAsk = {
        key: 'pairask',
        all() { const o = H.get(this.key, {}); return (o && typeof o === 'object') ? o : {}; },
        save(o) { H.set(this.key, o); },
        k(a, b) { return String(a) + '>' + String(b); },
        get(a, b) { const r = this.all()[this.k(a, b)]; return (r && r.until > Date.now()) ? r : null; },
        ask(a, b) {
            const o = this.all();
            o[this.k(a, b)] = { a: a, b: b, until: Date.now() + 10 * 60000, ts: Date.now() };
            this.save(o);
            const an = nameOf(a), bn = nameOf(b);
            setTimeout(() => {
                try {
                    const cur = this.all();
                    if (!cur[this.k(a, b)]) return;
                    delete cur[this.k(a, b)];
                    this.save(cur);
                    const ok = Math.random() < 0.9;
                    if (ok) {
                        Mute.clear(a, 'me');
                        sysMsg('<div class="v8-sys">' + esc(bn) + ' 替我向 ' + esc(an) + ' 申请解除对我的禁言，' + esc(an) + ' 同意了。</div>', null, a);
                    } else {
                        sysMsg('<div class="v8-sys">' + esc(bn) + ' 替我向 ' + esc(an) + ' 申请解除对我的禁言，' + esc(an) + ' 没同意。</div>', null, a);
                    }
                    const pp = $('v8-mute-home-panel');
                    if (pp && pp.classList.contains('on')) Mute.homeOpen();
                } catch (e) {}
            }, 2600 + Math.floor(Math.random() * 3600));
        }
    };

    /* ============================================================
       5. 单聊禁言：双向最多 30 分钟，期间可反复申请解除
       ============================================================ */
    const Mute = {
        key: 'mute1',
        data() { return H.get(this.key, {}); },
        set(cid, who, mins) {
            const d = this.data();
            d[cid] = d[cid] || {};
            d[cid][who] = Date.now() + Math.max(1, Math.min(30, Number(mins) || 5)) * 60000;
            H.set(this.key, d);
            this.paint();
        },
        clear(cid, who) { const d = this.data(); if (d[cid]) d[cid][who] = 0; H.set(this.key, d); this.paint(); },
        until(cid, who) { const d = this.data(); return (d[cid] && d[cid][who] > Date.now()) ? d[cid][who] : 0; },
        left(cid, who) { const u = this.until(cid, who); return u ? Math.ceil((u - Date.now()) / 60000) : 0; },
        open() {
            const cid = sid(), nm = partnerName();
            const a = this.left(cid, 'them'), b = this.left(cid, 'me');
            panel('v8-mute-panel', '禁言',
                '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-volume-xmark"></i>当前</div>'
                + '<div class="hx-item"><div class="hx-item-main"><div class="hx-item-name">我禁言 ' + esc(nm) + '</div>'
                + '<div class="hx-item-sub">' + (a ? '还剩 ' + a + ' 分钟' : '没有禁言') + '</div></div></div>'
                + '<div class="hx-item"><div class="hx-item-main"><div class="hx-item-name">' + esc(nm) + ' 禁言我</div>'
                + '<div class="hx-item-sub">' + (b ? '还剩 ' + b + ' 分钟' : '没有禁言') + '</div></div></div></div>'
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-clock"></i>我禁言 ' + esc(nm) + '</div>'
                + '<div style="display:flex;gap:8px;align-items:center;"><input class="hx-input" id="v8-mute-mins" type="number" min="1" max="30" value="10" style="flex:1;">'
                + '<span style="font-size:12px;color:#8a94a6;">分钟（最多 30）</span>'
                + '<button class="hx-btn primary" id="v8-mute-set">确定</button></div>'
                + (a ? '<button class="hx-btn block" id="v8-mute-free" style="margin-top:8px;">提前解除</button>' : '') + '</div>'
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-heart"></i>对方也可以禁言我</div>'
                + '<button class="hx-btn block" id="v8-mute-byme">让 ' + esc(nm) + ' 禁言我</button>'
                + (b ? '<button class="hx-btn block primary" id="v8-mute-apply" style="margin-top:8px;">申请解除禁言</button>' : '') + '</div>');
            const bd = body('v8-mute-panel');
            const setBtn = bd.querySelector('#v8-mute-set');
            if (setBtn) setBtn.onclick = () => {
                const v = Number(bd.querySelector('#v8-mute-mins').value) || 5;
                if (v > 30) { toast('最多 30 分钟', 'warning'); return; }
                this.set(cid, 'them', v);
                sysMsg('<div class="v8-sys">我禁言了 ' + esc(nm) + ' ' + v + ' 分钟。</div>', null, cid);
                toast('已禁言 ' + v + ' 分钟'); this.open();
            };
            const free = bd.querySelector('#v8-mute-free');
            if (free) free.onclick = () => { this.clear(cid, 'them'); toast('已解除'); this.open(); };
            const byme = bd.querySelector('#v8-mute-byme');
            if (byme) byme.onclick = () => {
                const v = 5 + Math.floor(Math.random() * 10);
                this.set(cid, 'me', v);
                sysMsg('<div class="v8-sys">' + esc(nm) + ' 禁言了我 ' + v + ' 分钟。</div>', null, cid);
                toast(nm + ' 禁言了我 ' + v + ' 分钟'); this.open();
            };
            const ap = bd.querySelector('#v8-mute-apply');
            if (ap) ap.onclick = () => {
                Consent.ask({
                    kind: 'unmute', title: '我申请解除禁言', detail: '来自禁言', by: myName(), from: 'me', cid: cid,
                    apply: () => { this.clear(cid, 'me'); toast('禁言已解除'); }
                });
            };
            open('v8-mute-panel');
        },
        /* ------- 群聊禁言：双向、最多 30 分钟、可反复申请解除 ------- */
        gkey(gid, who) { return 'g:' + gid + ':' + who; },
        gleft(gid, who) { return this.left(this.gkey(gid, who), 'them'); },
        gset(gid, who, mins) { this.set(this.gkey(gid, who), 'them', Math.min(30, Number(mins) || 10)); },
        gclear(gid, who) { this.clear(this.gkey(gid, who), 'them'); },
        groupOpen(gid) {
            const g = (sessionList || []).filter(x => x.id === gid)[0];
            if (!g) { toast('先进入一个群聊', 'warning'); return; }
            const mem = (g.members || []).map(id => (sessionList || []).filter(x => x.id === id)[0]).filter(Boolean);
            const rows = mem.length ? mem.map(m => {
                const left = this.gleft(gid, m.id);
                return '<div class="hx-item"><div class="hx-item-main"><div class="hx-item-name">' + esc(m.name || '成员') + '</div>'
                    + '<div class="hx-item-sub">' + (left ? '禁言中，还剩 ' + left + ' 分钟' : '可以发言') + '</div></div>'
                    + '<div class="hx-item-act">' + (left
                        ? '<button class="hx-btn" style="padding:5px 9px;font-size:11px;" data-v8-gmfree="' + esc(m.id) + '">解除</button>'
                        : '<button class="hx-btn primary" style="padding:5px 9px;font-size:11px;" data-v8-gmmute="' + esc(m.id) + '">禁言</button>')
                    + '</div></div>';
            }).join('') : '<div class="hx-empty">群里还没有其他成员，先去「本群管理 → 邀请谁」拉人</div>';
            const mineLeft = this.gleft(gid, '__me__');
            panel('v8-gmute-panel', '群禁言',
                '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-volume-xmark"></i>我在这群</div>'
                + '<div class="hx-item"><div class="hx-item-main"><div class="hx-item-name">' + esc(myName()) + '</div>'
                + '<div class="hx-item-sub">' + (mineLeft ? '被禁言，还剩 ' + mineLeft + ' 分钟' : '没有禁言') + '</div></div>'
                + (mineLeft ? '<div class="hx-item-act"><button class="hx-btn primary" style="padding:5px 9px;font-size:11px;" id="v8-gm-apply">申请解除</button></div>' : '')
                + '</div>'
                + '<button class="hx-btn block" id="v8-gm-themmute" style="margin-top:8px;">让 TA 禁言我（最多 30 分钟）</button>'
                + '<div class="hx-empty" style="margin-top:6px;">群成员之间可以互相禁言，最长 30 分钟，随时可以再申请解除。</div></div>'
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-users"></i>群成员</div><div class="hx-list">' + rows + '</div></div>');
            const bd = body('v8-gmute-panel');
            bd.querySelectorAll('[data-v8-gmmute]').forEach(b => b.onclick = () => {
                const id = b.dataset.v8Gmmute;
                this.gset(gid, id, 10);
                sysMsg('<div class="v8-sys">我在群里禁言了 ' + esc(nameOf(id)) + ' 10 分钟。</div>', null, gid);
                toast('已禁言 10 分钟');
                this.groupOpen(gid);
            });
            bd.querySelectorAll('[data-v8-gmfree]').forEach(b => b.onclick = () => {
                this.gclear(gid, b.dataset.v8Gmfree);
                toast('已解除');
                this.groupOpen(gid);
            });
            const mm = bd.querySelector('#v8-gm-themmute');
            if (mm) mm.onclick = () => {
                const by = (mem[0] && mem[0].name) || partnerName();
                const mins = 5 + Math.floor(Math.random() * 25);
                Consent.ask({
                    kind: 'gmute', title: by + ' 想在群里禁言我 ' + mins + ' 分钟', detail: '来自群禁言',
                    by: by, from: 'them', cid: gid,
                    apply: () => { this.gset(gid, '__me__', mins); sysMsg('<div class="v8-sys">' + esc(by) + ' 在群里禁言了我 ' + mins + ' 分钟。</div>', null, gid); }
                });
            };
            const ap = bd.querySelector('#v8-gm-apply');
            if (ap) ap.onclick = () => {
                Consent.ask({
                    kind: 'gunmute', title: '我申请解除群禁言', detail: '来自群禁言', by: myName(), from: 'me', cid: gid,
                    apply: () => { this.gclear(gid, '__me__'); toast('群禁言已解除'); }
                });
            };
            open('v8-gmute-panel');
        },
        /* ------- v16：主页2「禁言」—— 分「1 私聊 / 2 群聊」两个分组 ------- */
        homeOpen(tab) {
            tab = (tab === 'group') ? 'group' : 'single';
            const all = (typeof sessionList !== 'undefined' && sessionList) ? sessionList : [];
            const cs = all.filter(s => s.type !== 'group');
            const gs = all.filter(s => s.type === 'group');
            const nm = id => { const x = all.filter(s => s.id === id)[0]; return (x && x.name) || nameOf(id); };
            const minBox = key => '<span class="v8-hm-minwrap"><input class="hx-input v8-hm-mins" type="number" min="1" max="30" value="10" data-v8-hm-mins="' + esc(key) + '" title="分钟（最多 30）"><span>分</span></span>';
            const rowC = c => {
                const a = this.left(c.id, 'them'), b = this.left(c.id, 'me');
                return '<div class="hx-item v8-hm-row"><div class="hx-item-main"><div class="hx-item-name">' + esc(c.name || '联系人') + '</div>'
                    + '<div class="hx-item-sub">我禁言 TA：' + (a ? '还剩 ' + a + ' 分钟' : '没有') + ' · TA 禁言我：' + (b ? '还剩 ' + b + ' 分钟' : '没有') + '</div></div>'
                    + '<div class="hx-item-act v8-hm-act">' + minBox(c.id)
                    + '<button class="hx-btn primary" data-v8-hm-set="' + esc(c.id) + '">禁言</button>'
                    + (a ? '<button class="hx-btn" data-v8-hm-free="' + esc(c.id) + '">解除</button>' : '')
                    + (b ? '<button class="hx-btn" data-v8-hm-apply="' + esc(c.id) + '">申请解除</button>' : '')
                    + '</div></div>';
            };
            const rowG = g => {
                const mem = (g.members || []).map(id => all.filter(s => s.id === id)[0]).filter(Boolean);
                const mine = this.gleft(g.id, '__me__');
                const rows = mem.length ? mem.map(m => {
                    const l = this.gleft(g.id, m.id);
                    return '<div class="hx-item v8-hm-row"><div class="hx-item-main"><div class="hx-item-name">' + esc(m.name || '成员') + '</div>'
                        + '<div class="hx-item-sub">' + (l ? '禁言中，还剩 ' + l + ' 分钟' : '可以发言') + '</div></div>'
                        + '<div class="hx-item-act">' + (l
                            ? '<button class="hx-btn" data-v8-hg-free="' + esc(g.id + '|' + m.id) + '">解除</button>'
                            : '<button class="hx-btn primary" data-v8-hg-set="' + esc(g.id + '|' + m.id) + '">禁言 10 分钟</button>')
                        + '</div></div>';
                }).join('') : '<div class="hx-empty">群里还没有成员，先去「本群管理 → 邀请谁」拉人</div>';
                return '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-users"></i>' + esc(g.name || '群聊') + '</div>'
                    + '<div class="hx-list">' + rows + '</div>'
                    + '<div class="hx-item"><div class="hx-item-main"><div class="hx-item-name">我在这群</div>'
                    + '<div class="hx-item-sub">' + (mine ? '被禁言，还剩 ' + mine + ' 分钟' : '没有被禁言') + '</div></div>'
                    + (mine ? '<div class="hx-item-act"><button class="hx-btn primary" data-v8-hg-apply="' + esc(g.id) + '">申请解除</button></div>' : '')
                    + '</div>'
                    + '<button class="hx-btn block" data-v8-hg-open="' + esc(g.id) + '" style="margin-top:8px;">进入这个群的禁言设置</button></div>';
            };
            /* v10：他们之间互禁（直接生效、不需要我同意），保留 */
            const ppl = cs.filter(c => c.id);
            const pOpts = sel => ppl.map(c =>
                '<option value="' + esc(c.id) + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.name || '联系人') + '</option>').join('');
            const pairRows = PairMute.active().map(r => {
                const fn = nm(r.from), tn = nm(r.to), lf = PairMute.left(r.from, r.to);
                return '<div class="hx-item v8-pm-item"><div class="hx-item-main"><div class="hx-item-name">' + esc(fn) + ' 禁言 ' + esc(tn) + '</div>'
                    + '<div class="hx-item-sub">还剩 ' + lf + ' 分钟 · 他们之间，不需要谁同意</div></div>'
                    + '<div class="hx-item-act v8-hm-act">'
                    + '<button class="hx-btn" data-v8-pm-free="' + esc(r.from + '|' + r.to) + '">我直接解除</button>'
                    + '<button class="hx-btn" data-v8-pm-apply="' + esc(r.from + '|' + r.to) + '">TA 申请解除</button>'
                    + '</div></div>';
            }).join('');
            const pairSec = '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-user-clock"></i>他们之间互相禁言</div>'
                + '<div class="hx-empty" style="margin:0 0 8px;">他们之间互相禁言直接生效，不需要谁同意；你可以直接解除。</div>'
                + (ppl.length > 1
                    ? '<div class="v8-pm-row"><select class="hx-input" id="v8-pm-from">' + pOpts(ppl[0].id) + '</select>'
                      + '<span class="v8-pm-x">禁言</span><select class="hx-input" id="v8-pm-to">' + pOpts(ppl[1].id) + '</select>'
                      + minBox('__pair__') + '<button class="hx-btn primary" id="v8-pm-set">禁言</button></div>'
                    : '<div class="hx-empty">需要至少两位联系人，先在「聊天」里新建一位</div>')
                + '<div class="hx-list" style="margin-top:8px;">' + (pairRows || '<div class="hx-empty">暂时没有他们之间的禁言</div>') + '</div></div>';
            /* v15：我被禁言时，另一位联系人替我去申请，需要禁言我的那一位同意 */
            const mutedBy = cs.filter(c => this.left(c.id, 'me') > 0);
            const helpers = cs.filter(c => mutedBy.every(a => a.id !== c.id));
            const pairAskRows = (mutedBy.length && helpers.length)
                ? mutedBy.map(a => {
                    const b = helpers[0], rec = PairAsk.get(a.id, b.id);
                    return '<div class="hx-item"><div class="hx-item-main"><div class="hx-item-name">'
                        + esc(a.name || '联系人') + ' 禁言了我</div>'
                        + '<div class="hx-item-sub">' + (rec
                            ? '已让 ' + esc(b.name || '联系人') + ' 去申请，等 ' + esc(a.name || '联系人') + ' 同意'
                            : '可以让 ' + esc(b.name || '联系人') + ' 替我去申请，需要 ' + esc(a.name || '联系人') + ' 同意')
                        + '</div></div><div class="hx-item-act">'
                        + (rec ? '<span class="v8-consent-wait">等待中…</span>'
                            : '<button class="hx-btn primary" data-v8-pairask="' + esc(a.id + '|' + b.id) + '">让 ' + esc(b.name || '联系人') + ' 去申请</button>')
                        + '</div></div>';
                }).join('')
                : '<div class="hx-empty">现在没有被禁言，或者没有别的联系人可以替你申请</div>';
            const pairAskSec = '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-people-arrows"></i>他们替我申请解除</div>'
                + '<div class="hx-empty" style="margin:0 0 8px;">我被禁言时，他们其中一位可以替我去找禁言我的那一位，需要那一位同意。</div>'
                + '<div class="hx-list">' + pairAskRows + '</div></div>';
            const optHTML = arr => arr.map(o => '<option value="' + esc(o.v) + '">' + esc(o.t) + '</option>').join('');
            const op = (step, title, hint, inner) =>
                '<div class="v8-mk-op"><div class="hx-sec-title"><span class="v8-mk-step">' + step + '</span>' + title + '</div>'
                + '<div class="v8-mk-hint">' + hint + '</div><div class="v8-mk-row">' + inner + '</div></div>';

            /* ===== 1 私聊：禁言谁 / 申请解除我的禁言状态 ===== */
            const cOpts = [{ v: '', t: '请选择…' }].concat(cs.map(c => ({ v: 'c|' + c.id, t: c.name || '联系人' })));
            const cUnOpts = [{ v: '', t: '请选择…' }].concat(cs.map(c => ({ v: 'c|' + c.id, t: '我被 ' + (c.name || '联系人') + ' 禁言' })));
            const singleTop =
                op('1', '禁言谁', '选一位联系人，填分钟数（最长 30 分钟），点禁言。',
                    '<select class="hx-input" id="v8-mk-who">' + optHTML(cOpts) + '</select>'
                    + '<input class="hx-input" id="v8-mk-mins" type="number" min="1" max="30" value="10" style="width:58px;">'
                    + '<span class="v8-mk-unit">分</span><button class="hx-btn primary" id="v8-mk-go">禁言</button>')
                + op('2', '申请解除我的禁言状态', '我被谁禁言了就选谁；向 TA 申请解除，需要 TA 同意。',
                    '<select class="hx-input" id="v8-mk-unwho">' + optHTML(cUnOpts) + '</select>'
                    + '<button class="hx-btn primary" id="v8-mk-ungo">申请解除</button>');

            /* ===== 2 群聊：申请禁言谁 / 申请解除我或者任何一位 ===== */
            const gOpts = [{ v: '', t: '请选择…' }];
            const gUnOpts = [{ v: '', t: '请选择…' }, { v: 'me|', t: '我（解除我在群里被禁言）' }];
            gs.forEach(g => (g.members || []).forEach(mid => {
                const m = all.filter(x => x.id === mid)[0];
                if (!m) return;
                gOpts.push({ v: 'g|' + g.id + '|' + mid, t: (g.name || '群聊') + ' · ' + (m.name || '成员') });
                gUnOpts.push({ v: 'gm|' + g.id + '|' + mid, t: (g.name || '群聊') + ' · ' + (m.name || '成员') + '（替 TA 申请）' });
            }));
            if (gOpts.length === 1) gOpts[0].t = '还没有群成员';
            const groupTop =
                op('1', '申请禁言谁', '选群里的某一位，填分钟数（最长 30 分钟），点申请禁言。',
                    '<select class="hx-input" id="v8-gk-who">' + optHTML(gOpts) + '</select>'
                    + '<input class="hx-input" id="v8-gk-mins" type="number" min="1" max="30" value="10" style="width:58px;">'
                    + '<span class="v8-mk-unit">分</span><button class="hx-btn primary" id="v8-gk-go">申请禁言</button>')
                + op('2', '申请解除我或者任何一位禁言状态', '选「我」或群里任何一位，申请解除 TA 的禁言状态，需要对方同意。',
                    '<select class="hx-input" id="v8-gk-unwho">' + optHTML(gUnOpts) + '</select>'
                    + '<button class="hx-btn primary" id="v8-gk-ungo">申请解除</button>');

            const tabs = '<div class="v8-mt-tabs">'
                + '<button class="v8-mt-tab ' + (tab === 'single' ? 'on' : '') + '" data-v8-mtab="single">1 私聊</button>'
                + '<button class="v8-mt-tab ' + (tab === 'group' ? 'on' : '') + '" data-v8-mtab="group">2 群聊</button></div>';

            const singleBody = singleTop
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-user"></i>禁言哪位联系人</div>'
                + '<div class="hx-empty" style="margin:0 0 8px;">最长 30 分钟；被禁言了随时可以再申请解除。</div>'
                + '<div class="hx-list">' + (cs.length ? cs.map(rowC).join('') : '<div class="hx-empty">还没有联系人</div>') + '</div></div>'
                + '<div class="hx-sec"><button class="hx-btn block" id="v8-hm-single">打开单聊双向禁言</button></div>'
                + pairSec + pairAskSec;
            const groupBody = groupTop
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-users"></i>禁言群聊里的哪个人</div>'
                + (gs.length ? gs.map(rowG).join('') : '<div class="hx-empty">还没有群聊，先去「群聊」里建一个</div>') + '</div>'
                + '<div class="hx-sec"><button class="hx-btn block" id="v8-hm-group">打开当前群的禁言设置</button></div>';

            panel('v8-mute-home-panel', '禁言', tabs + (tab === 'single' ? singleBody : groupBody));
            const bd = body('v8-mute-home-panel');
            const mins = key => { const el = bd.querySelector('[data-v8-hm-mins="' + key + '"]'); return Math.max(1, Math.min(30, Number(el && el.value) || 10)); };
            /* 分组切换 */
            bd.querySelectorAll('[data-v8-mtab]').forEach(b => b.onclick = () => { this.homeOpen(b.dataset.v8Mtab); });

            /* ===== 原有全部能力（保留） ===== */
            bd.querySelectorAll('[data-v8-hm-set]').forEach(b => b.onclick = () => {
                const cid = b.dataset.v8HmSet, v = mins(cid);
                this.set(cid, 'them', v);
                sysMsg('<div class="v8-sys">我禁言了 ' + esc(nm(cid)) + ' ' + v + ' 分钟。</div>', null, cid);
                toast('已禁言 ' + v + ' 分钟'); this.homeOpen(tab);
            });
            bd.querySelectorAll('[data-v8-hm-free]').forEach(b => b.onclick = () => {
                this.clear(b.dataset.v8HmFree, 'them'); toast('已解除'); this.homeOpen(tab);
            });
            bd.querySelectorAll('[data-v8-hm-apply]').forEach(b => b.onclick = () => {
                const cid = b.dataset.v8HmApply;
                Consent.ask({ kind: 'unmute', title: '我申请解除禁言', detail: '来自禁言', by: myName(), from: 'me', cid: cid,
                    apply: () => { this.clear(cid, 'me'); toast('禁言已解除'); } });
                toast('已发出解除申请');
            });
            bd.querySelectorAll('[data-v8-hg-set]').forEach(b => b.onclick = () => {
                const p = b.dataset.v8HgSet.split('|');
                this.gset(p[0], p[1], 10);
                sysMsg('<div class="v8-sys">我在群里禁言了 ' + esc(nm(p[1])) + ' 10 分钟。</div>', null, p[0]);
                toast('已禁言 10 分钟'); this.homeOpen(tab);
            });
            bd.querySelectorAll('[data-v8-hg-free]').forEach(b => b.onclick = () => {
                const p = b.dataset.v8HgFree.split('|'); this.gclear(p[0], p[1]); toast('已解除'); this.homeOpen(tab);
            });
            bd.querySelectorAll('[data-v8-hg-apply]').forEach(b => b.onclick = () => {
                const gid = b.dataset.v8HgApply;
                Consent.ask({ kind: 'gunmute', title: '我申请解除群禁言', detail: '来自群禁言', by: myName(), from: 'me', cid: gid,
                    apply: () => { this.gclear(gid, '__me__'); toast('群禁言已解除'); } });
                toast('已发出解除申请');
            });
            bd.querySelectorAll('[data-v8-hg-open]').forEach(b => b.onclick = () => { close('v8-mute-home-panel'); this.groupOpen(b.dataset.v8HgOpen); });
            const s1 = bd.querySelector('#v8-hm-single'); if (s1) s1.onclick = () => { close('v8-mute-home-panel'); this.open(); };
            const s2 = bd.querySelector('#v8-hm-group'); if (s2) s2.onclick = () => { close('v8-mute-home-panel'); this.groupOpen(sid()); };
            const pmSet = bd.querySelector('#v8-pm-set');
            if (pmSet) pmSet.onclick = () => {
                const f = bd.querySelector('#v8-pm-from'), t = bd.querySelector('#v8-pm-to');
                if (!f || !t || !f.value || !t.value || f.value === t.value) { toast('要选两个不同的人', 'warning'); return; }
                PairMute.set(f.value, t.value, mins('__pair__'));
                toast(nm(f.value) + ' 禁言了 ' + nm(t.value));
                this.homeOpen(tab);
            };
            bd.querySelectorAll('[data-v8-pm-free]').forEach(b => b.onclick = () => {
                const p = b.dataset.v8PmFree.split('|');
                PairMute.clear(p[0], p[1]);
                toast('已直接解除'); this.homeOpen(tab);
            });
            bd.querySelectorAll('[data-v8-pm-apply]').forEach(b => b.onclick = () => {
                const p = b.dataset.v8PmApply.split('|');
                PairMute.clear(p[0], p[1]);
                this.homeOpen(tab);
            });
            bd.querySelectorAll('[data-v8-pairask]').forEach(b => b.onclick = () => {
                const p = b.dataset.v8Pairask.split('|');
                PairAsk.ask(p[0], p[1]);
                toast('已让 ' + nameOf(p[1]) + ' 去申请，等 ' + nameOf(p[0]) + ' 同意');
                this.homeOpen(tab);
            });
            /* 私聊 ① 禁言谁 */
            const mkGo = bd.querySelector('#v8-mk-go');
            if (mkGo) mkGo.onclick = () => {
                const sel = bd.querySelector('#v8-mk-who');
                if (!sel || !sel.value) { toast('先选一个人', 'warning'); return; }
                const minsEl = bd.querySelector('#v8-mk-mins');
                const v = Math.max(1, Math.min(30, Number(minsEl && minsEl.value) || 10));
                const p = sel.value.split('|');
                if (p[0] === 'g') {
                    this.gset(p[1], p[2], v);
                    sysMsg('<div class="v8-sys">我禁言了 ' + esc(nm(p[2])) + ' ' + v + ' 分钟。</div>', null, p[1]);
                    toast('已禁言 ' + esc(nm(p[2])) + ' ' + v + ' 分钟');
                } else {
                    const cid = p[1];
                    this.set(cid, 'them', v);
                    sysMsg('<div class="v8-sys">我禁言了 ' + esc(nm(cid)) + ' ' + v + ' 分钟。</div>', null, cid);
                    toast('已禁言 ' + esc(nm(cid)) + ' ' + v + ' 分钟');
                }
                this.homeOpen(tab);
            };
            /* v16 私聊 ② 申请解除我的禁言状态 */
            const mkUnGo = bd.querySelector('#v8-mk-ungo');
            if (mkUnGo) mkUnGo.onclick = () => {
                const sel = bd.querySelector('#v8-mk-unwho');
                if (!sel || !sel.value) { toast('先选一个人', 'warning'); return; }
                const p = sel.value.split('|'), id = p[1] || '';
                if (p[0] === 'me') {
                    let done = 0;
                    cs.forEach(c => {
                        if (!this.left(c.id, 'me')) return;
                        done++;
                        Consent.ask({ kind: 'unmute', title: '我向 ' + nm(c.id) + ' 申请解除禁言', detail: '来自禁言',
                            by: myName(), from: 'me', cid: c.id,
                            apply: () => { this.clear(c.id, 'me'); toast('禁言已解除'); } });
                    });
                    if (!done) { toast('你现在没有被禁言', 'info'); return; }
                    toast('已发出申请，等对方同意');
                } else if (p[0] === 'c') {
                    if (!this.left(id, 'me')) { toast('你现在没有被 ' + nm(id) + ' 禁言', 'info'); return; }
                    Consent.ask({ kind: 'unmute', title: '我向 ' + nm(id) + ' 申请解除禁言', detail: '来自禁言 · 解除我的禁言状态',
                        by: myName(), from: 'me', cid: id,
                        apply: () => { this.clear(id, 'me'); toast('禁言已解除'); } });
                    toast('已发出申请，等 ' + nm(id) + ' 同意');
                } else {
                    let who = '';
                    try { PairMute.active().forEach(r2 => { if (r2.to === id) who = r2.from; }); } catch (e) {}
                    if (!who) { toast(nm(id) + ' 现在没有被禁言', 'info'); return; }
                    Consent.ask({ kind: 'unmute', title: '我替 ' + nm(id) + ' 向 ' + nm(who) + ' 申请解除禁言',
                        detail: '来自禁言 · 替 ' + nm(id) + ' 申请', by: myName(), from: 'me', cid: who,
                        apply: () => { PairMute.clear(who, id); toast(nm(id) + ' 的禁言已解除'); } });
                    toast('已发出申请，等 ' + nm(who) + ' 同意');
                }
                this.homeOpen(tab);
            };
            /* v16 群聊 ① 申请禁言谁 */
            const gkGo = bd.querySelector('#v8-gk-go');
            if (gkGo) gkGo.onclick = () => {
                const sel = bd.querySelector('#v8-gk-who');
                if (!sel || !sel.value) { toast('先选群里的一个人', 'warning'); return; }
                const minsEl = bd.querySelector('#v8-gk-mins');
                const v = Math.max(1, Math.min(30, Number(minsEl && minsEl.value) || 10));
                const p = sel.value.split('|');
                if (p[0] !== 'g') return;
                this.gset(p[1], p[2], v);
                sysMsg('<div class="v8-sys">我申请禁言了 ' + esc(nm(p[2])) + ' ' + v + ' 分钟。</div>', null, p[1]);
                toast('已申请禁言 ' + esc(nm(p[2])) + ' ' + v + ' 分钟');
                this.homeOpen(tab);
            };
            /* v16 群聊 ② 申请解除我或者任何一位禁言状态 */
            const gkUnGo = bd.querySelector('#v8-gk-ungo');
            if (gkUnGo) gkUnGo.onclick = () => {
                const sel = bd.querySelector('#v8-gk-unwho');
                if (!sel || !sel.value) { toast('先选一个人', 'warning'); return; }
                const p = sel.value.split('|');
                if (p[0] === 'me') {
                    let done = 0;
                    gs.forEach(g => {
                        if (!this.gleft(g.id, '__me__')) return;
                        done++;
                        Consent.ask({ kind: 'gunmute', title: '我申请解除群禁言', detail: '来自群禁言 · 解除我的禁言状态',
                            by: myName(), from: 'me', cid: g.id,
                            apply: () => { this.gclear(g.id, '__me__'); toast('群禁言已解除'); } });
                    });
                    if (!done) { toast('你现在在群里没有被禁言', 'info'); return; }
                    toast('已发出申请，等对方同意');
                } else if (p[0] === 'gm') {
                    const gid = p[1], mid = p[2];
                    if (!this.gleft(gid, mid)) { toast(nm(mid) + ' 现在没有被禁言', 'info'); return; }
                    Consent.ask({ kind: 'gunmute', title: '我替 ' + nm(mid) + ' 申请解除群禁言', detail: '来自群禁言 · 替 ' + nm(mid) + ' 申请',
                        by: myName(), from: 'me', cid: gid,
                        apply: () => { this.gclear(gid, mid); toast(nm(mid) + ' 的禁言已解除'); } });
                    toast('已发出申请，等对方同意');
                }
                this.homeOpen(tab);
            };
            open('v8-mute-home-panel');
            /* 面板内容较长，重开时回到顶部，第一眼就能看到分组和 ① ② */
            try {
                const pn = $('v8-mute-home-panel');
                if (pn) {
                    pn.scrollTop = 0;
                    const inner = pn.querySelector('.hx-panel'); if (inner) inner.scrollTop = 0;
                    const bd2 = pn.querySelector('.hx-body'); if (bd2) bd2.scrollTop = 0;
                }
            } catch (e) {}
        },

        paint() {
            const f = $('v8-mute-fab');
            if (f) {
                const n = this.left(sid(), 'them') + this.left(sid(), 'me');
                f.classList.toggle('on', !!n);
            }
        },
        ensureFab() {
            if ($('v8-mute-fab')) return;
            const b = document.createElement('button');
            b.id = 'v8-mute-fab';
            b.innerHTML = '<i class="fas fa-volume-xmark"></i>';
            b.title = '禁言';
            b.onclick = () => { W.__hxBackToUs = false; this.open(); };
            document.body.appendChild(b);
            this.paint();
        },
        install() {
            // 我禁言对方：对方不主动回复（只影响自动回复，不编造内容）
            try {
                if (typeof W.simulateReply === 'function' && !W.__v8MuteReply) {
                    W.__v8MuteReply = true;
                    const orig = W.simulateReply;
                    W.simulateReply = function () {
                        if (Mute.left(sid(), 'them')) { toast('还在禁言中，TA 暂时不回话', 'info'); return; }
                        return orig.apply(this, arguments);
                    };
                }
            } catch (e) {}
            // 我被禁言：不能发消息，但可一直申请解除
            document.addEventListener('click', e => {
                if (!e.target.closest('#send-btn')) return;
                const cur = (sessionList || []).filter(x => x.id === sid())[0];
                const isGroup = !!(cur && cur.type === 'group');
                const left = isGroup ? Mute.gleft(sid(), '__me__') : Mute.left(sid(), 'me');
                if (!left) return;
                e.stopImmediatePropagation(); e.preventDefault();
                toast('你还在禁言中，可以去「禁言」里申请解除', 'warning');
                try { if (isGroup) Mute.groupOpen(sid()); else Mute.open(); } catch (err) {}
            }, true);
            setInterval(() => this.paint(), 30000);
        }
    };

    /* ============================================================
       6. 主动消息 / 未读（像微信那样显示几条）
       ============================================================ */
    const Unread = {
        key: 'unread',
        data() { return H.get(this.key, {}); },
        save(d) { H.set(this.key, d); },
        pool() {
            let arr = [];
            try { if (typeof customReplies !== 'undefined' && Array.isArray(customReplies)) arr = customReplies.slice(); } catch (e) {}
            if (!arr.length) { try { if (W._customReplies && W._customReplies.length) arr = W._customReplies.slice(); } catch (e) {} }
            return arr.map(x => (typeof x === 'string' ? x : String((x && (x.text || x.content || x.value)) || ''))).map(x => x.trim()).filter(Boolean);
        },
        add(id, text, by) {
            const d = this.data();
            d[id] = d[id] || { n: 0, items: [] };
            d[id].n++;
            d[id].items.push({ text: text, by: by || nameOf(id), ts: Date.now() });
            if (d[id].items.length > 20) d[id].items.shift();
            this.save(d); this.paint();
        },
        clear(id) { const d = this.data(); if (d[id]) { d[id] = { n: 0, items: [] }; this.save(d); } this.paint(); },
        count(id) { const d = this.data(); return d[id] ? d[id].n : 0; },
        total() { const d = this.data(); return Object.keys(d).reduce((a, k) => a + (d[k].n || 0), 0); },
        deliver(id) {
            const d = this.data();
            const items = (d[id] && d[id].items) || [];
            if (!items.length) return;
            items.forEach(it => {
                try {
                    addMessage({
                        id: 'v8-u-' + it.ts + '-' + Math.floor(Math.random() * 999),
                        sender: 'partner', type: 'normal', text: it.text, timestamp: new Date(it.ts), status: 'sent'
                    });
                } catch (e) {}
            });
            this.clear(id);
        },
        paint() {
            // 主页「聊天 / 群聊」组件角标
            const hs = $('home-screen');
            if (hs) {
                const c = this.total();
                ['chat', 'group'].forEach(k => {
                    const b = hs.querySelector('[data-hgopen="' + k + '"]');
                    if (!b) return;
                    let n = 0;
                    try {
                        (sessionList || []).forEach(s => {
                            const isGroup = s.type === 'group';
                            if ((k === 'group' && isGroup) || (k === 'chat' && !isGroup)) n += this.count(s.id);
                        });
                    } catch (e) {}
                    let badge = b.querySelector('.v8-badge');
                    if (n) {
                        if (!badge) { badge = document.createElement('span'); badge.className = 'v8-badge'; b.querySelector('.hg-widget-tile').appendChild(badge); }
                        badge.textContent = n > 99 ? '99+' : n;
                    } else if (badge) badge.remove();
                });
            }
            // 联系人 / 群聊列表里每行显示几条
            document.querySelectorAll('.hx-item[data-hx-copen], .hx-item[data-hx-open], .hx-item[data-hx-gopen2]').forEach(el => {
                const id = el.dataset.hxCopen || el.dataset.hxOpen || el.dataset.hxGopen2;
                const n = this.count(id);
                let tag = el.querySelector('.v8-unread-tag');
                if (n) {
                    if (!tag) { tag = document.createElement('span'); tag.className = 'v8-unread-tag'; el.appendChild(tag); }
                    tag.textContent = n + ' 条';
                } else if (tag) tag.remove();
            });
        },
        tick() {
            const pool = this.pool();
            if (!pool.length) return;                      // 没有保存过的回复，就不生成任何内容
            let list = [];
            try { list = (sessionList || []).slice(); } catch (e) {}
            if (!list.length) return;
            const others = list.filter(s => s.id !== sid());
            const pickFrom = others.length ? others : list;
            const s = pickFrom[Math.floor(Math.random() * pickFrom.length)];
            const text = pool[Math.floor(Math.random() * pool.length)];
            const away = !!(home() && home().shown) || !!document.querySelector('.hx-modal.on') || !!document.querySelector('.modal[style*="flex"]');
            if (s.id === sid() && !away) {
                try {
                    addMessage({ id: 'v8-live-' + Date.now(), sender: s.type === 'group' ? 'partner' : 'partner', type: 'normal', text: text, timestamp: new Date(), status: 'sent' });
                } catch (e) {}
                toast(nameOf(s.id) + ' 发来一条消息');
            } else {
                this.add(s.id, text, nameOf(s.id));
                toast(nameOf(s.id) + ' 发来一条消息');
            }
        },
        install() {
            // 进入某个会话后，把攒下的消息补进聊天框
            const hx = HX();
            if (hx && hx.switchSession && !W.__v8UnreadHook) {
                W.__v8UnreadHook = true;
                const orig = hx.switchSession;
                hx.switchSession = function (id, opts) {
                    const r = orig.apply(this, arguments);
                    setTimeout(() => Unread.deliver(id), 2400);
                    return r;
                };
            }
            setTimeout(() => { try { if (Unread.pool().length) Unread.tick(); } catch (e) {} }, 9000);
            setInterval(() => { if (Math.random() < 0.75) this.tick(); }, 52000);
            setInterval(() => this.paint(), 4000);
            // 首页渲染后补角标
            if (home() && home().render && !W.__v8HomeRenderHook) {
                W.__v8HomeRenderHook = true;
                const orig = home().render;
                home().render = function () { const r = orig.apply(this, arguments); try { Unread.paint(); } catch (e) {} return r; };
            }
        }
    };

    /* ============================================================
       7. 朋友圈：全屏 / 互相改封面需同意 / 梦角用素材 / 字卡权限
       ============================================================ */
    const Moments = {
        full(on) { document.body.classList.toggle('v8-mf-full', !!on); },
        installClick() {
            document.addEventListener('click', e => {
                if (e.target.closest('[data-lp="moments"]') || e.target.closest('[data-hgopen="moments"]')) {
                    setTimeout(() => this.full(true), 120);
                }
                if (e.target.closest('[data-lp-back]') || e.target.closest('#love-panel-close')) {
                    setTimeout(() => this.full(false), 80);
                }
            }, true);
            // 直接关弹层也退出全屏
            const origHide = W.hideModal;
            if (typeof origHide === 'function') {
                W.hideModal = function (m) {
                    if (m && m.id === 'love-panel-modal') Moments.full(false);
                    return origHide.apply(this, arguments);
                };
            }
        },
        installMF() {
            const MF = W.GX && W.GX.MF;
            if (!MF || MF.__v8) return;
            MF.__v8 = true;
            const origRender = MF.render;
            MF.render = function () {
                const r = origRender.apply(this, arguments);
                try { Moments.injectCoverBtns(this); } catch (e) {}
                return r;
            };
            // 梦角发动态：可用字卡优先，且从素材库里挑（都来自用户保存过的内容）
            const origSchedule = MF.schedule;
            MF.schedule = function (authorId, delay) {
                const before = this.outbox.length;
                const r = origSchedule.apply(this, arguments);
                try {
                    const item = this.outbox[before];
                    if (item) {
                        const cards = Cards.allowedTexts(authorId);
                        if (cards.length) item.text = cards[Math.floor(Math.random() * cards.length)];
                        const ms = (HX() && HX().Materials) ? HX().Materials.lib().filter(m => m.type === 'image' || m.type === 'shot') : [];
                        if (ms.length && Math.random() < 0.5) item.img = ms[Math.floor(Math.random() * ms.length)].content;
                    }
                } catch (e) {}
                return r;
            };
            const origDeliver = MF.deliverDue;
            MF.deliverDue = function () {
                const imgs = {};
                try { (this.outbox || []).forEach(o => { if (o.img && o.due <= Date.now()) imgs[o.author] = o.img; }); } catch (e) {}
                const before = this.feed.length;
                const got = origDeliver.apply(this, arguments);
                try {
                    for (let i = before; i < this.feed.length; i++) {
                        const f = this.feed[i];
                        if (f && !f.img && imgs[f.author]) f.img = imgs[f.author];
                    }
                    if (got) this.persist();
                } catch (e) {}
                return got;
            };
            try { MF.render(); } catch (e) {}
        },
        injectCoverBtns(MF) {
            const bd = $('lp-body');
            if (!bd) return;
            const prof = bd.querySelector('.mf-profile');
            if (!prof || prof.querySelector('#v8-cover-them')) return;
            const cur = MF.people().filter(p => p.id === MF.view)[0];
            if (!cur) return;
            const b = document.createElement('button');
            b.id = 'v8-cover-them';
            b.className = 'mf-cover-btn';
            b.innerHTML = '<i class="fas fa-image"></i> 更换封面';
            prof.appendChild(b);
            const inp = document.createElement('input');
            inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
            prof.appendChild(inp);
            b.onclick = () => inp.click();
            inp.onchange = async e => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                try {
                    const url = await shrink(f, 1000);
                    if (cur.me) {
                        /* 我换我自己的封面：直接生效，不用任何人同意 */
                        MF.setCoverFor('__me__', url, 'me');
                        toast('封面已更换');
                    } else {
                        /* 我给 TA 换：请求发到聊天框，由 TA 同意（不提醒我） */
                        Consent.ask({
                            kind: 'cover', title: '我想给「' + cur.name + '」换朋友圈封面',
                            detail: '来自朋友圈', by: myName(), from: 'me', cid: cur.id,
                            apply: () => MF.setCoverFor(cur.id, url, 'me')
                        });
                    }
                } catch (err) { toast('这张图片读不了', 'warning'); }
                e.target.value = '';
            };
            // TA 也可以主动申请改我的封面 → 走同一个同意流程
            if (cur.me) {
                const b2 = document.createElement('button');
                b2.id = 'v8-cover-askthem';
                b2.className = 'mf-cover-btn';
                b2.innerHTML = '<i class="fas fa-heart"></i> 让 TA 帮我换';
                prof.appendChild(b2);
                b2.onclick = () => {
                    const pool = ['vendor/covers/c2.jpg', 'vendor/covers/c4.jpg', 'vendor/covers/c6.jpg'];
                    const u = pool[Math.floor(Math.random() * pool.length)];
                    Consent.ask({
                        kind: 'coverThem', title: partnerName() + ' 想帮我换朋友圈封面',
                        detail: '来自朋友圈', by: partnerName(), from: 'them',
                        apply: () => MF.setCoverFor('__me__', u, 'them')
                    });
                };
            }
        }
    };

    /* ============================================================
       8. 字卡分组「给谁用」
       ============================================================ */
    const Cards = {
        key: 'groupfor',
        assetKey: 'assetfor',
        map() { return H.get(this.key, {}); },
        forWho(gid) { return this.map()[String(gid)] || 'both'; },
        setForWho(gid, v) { const d = this.map(); d[String(gid)] = v || 'both'; H.set(this.key, d); },
        libMap() { return H.get('libfor', {}); },
        libFor(kind) { return this.libMap()[kind] || 'both'; },
        setLibFor(kind, v) { const d = this.libMap(); d[kind] = v || 'both'; H.set('libfor', d); },
        assetMap() { return H.get(this.assetKey, {}); },
        assetFor(kind, idx) { return this.assetMap()[kind + ':' + idx] || 'both'; },
        setAssetFor(kind, idx, v) {
            const m = this.assetMap(); m[kind + ':' + idx] = v || 'both'; H.set(this.assetKey, m);
        },
        /* 某个联系人能用哪些 emoji / 贴纸（索引） */
        allowedAssets(kind, cid) {
            const cs = contacts();
            const isFirst = !cid || cid === (cs[0] && cs[0].id);
            const libFw = this.libFor(kind === 'emojic' ? 'emoji' : kind);
            if ((libFw === 'c1' && !isFirst) || (libFw === 'c2' && isFirst)) return [];
            const m = this.assetMap();
            const out = [];
            Object.keys(m).forEach(k => {
                if (k.indexOf(kind + ':') !== 0) return;
                const fw = m[k];
                if (fw === 'c1' && !isFirst) return;
                if (fw === 'c2' && isFirst) return;
                out.push(Number(k.split(':')[1]));
            });
            return out;
        },
        allowedTexts(cid) {
            let groups = [], replies = [];
            try { groups = W.customReplyGroups || []; } catch (e) {}
            try { replies = (typeof customReplies !== 'undefined' && customReplies) ? customReplies : []; } catch (e) {}
            const cs = contacts();
            const isFirst = !cid || cid === (cs[0] && cs[0].id);
            const out = [];
            groups.forEach(g => {
                const fw = this.forWho(g.id);
                if (fw === 'c1' && !isFirst) return;
                if (fw === 'c2' && isFirst) return;
                (g.items || []).forEach(i => {
                    const idx = (typeof i === 'object' && i !== null) ? i.idx : Number(i);
                    const r = replies[idx];
                    const t = r ? (typeof r === 'string' ? r.trim() : String(r.text || r.content || '').trim()) : '';
                    if (t) out.push(t);
                });
            });
            return out;
        },
        injectPanel() {
            /* 「给谁用」已放进「新建分组 / 管理分组」和 Emoji / 表情库里，不再堆在回复库底部 */
            const old = $('v8-cardfor');
            if (old) old.remove();
        },
        paint() {
            const box = $('v8-cardfor');
            if (!box) return;
            let groups = [];
            try { groups = W.customReplyGroups || []; } catch (e) {}
            const cs = contacts();
            const n1 = (cs[0] && cs[0].name) || '第一位', n2 = (cs[1] && cs[1].name) || '第二位';
            box.innerHTML = '<div class="settings-section-title"><i class="fas fa-user-tag"></i>分组给谁用</div>'
                + (groups.length ? groups.map(g =>
                    '<div class="v8-cardfor-row"><span>' + esc(g.name || '分组') + '</span>'
                    + '<select data-v8-gfor="' + esc(g.id) + '">'
                    + ['both', 'c1', 'c2'].map(v => '<option value="' + v + '" ' + (this.forWho(g.id) === v ? 'selected' : '') + '>'
                        + (v === 'both' ? '两位都用' : (v === 'c1' ? esc(n1) : esc(n2))) + '</option>').join('')
                    + '</select></div>').join('')
                    : '<div class="hx-empty">还没有分组</div>');
            box.querySelectorAll('[data-v8-gfor]').forEach(sl => sl.onchange = () => {
                const d = this.map(); d[String(sl.dataset.v8Gfor)] = sl.value; H.set(this.key, d);
                toast('已设置');
            });
        }
    };

    /* ============================================================
       9. 信箱：寄出「给…」/ 收到「来自…」（都能指定是谁）
       ============================================================ */
    const Envelope = {
        people() {
            const all = (typeof sessionList !== 'undefined' && sessionList) ? sessionList : [];
            const cs = all.filter(x => x.type !== 'group');
            const out = cs.filter(c => c.id && c.name).map(c => ({ id: c.id, name: c.name }));
            if (!out.length) out.push({ id: sid(), name: partnerName() });
            return out;
        },
        install() {
            /* 寄出按钮在 listeners.js 里绑定的是原函数引用，包装全局函数不生效，
               因此改为：捕获阶段记下寄出前的数量与所选收件人，目标阶段（注册更晚、
               在原函数之后执行）把收件人写进新寄出的那封信。 */
            const btn = $('send-envelope');
            if (btn && !btn.__v8EnvBound) {
                btn.__v8EnvBound = true;
                btn.addEventListener('click', () => {
                    try { W.__v8EnvToBefore = envelopeData.outbox.length; } catch (e) { W.__v8EnvToBefore = -1; }
                    const sel = $('v8-env-to-sel');
                    W.__v8EnvToName = (sel && sel.value) ? sel.value : partnerName();
                }, true);
                btn.addEventListener('click', () => {
                    try {
                        const before = W.__v8EnvToBefore;
                        const arr = envelopeData.outbox || [];
                        if (before >= 0 && arr.length === before + 1) {
                            arr[arr.length - 1].toName = W.__v8EnvToName || partnerName();
                            saveEnvelopeData();
                            Envelope.tag('outbox');
                        }
                    } catch (e) {}
                });
            }
            /* v10：写信表单里新增「给…」选择 */
            const origCompose = W.openNewEnvelopeForm;
            if (typeof origCompose === 'function' && !W.__v8EnvCompose) {
                W.__v8EnvCompose = true;
                W.openNewEnvelopeForm = function () {
                    const r = origCompose.apply(this, arguments);
                    try { Envelope.composeBar(); } catch (e) {}
                    return r;
                };
            }
            const wrap = (name, kind) => {
                const orig = W[name];
                if (typeof orig !== 'function' || W['__v8Env_' + name]) return;
                W['__v8Env_' + name] = true;
                W[name] = function () {
                    const r = orig.apply(this, arguments);
                    try { Envelope.tag(kind); } catch (e) {}
                    return r;
                };
            };
            wrap('renderOutboxList', 'outbox');
            wrap('renderInboxList', 'inbox');
        },
        composeBar() {
            const form = $('env-compose-form');
            if (!form) return;
            let bar = $('v8-env-torow');
            if (!bar) {
                bar = document.createElement('div');
                bar.id = 'v8-env-torow';
                bar.className = 'v8-env-torow';
                const ta = $('envelope-input');
                if (ta && ta.parentNode) ta.parentNode.insertBefore(bar, ta.nextSibling);
                else form.appendChild(bar);
            }
            const cur = partnerName(), opts = this.people();
            bar.innerHTML = '<span class="v8-env-tolabel">给…</span><select id="v8-env-to-sel">'
                + opts.map(p => '<option value="' + esc(p.name) + '"' + (p.name === cur ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('')
                + '</select><span class="v8-env-tohint">选这封信寄给谁</span>';
        },
        find(kind, id) {
            try {
                const arr = (kind === 'outbox' ? envelopeData.outbox : envelopeData.inbox) || [];
                return arr.filter(l => l.id === id)[0] || null;
            } catch (e) { return null; }
        },
        tag(kind) {
            const list = $(kind === 'outbox' ? 'env-outbox-list' : 'env-inbox-list');
            if (!list) return;
            let arr = [];
            try { arr = (kind === 'outbox' ? envelopeData.outbox : envelopeData.inbox).slice().reverse(); } catch (e) {}
            list.querySelectorAll('.env-letter-item').forEach((el, i) => {
                const oc = el.getAttribute('onclick') || '';
                const m = oc.match(/,\s*'([^']+)'\s*\)/);
                const id = m ? m[1] : '';
                const l = (id && Envelope.find(kind, id)) || arr[i];
                let nm;
                if (kind === 'outbox') nm = (l && l.toName) || partnerName();
                else {
                    nm = (l && (l.fromName || l.toName)) || '';
                    if (!nm && l && l.refId) {
                        try { const src = (envelopeData.outbox || []).filter(x => x.id === l.refId)[0]; if (src) nm = src.toName || ''; } catch (e) {}
                    }
                    if (!nm) nm = partnerName();
                }
                const label = (kind === 'outbox' ? '给 ' : '来自 ') + nm + ' ▾';
                let b = el.querySelector('.v8-env-to');
                if (b) {
                    /* 已存在：刷新文字（例如刚寄出、收件人刚写入时），不重复创建 */
                    b.textContent = label;
                    b.dataset.v8envid = id;
                    b.onclick = e => { e.stopPropagation(); e.preventDefault(); Envelope.pick(kind, id); };
                    return;
                }
                b = document.createElement('button');
                b.type = 'button';
                b.className = 'v8-env-to';
                b.dataset.v8envkind = kind;
                b.dataset.v8envid = id;
                b.textContent = label;
                b.onclick = e => { e.stopPropagation(); e.preventDefault(); Envelope.pick(kind, id); };
                const head = el.querySelector('.env-letter-header-from');
                if (head) head.appendChild(b);
            });
        },
        pick(kind, id) {
            const l = this.find(kind, id);
            const cur = kind === 'outbox' ? ((l && l.toName) || partnerName()) : ((l && (l.fromName || l.toName)) || partnerName());
            const field = kind === 'outbox' ? 'toName' : 'fromName';
            const opts = this.people();
            panel('v8-env-pick-panel', kind === 'outbox' ? '这封信给…' : '这封信来自…',
                '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-user"></i>选一个人</div>'
                + '<div class="v8-env-people">' + opts.map(p =>
                    '<button class="hx-btn" data-v8-envpick="' + esc(p.name) + '">' + esc(p.name) + '</button>').join('') + '</div>'
                + '<div style="display:flex;gap:8px;margin-top:10px;"><input class="hx-input" id="v8-env-pick-custom" placeholder="也可以自己写名字" maxlength="12">'
                + '<button class="hx-btn primary" id="v8-env-pick-save">保存</button></div>'
                + '<div class="hx-empty" style="margin-top:8px;">当前：' + esc(cur) + '</div></div>');
            const bd = body('v8-env-pick-panel');
            if (!bd) return;
            const apply = v => {
                v = (v || '').trim();
                if (!v || !l) return;
                l[field] = v;
                try { saveEnvelopeData(); renderEnvelopeLists(); } catch (e) {}
                close('v8-env-pick-panel');
                toast('已设为 ' + v);
            };
            bd.querySelectorAll('[data-v8-envpick]').forEach(x => x.onclick = () => apply(x.dataset.v8Envpick));
            const sv = bd.querySelector('#v8-env-pick-save');
            if (sv) sv.onclick = () => apply(bd.querySelector('#v8-env-pick-custom').value);
            open('v8-env-pick-panel');
        }
    };

    /* ============================================================
       11. 心情手账：显示两个人的心情（各点各的，不编造）
       ============================================================ */
    const MoodJournal = {
        box: null,
        install() {
            const m = $('mood-modal');
            if (!m) return;
            const content = m.querySelector('.modal-content');
            if (!content) return;
            let box = $('v8-mj-box');
            if (!box) {
                box = document.createElement('div');
                box.id = 'v8-mj-box';
                box.className = 'v8-mj-box';
                content.insertBefore(box, content.firstChild);
            }
            this.box = box;
            this.paint();
        },
        paint() {
            const box = this.box || $('v8-mj-box');
            if (!box) return;
            const cs = contacts();
            const c1 = cs[0] || { id: sid(), name: partnerName() };
            const c2 = cs[1];
            const cell = (c, idx) => {
                const has = !!(c && c.id);
                const v = has ? Mood.get(c.id) : '';
                return '<div class="v8-mj-cell' + (has ? '' : ' empty') + '" data-v8-mj-open="' + (has ? esc(c.id) : '') + '">'
                    + '<div class="v8-mj-who">' + esc((c && c.name) || ('第' + idx + '位')) + ' 的心情</div>'
                    + '<div class="v8-mj-emoji">' + (has ? Mood.html(v) : '—') + '</div>'
                    + '<div class="v8-mj-sub">' + (has ? esc(Mood.who(c.id) || 'TA 自己选的') : '还没有第二位联系人') + '</div>'
                    + (has ? '<button class="hx-btn block primary" data-v8-mj-ask="' + esc(c.id) + '">让 TA 自己换一个</button>' : '')
                    + '</div>';
            };
            box.innerHTML = '<div class="v8-mj-title"><i class="fas fa-face-smile"></i> 两个人的心情</div>'
                + '<div class="v8-mj-grid">' + cell(c1, 1) + cell(c2, 2) + '</div>';
            box.querySelectorAll('[data-v8-mj-ask]').forEach(b => b.onclick = e => {
                e.stopPropagation(); Mood.askThem(b.dataset.v8MjAsk); setTimeout(() => this.paint(), 2800);
            });
            box.querySelectorAll('[data-v8-mj-open]').forEach(d => d.onclick = () => { if (d.dataset.v8MjOpen) Mood.open(d.dataset.v8MjOpen); });
        }
    };

    /* ============================================================
       10. 拥有群聊 tab（本群管理右边）
       ============================================================ */
    const Owned = {
        install() {
            const tab = $('gm-owned-tab');
            if (!tab) return;
            tab.onclick = () => this.show();
        },
        show() {
            const view = $('gm-view-owned');
            if (!view) return;
            ['gm-view-create', 'gm-view-manage'].forEach(id => { const e = $(id); if (e) e.style.display = 'none'; });
            view.style.display = '';
            document.querySelectorAll('.gm-tab').forEach(t => t.classList.toggle('active', t.id === 'gm-owned-tab'));
            const cg = $('create-group-btn'); if (cg) cg.style.display = 'none';
            this.render();
        },
        render() {
            const view = $('gm-view-owned');
            if (!view) return;
            const gs = groups().filter(g => g.owner === 'them');
            const cs = contacts();
            view.innerHTML = '<div class="settings-section"><div class="settings-section-title"><i class="fas fa-envelope-open-text"></i>拥有群聊</div>'
                + (gs.length ? gs.map(g =>
                    '<div class="hx-item"><div class="hx-item-main"><div class="hx-item-name">' + esc(g.name) + '</div>'
                    + '<div class="hx-item-sub">' + ((g.members || []).length + 1) + ' 人 · 由 TA 建群</div></div>'
                    + '<div class="hx-item-act"><button class="hx-btn" style="padding:5px 9px;font-size:11px;" data-v8-owned-invite="' + esc(g.id) + '">邀请</button>'
                    + '<button class="hx-btn" style="padding:5px 9px;font-size:11px;" data-v8-owned-open="' + esc(g.id) + '">进入</button></div></div>').join('')
                    : '<div class="hx-empty">还没有人邀请你进群</div>')
                + (cs.length ? '<div class="hx-sec" style="margin-top:10px;"><select class="hx-input" id="v8-owned-who">'
                    + cs.map(c => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('') + '</select></div>' : '')
                + '</div>';
            view.querySelectorAll('[data-v8-owned-open]').forEach(b => b.onclick = () => {
                const m = $('group-chat-modal'); if (m) m.style.display = 'none';
                HX().switchSession(b.dataset.v8OwnedOpen, { force: true });
            });
            view.querySelectorAll('[data-v8-owned-invite]').forEach(b => b.onclick = () => {
                const gid = b.dataset.v8OwnedInvite;
                const g = groups().filter(x => x.id === gid)[0] || {};
                const sel = view.querySelector('#v8-owned-who');
                const cid = sel && sel.value;
                if (!cid) { toast('先新建一位联系人', 'warning'); return; }
                const nm = nameOf(cid);
                Consent.ask({
                    kind: 'ownedInvite', title: '邀请「' + nm + '」进「' + (g.name || '群聊') + '」',
                    detail: '来自拥有群聊 · 需建群的人同意', by: partnerName(), from: 'them',
                    apply: () => {
                        try {
                            if (Array.isArray(g.members) && g.members.indexOf(cid) < 0) g.members.push(cid);
                            localforage.setItem((typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'CHAT_APP_V3_') + 'sessionList', sessionList).catch(() => {});
                        } catch (e) {}
                    }
                });
            });
        }
    };

    /* ============================================================
       11. 从 🤍 打开原生弹层时的「返回 🤍」
       ============================================================ */
    function installBackToUs() {
        const orig = W.showModal;
        if (typeof orig !== 'function' || W.__v8ShowModal) return;
        W.__v8ShowModal = true;
        W.showModal = function (m) {
            const r = orig.apply(this, arguments);
            try {
                const fresh = W.__hxBackToUs && (Date.now() - (W.__hxBackToUsAt || 0) < 8000);
                if (!fresh || !m || !m.classList || !m.classList.contains('modal')) return r;
                const c = m.querySelector('.modal-content');
                if (!c) return r;
                let b = c.querySelector(':scope > .v8-back-us');
                if (!b) {
                    b = document.createElement('button');
                    b.className = 'v8-back-us';
                    b.innerHTML = '<i class="fas fa-chevron-left"></i> 返回 🤍';
                    c.insertBefore(b, c.firstChild);
                    b.onclick = () => {
                        m.style.display = 'none';
                        W.__hxBackToUs = false;
                        HX().Us.open();
                    };
                }
                b.style.display = '';
            } catch (e) {}
            return r;
        };
    }

    /* ============================================================
       12. 🤍 里加「待同意」入口
       ============================================================ */
    function installUsEntry() {
        const hx = HX();
        if (!hx || !hx.Us || hx.Us.__v8) return;
        hx.Us.__v8 = true;
        const orig = hx.Us.open;
        hx.Us.open = function () {
            const r = orig.apply(this, arguments);
            try {
                const bd = body('hx-us-panel');
                if (bd && !bd.querySelector('[data-hx-us="consent"]')) {
                    const grid = bd.querySelector('.hx-grid3');
                    if (grid) {
                        const b = document.createElement('button');
                        b.className = 'hx-btn hx-usitem';
                        b.setAttribute('data-hx-us', 'consent');
                        b.innerHTML = '<i class="fas fa-bell"></i><span>待同意</span>';
                        b.onclick = () => { W.__hxBackToUs = true; Consent.open(); };
                        grid.appendChild(b);
                    }
                }
            } catch (e) {}
            return r;
        };
    }

    /* ============================================================
       启动
       ============================================================ */
    /* 旧消息里持久化的同意卡片：按发起方自愈方向，避免仍显示「我同意/拒绝」 */
    function fixLegacyCards() {
        try {
            const all = Consent.all();
            document.querySelectorAll('.v8-consent').forEach(el => {
                const r = all.filter(x => x.id === (el.dataset.v8id || ''))[0];
                let isMe = el.classList.contains('from-me') || !!(r && r.from === 'me');
                if (!isMe && !r) {
                    const t = ((el.querySelector('.v8-consent-t') || {}).textContent || '').trim();
                    if (/^(我想给|我给|我帮|我让|让 |请 )/.test(t)) isMe = true;
                }
                if (!isMe) {
                    if (r && r.status !== 'pending') {
                        const bb = el.querySelector('.v8-consent-b');
                        if (bb && bb.querySelector('[data-v8-agree]')) {
                            bb.innerHTML = '<span class="v8-consent-r">' + (r.status === 'agreed' ? '已同意' : '已拒绝') + '</span>';
                        }
                    } else if (!r && !el.dataset.v8pay) {
                        /* v15：既没有记录、也没有可重建的信息，就别留一个点了没反应的按钮 */
                        const bb2 = el.querySelector('.v8-consent-b');
                        if (bb2 && bb2.querySelector('[data-v8-agree]')) {
                            bb2.innerHTML = '<span class="v8-consent-r">已失效 · 让对方重新发一次</span>';
                        }
                    }
                    return;
                }
                el.classList.add('from-me');
                const b = el.querySelector('.v8-consent-b');
                if (b && b.querySelector('[data-v8-agree]')) {
                    const nm = (r && r.to) || partnerName();
                    b.innerHTML = '<span class="v8-consent-wait">等 ' + esc(nm) + ' 同意或拒绝…</span>'
                        + '<span class="v8-consent-used" data-v8ts="' + ((r && r.ts) || Date.now()) + '">用时 0秒</span>';
                }
                if (!el.querySelector('.v8-consent-dir')) {
                    const d = document.createElement('div');
                    d.className = 'v8-consent-dir';
                    d.textContent = '我发送了一条信息 · 等对方同意或拒绝';
                    el.insertBefore(d, el.firstChild);
                }
            });
        } catch (e) {}
    }

    /* v16：扫描待决定的请求 —— 到 1 小时上限就补决定；顺手把卡片上的用时小字走起来 */
    function sweepConsent() {
        try {
            const now = Date.now();
            const all = Consent.all();
            let dirty = false;
            all.forEach(r => {
                if (r && r.from === 'me' && r.status === 'pending' && !r.decideAt) {
                    r.decideAt = (r.ts || now) + 3600000; dirty = true;
                }
            });
            if (dirty) Consent.save(all);
            all.forEach(r => {
                if (r && r.from === 'me' && r.status === 'pending' && (r.decideAt || 0) <= now) Consent.decideNow(r.id);
            });
            const fresh = Consent.all();
            document.querySelectorAll('.v8-consent').forEach(el => {
                const u = el.querySelector('.v8-consent-used');
                if (!u) return;
                const r = fresh.filter(x => x.id === (el.dataset.v8id || ''))[0];
                if (r && r.status !== 'pending' && r.used != null) u.textContent = '用时 ' + fmtUsed(r.used);
                else u.textContent = '用时 ' + fmtUsed(now - (Number(u.dataset.v8ts) || now));
            });
        } catch (e) {}
    }

    function installEarly() {
        fixLegacyCards();
        sweepConsent();
        Consent.ensureFab();
        Mute.ensureFab();
        Mute.install();
        // 主页显示时隐藏聊天专用悬浮按钮
        setInterval(() => {
            try {
                const onHome = !!(home() && home().shown);
                const mf = $('v8-mute-fab');
                if (mf) mf.style.display = onHome ? 'none' : '';
                const cf = $('v8-consent-fab');
                if (cf) cf.style.display = (onHome || !Consent.pending().length) ? 'none' : '';
                fixLegacyCards();
                sweepConsent();
            } catch (e) {}
        }, 1200);
        installBackToUs();
        document.addEventListener('click', e => {
            const a = e.target.closest('[data-v8-agree]');
            if (a) { e.preventDefault(); Consent.resolve(a.dataset.v8Agree, true, a.closest('.v8-consent')); return; }
            const d = e.target.closest('[data-v8-deny]');
            if (d) { e.preventDefault(); Consent.resolve(d.dataset.v8Deny, false, d.closest('.v8-consent')); return; }
        }, true);
        Moments.installClick();
        Owned.install();
        Envelope.install();
    }

    function hookLists() {
        const hx = HX();
        if (!hx) return;
        ['Contacts', 'Groups', 'Games', 'Materials'].forEach(k => {
            const obj = hx[k];
            if (!obj || obj.__v8paint) return;
            obj.__v8paint = true;
            const orig = obj.open;
            obj.open = function () {
                const r = orig.apply(this, arguments);
                setTimeout(() => { try { Unread.paint(); } catch (e) {} }, 280);
                return r;
            };
        });
    }

    function installLate() {
        Unread.install();
        hookLists();
        installUsEntry();
        Cards.injectPanel();
        MoodJournal.install();
        Moments.installMF();
        Consent.paint();
        Mute.paint();
        Unread.paint();
        // 弹层打开时刷新「分组给谁用」
        document.addEventListener('click', e => {
            if (e.target.closest('#custom-replies-function, [data-hx-set="replies"], [data-hgopen="replies"]')) {
                setTimeout(() => { Cards.injectPanel(); Cards.paint(); }, 400);
            }
            if (e.target.closest('#gm-owned-tab')) setTimeout(() => Owned.render(), 100);
            if (e.target.closest('.gm-tab') && !e.target.closest('#gm-owned-tab')) {
                const ov = $('gm-view-owned'); if (ov) ov.style.display = 'none';
            }
        }, true);
    }

    function boot() {
        installEarly();
        let n = 0;
        const t = setInterval(() => {
            n++;
            if (W.HomeExt && W.HomeExt.Home && W.GX && W.GX.MF) { clearInterval(t); installLate(); }
            else if (n > 90) { clearInterval(t); installLate(); }
        }, 200);
    }

    W.V8 = { Consent: Consent, Mood: Mood, Nicknames: Nicknames, Avatars: Avatars, Mute: Mute, PairMute: PairMute, PairAsk: PairAsk, Unread: Unread, Moments: Moments, Cards: Cards, Envelope: Envelope, Owned: Owned, MoodJournal: MoodJournal };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 800));
    else setTimeout(boot, 800);
})();
