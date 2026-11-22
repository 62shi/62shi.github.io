/* ============================================================
   final2-ext.js —— 最终改造（仅增量，不改原站功能逻辑）
   1) 头像库：两人一组、用过的组保留、换一组需双向同意、拒绝后可再申请
   2) 删除联系人体系：单聊只一位；群聊里「新增人物」，邀请名单取全局人物
   3) 群聊禁言等原有能力完全保留，不做任何改动
   依赖：love-ext.js（LoveExt）、social-ext.js（GX）、原站 addMessage/settings/sessionList
   ============================================================ */
(function () {
    'use strict';

    const $ = id => document.getElementById(id);
    const P = () => { try { return APP_PREFIX || 'CHAT_APP_V3_'; } catch (e) { return 'CHAT_APP_V3_'; } };
    const GK = b => P() + 'GLOBAL_' + b;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, t) => { try { if (typeof showNotification === 'function') showNotification(m, t || 'success'); } catch (e) {} };
    const save = () => { try { if (typeof throttledSaveData === 'function') throttledSaveData(); else if (typeof saveData === 'function') saveData(); } catch (e) {} };
    const openModal = id => { const el = $(id); if (!el) return; try { if (typeof showModal === 'function') showModal(el); else el.classList.add('active'); } catch (e) { el.classList.add('active'); } };
    const closeModal = id => { const el = $(id); if (!el) return; try { if (typeof hideModal === 'function') hideModal(el); else el.classList.remove('active'); } catch (e) { el.classList.remove('active'); } };
    const lf = (k, d) => localforage.getItem(k).then(v => (v === null || v === undefined) ? d : v).catch(() => d);
    const ls = (k, v) => localforage.setItem(k, v).catch(() => {});
    const partnerName = () => { try { return (settings && settings.partnerName) || '梦角'; } catch (e) { return '梦角'; } };

    async function waitReady() {
        for (let i = 0; i < 60; i++) {
            try {
                if (typeof SESSION_ID !== 'undefined' && SESSION_ID && typeof localforage !== 'undefined') return true;
            } catch (e) {}
            await new Promise(r => setTimeout(r, 100));
        }
        return false;
    }

    function sysCard(html) {
        try {
            if (typeof addMessage === 'function') {
                addMessage({
                    id: 'f2-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
                    sender: null, type: 'system',
                    text: '<div class="f2-sys">' + html + '</div>',
                    timestamp: new Date()
                });
                save();
                // 自己发出的系统卡片不算「对方来消息」，避免申请自我循环
                try { window.__f2Suppress = (typeof messages !== 'undefined' && messages) ? messages.length : 0; } catch (e) {}
            }
        } catch (e) {}
    }

    function shrink(file, max) {
        max = max || 480;
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onerror = reject;
            fr.onload = () => {
                const img = new Image();
                img.onerror = reject;
                img.onload = () => {
                    const sc = Math.min(1, max / Math.max(img.width, img.height));
                    const c = document.createElement('canvas');
                    c.width = Math.max(1, Math.round(img.width * sc));
                    c.height = Math.max(1, Math.round(img.height * sc));
                    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                    let out = c.toDataURL('image/jpeg', 0.85);
                    if (out.length > 700000) out = c.toDataURL('image/jpeg', 0.7);
                    resolve(out);
                };
                img.src = fr.result;
            };
            fr.readAsDataURL(file);
        });
    }

    function avatarKey(role) {
        let s = '0';
        try { if (typeof SESSION_ID !== 'undefined' && SESSION_ID) s = SESSION_ID; } catch (e) {}
        return P() + s + '_' + (role === 'me' ? 'myAvatar' : 'partnerAvatar');
    }

    /* ============================================================
       一、头像库：两人一组 + 双向同意
       ============================================================ */
    const PairLib = {
        data: { pairs: [], currentId: null },
        tmp: { me: null, partner: null },

        async load() {
            const d = await lf(GK('avatarPairs'), null);
            this.data = (d && Array.isArray(d.pairs))
                ? { pairs: d.pairs, currentId: d.currentId || null }
                : { pairs: [], currentId: null };
            await this.ensureCurrent();
        },
        async ensureCurrent() {
            if (this.data.pairs.length) return;
            const me = await lf(avatarKey('me'), null);
            const pa = await lf(avatarKey('partner'), null);
            const p = { id: 'p_' + Date.now(), me: me || '', partner: pa || '', at: Date.now() };
            this.data.pairs.push(p);
            this.data.currentId = p.id;
            await this.persist();
        },
        persist() { return ls(GK('avatarPairs'), this.data); },
        label(id) {
            const i = this.data.pairs.findIndex(p => p.id === id);
            return '第 ' + (this.data.pairs.length - (i < 0 ? 0 : i)) + ' 组';
        },
        renderFormSlots() {
            ['me', 'partner'].forEach(role => {
                const el = $('alib-slot-' + role);
                if (!el) return;
                const u = this.tmp[role];
                const cap = role === 'me' ? '我的头像' : 'TA 的头像';
                el.innerHTML = (u ? '<img src="' + esc(u) + '" alt="">' : '<span>＋</span>')
                    + '<small>' + cap + '</small>';
                el.classList.toggle('filled', !!u);
            });
        },
        render() {
            const box = $('alib-pairs');
            if (!box) return;
            const cur = this.data.currentId;
            if (!this.data.pairs.length) {
                box.innerHTML = '<div class="alib-empty">还没有头像组，点「新增一组」上传两张。</div>';
                return;
            }
            const av = u => u
                ? '<img src="' + esc(u) + '" alt="">'
                : '<div class="alib-ph"><i class="fas fa-user"></i></div>';
            box.innerHTML = this.data.pairs.map((p, i) => {
                const n = this.data.pairs.length - i;
                const on = p.id === cur;
                const acts = on
                    ? '<div class="alib-pair-acts"><span class="alib-cur-tip">这一组正在用</span></div>'
                    : '<div class="alib-pair-acts">'
                      + '<button class="alib-mini primary" data-alib-apply="' + esc(p.id) + '">申请换成这组</button>'
                      + (this.data.pairs.length > 1 ? '<button class="alib-mini" data-alib-del="' + esc(p.id) + '">删除</button>' : '')
                      + '</div>';
                return '<div class="alib-pair ' + (on ? 'on' : '') + '" data-alib-pair="' + esc(p.id) + '">'
                    + '<div class="alib-pair-imgs">' + av(p.me) + av(p.partner) + '</div>'
                    + '<div class="alib-pair-meta"><b>第 ' + n + ' 组</b>'
                    + (on ? '<span class="alib-cur">正在用</span>' : '<span>用过的</span>') + '</div>'
                    + acts + '</div>';
            }).join('');
        },
        async addPair() {
            const t = this.tmp;
            if (!t.me || !t.partner) { toast('两张头像都要选，才算一组', 'warning'); return false; }
            const p = { id: 'p_' + Date.now() + '_' + Math.floor(Math.random() * 1000), me: t.me, partner: t.partner, at: Date.now() };
            this.data.pairs.unshift(p);
            this.tmp = { me: null, partner: null };
            this.renderFormSlots();
            await this.persist();
            this.render();
            toast('这一组已存进头像库，点它可以申请两人一起换');
            return true;
        },
        async applyPair(id) {
            const p = this.data.pairs.filter(x => x.id === id)[0];
            if (!p) return;
            await ls(avatarKey('me'), p.me);
            await ls(avatarKey('partner'), p.partner);
            this.data.currentId = id;
            await this.persist();
            this.paint(p);
            save();
            this.render();
        },
        paint(p) {
            ['me', 'partner'].forEach(role => {
                const el = $(role === 'me' ? 'my-avatar' : 'partner-avatar');
                const url = p[role];
                if (el) el.innerHTML = url
                    ? '<img src="' + esc(url) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;">'
                    : '<i class="fas fa-user"></i>';
                document.querySelectorAll('.message-avatar img').forEach(img => {
                    const wrap = img.closest('.message-wrapper');
                    const mine = wrap && (wrap.classList.contains('my-message') || wrap.dataset.sender === 'me');
                    if ((role === 'me') === !!mine) img.src = url;
                });
            });
            try { if (typeof updateUI === 'function') updateUI(); } catch (e) {}
        },
        remove(id) {
            if (this.data.pairs.length <= 1) { toast('至少留一组', 'warning'); return; }
            if (id === this.data.currentId) { toast('正在用的这组不能删', 'warning'); return; }
            this.data.pairs = this.data.pairs.filter(p => p.id !== id);
            this.persist();
            this.render();
        },
        /* 我发起：需他同意，拒绝后可再申请 */
        requestFromMe(id) {
            const p = this.data.pairs.filter(x => x.id === id)[0];
            if (!p) return;
            const label = this.label(id);
            sysCard('<b>换头像申请</b>：你申请两个人一起换成「' + esc(label) + '」，等 TA 同意…'
                + '<div class="f2-acts"><button class="f2-btn" data-alib-reask="' + esc(id) + '">再次申请</button></div>');
            const self = this;
            const delay = 3000 + Math.random() * 4000;
            setTimeout(() => {
                if (Math.random() < 0.8) {
                    self.applyPair(id);
                    sysCard('<b>TA 同意了</b>：两个人的头像已一起换成「' + esc(label) + '」。'
                        + '<div class="f2-acts"><button class="f2-btn" data-alib-reask="' + esc(id) + '">再次申请</button></div>');
                } else {
                    sysCard('<b>TA 拒绝了</b>这次换头像，头像没有变。你可以再申请一次。'
                        + '<div class="f2-acts"><button class="f2-btn primary" data-alib-reask="' + esc(id) + '">再次申请</button></div>');
                }
            }, delay);
        },
        /* 他发起：发到聊天里等我同意；拒绝后他还能再申请 */
        requestFromPartner() {
            const others = this.data.pairs.filter(p => p.id !== this.data.currentId);
            if (!others.length) return;
            const p = others[Math.floor(Math.random() * others.length)];
            sysCard('<b>' + esc(partnerName()) + ' 想换头像</b>：TA 申请两个人一起换成「' + esc(this.label(p.id)) + '」，等你同意。'
                + '<div class="f2-acts">'
                + '<button class="f2-btn primary" data-alib-agree="' + esc(p.id) + '">同意</button>'
                + '<button class="f2-btn" data-alib-reject="' + esc(p.id) + '">拒绝</button></div>');
        },
        agree(id) {
            this.applyPair(id);
            sysCard('<b>你同意了</b>：两个人的头像已一起换成「' + esc(this.label(id)) + '」。');
        },
        reject(id) {
            sysCard('你拒绝了这次换头像，头像没有变。TA 之后还可以再申请。');
        }
    };

    /* ============================================================
       二、人物库：单聊只一位；群聊里的人只作为「人物」存在
       ============================================================ */
    const People = {
        editing: null,
        tmpAvatar: '',
        openFromGroup: false,

        list() {
            try {
                const main = (sessionList || []).filter(s => s.type !== 'group' && s.type !== 'person');
                const persons = (sessionList || []).filter(s => s.type === 'person');
                return main.concat(persons);
            } catch (e) { return []; }
        },
        async open(fromGroup, showForm) {
            this.openFromGroup = !!fromGroup;
            await this.render();
            if (!fromGroup) this.hideForm();
            openModal('person-modal');
            if (showForm) this.openForm();
        },
        async render() {
            const box = $('person-list');
            if (!box) return;
            const list = this.list();
            if (!list.length) { box.innerHTML = '<div class="gp-empty">还没有人物。</div>'; return; }
            box.innerHTML = list.map(p => {
                const av = p.avatar
                    ? '<img src="' + esc(p.avatar) + '" alt="">'
                    : esc(String(p.name || '梦').slice(0, 1));
                const isPerson = p.type === 'person';
                const tag = isPerson ? '<span class="person-tag">人物</span>' : '<span class="person-tag main">第一位</span>';
                const sub = isPerson
                    ? ((p.replies || []).length + ' 句默认回复 · 仅用于群聊')
                    : '单聊对象 · 也可以被邀请进群';
                return '<div class="person-row"><div class="person-av">' + av + '</div>'
                    + '<div class="person-info"><div class="person-name">' + esc(p.name || '梦角') + tag + '</div>'
                    + '<div class="person-sub">' + esc(sub) + '</div></div>'
                    + (isPerson
                        ? '<div class="person-acts"><button class="person-mini" data-person-edit="' + esc(p.id) + '">编辑</button>'
                          + '<button class="person-mini danger" data-person-del="' + esc(p.id) + '">删除</button></div>'
                        : '')
                    + '</div>';
            }).join('');
        },
        openForm(id) {
            this.editing = id || null;
            let p = null;
            try { p = id ? (sessionList || []).filter(s => s.id === id)[0] : null; } catch (e) {}
            const f = $('person-form'); if (f) f.style.display = '';
            const t = $('person-form-title');
            if (t) t.innerHTML = p ? '<i class="fas fa-pen"></i> 编辑人物' : '<i class="fas fa-plus"></i> 新增人物';
            const ni = $('person-name'); if (ni) ni.value = p ? (p.name || '') : '';
            const rp = $('person-replies'); if (rp) rp.value = (p && p.replies) ? p.replies.join('\n') : '';
            this.tmpAvatar = p ? (p.avatar || '') : '';
            this.paintAvatar();
        },
        paintAvatar() {
            const el = $('person-avatar-preview');
            if (!el) return;
            el.innerHTML = this.tmpAvatar ? '<img src="' + esc(this.tmpAvatar) + '" alt="">' : '＋';
        },
        hideForm() {
            const f = $('person-form'); if (f) f.style.display = 'none';
            this.editing = null;
            this.tmpAvatar = '';
            this.paintAvatar();
        },
        async save() {
            const name = ((($('person-name') || {}).value) || '').trim();
            if (!name) { toast('先给人物起个名字', 'warning'); return; }
            const replies = ((($('person-replies') || {}).value) || '')
                .split('\n').map(x => x.trim()).filter(Boolean);
            const wasEdit = !!this.editing;
            let newId = null;
            try {
                if (!sessionList) sessionList = [];
                if (wasEdit) {
                    const p = sessionList.filter(s => s.id === this.editing)[0];
                    if (p) { p.name = name; p.avatar = this.tmpAvatar || ''; p.replies = replies; }
                } else {
                    newId = 'person_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                    sessionList.push({
                        id: newId, name: name, type: 'person',
                        avatar: this.tmpAvatar || '', replies: replies,
                        note: '群聊人物', createdAt: Date.now()
                    });
                }
                await localforage.setItem(P() + 'sessionList', sessionList);
                await this.mergeReplies(replies);
                this.hideForm();
                await this.render();
                const G = window.LoveExt && window.LoveExt.GroupNew;
                if (newId && this.openFromGroup && G) {
                    try { G.picked.add(newId); } catch (e) {}
                }
                if (G) { try { G.render(); } catch (e) {} }
                if (this.openFromGroup) {
                    closeModal('person-modal');
                    openModal('group-chat-modal');
                }
                toast(wasEdit ? '人物已更新' : ('已新增「' + name + '」，建群时可以邀请了'));
            } catch (e) { toast('保存失败', 'error'); }
        },
        async mergeReplies(list) {
            if (!list || !list.length) return;
            try {
                const key = GK('customReplies');
                const cur = await lf(key, null);
                const arr = Array.isArray(cur) ? cur.slice() : [];
                list.forEach(r => { if (!arr.includes(r)) arr.push(r); });
                await ls(key, arr);
                try { customReplies = arr; } catch (e) {}
            } catch (e) {}
        },
        async remove(id) {
            try {
                sessionList = (sessionList || []).filter(s => s.id !== id);
                await localforage.setItem(P() + 'sessionList', sessionList);
                await this.render();
                const G = window.LoveExt && window.LoveExt.GroupNew;
                if (G) { try { G.picked.delete(id); G.render(); } catch (e) {} }
                toast('人物已删除');
            } catch (e) {}
        },
        close() {
            const back = this.openFromGroup;
            this.hideForm();
            closeModal('person-modal');
            if (back) {
                openModal('group-chat-modal');
                const G = window.LoveExt && window.LoveExt.GroupNew;
                if (G) { try { G.render(); } catch (e) {} }
            }
            this.openFromGroup = false;
        }
    };

    /* ============================================================
       三、覆盖「新建群聊」：邀请名单取全部人物（第一位 + 新增人物）
       ============================================================ */
    function patchGroupNew() {
        const G = window.LoveExt && window.LoveExt.GroupNew;
        if (!G) return;
        G.render = function () {
            const box = $('new-group-member-list');
            if (!box) return;
            const list = People.list();
            if (!list.length) {
                box.innerHTML = '<div class="gp-empty">还没有人物，点「新增人物」建一位。</div>';
                return;
            }
            box.innerHTML = list.map((p, i) => {
                const av = (p.avatar || '').trim();
                const on = this.picked.has(p.id);
                const tag = p.type === 'person' ? '人物' : (i === 0 ? '第一位' : '梦角');
                return '<div class="gp-item ' + (on ? 'on' : '') + '" data-gp="' + esc(p.id) + '">'
                    + '<div class="gp-av">' + (av ? '<img src="' + esc(av) + '" alt="">' : esc(String(p.name || '梦').slice(0, 1))) + '</div>'
                    + '<div class="gp-name">' + esc(p.name || '梦角') + '<span class="gp-tag">' + tag + '</span></div>'
                    + '<div class="gp-check"><i class="fas fa-check"></i></div></div>';
            }).join('');
            const c = $('new-group-picked');
            if (c) c.textContent = '已选 ' + this.picked.size + ' 位';
        };
        G.create = async function () {
            const name = ((($('new-group-name') || {}).value) || '').trim();
            if (!name) { toast('先给群起个名字', 'warning'); return; }
            if (!this.picked.size) { toast('至少邀请一位', 'warning'); return; }
            const members = Array.from(this.picked);
            const agreed = members.filter(() => Math.random() < 0.85);
            if (!agreed.length) { toast('大家都还没同意，等一会儿再建', 'warning'); return; }
            const newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
            try {
                if (!sessionList) sessionList = [];
                sessionList.push({ id: newId, name: name, type: 'group', members: agreed, createdAt: Date.now() });
                await localforage.setItem(P() + 'sessionList', sessionList);
            } catch (e) {}
            this.picked.clear();
            const ne = $('new-group-name'); if (ne) ne.value = '';
            closeModal('group-chat-modal');
            const skipped = members.length - agreed.length;
            toast('群「' + name + '」已建好' + (skipped ? '，有 ' + skipped + ' 位还没同意' : ''));
            setTimeout(() => { location.hash = newId; location.reload(); }, 600);
        };
    }

    /* 覆盖头像库的「梦角自己换头像」：不再直接生效，改为发申请等我同意 */
    function patchALib() {
        const A = window.LoveExt && window.LoveExt.ALib;
        if (!A) return;
        A.heChanges = function () { /* 由下方 watcher 统一发起申请，不直接换 */ };
        A.apply = function () { /* 头像只能整组换，禁止单张绕过同意 */ };
        if (window.LoveExt) {
            const orig = window.LoveExt.refresh;
            window.LoveExt.refresh = async () => {
                try { if (typeof orig === 'function') await orig(); } catch (e) {}
                try { await PairLib.load(); PairLib.render(); PairLib.renderFormSlots(); } catch (e) {}
            };
        }
    }

    /* 联系人弹层（已无入口）：即使被 hash 直达，也不显示人物记录 */
    function filteredSessionList() {
        const box = $('session-list');
        if (!box) return;
        let list = [];
        try { list = (sessionList || []).filter(s => s.type !== 'person'); } catch (e) {}
        if (!list.length) {
            box.innerHTML = '<div class="stats-empty" style="padding:20px 0;"><p>本软件只有一位梦角</p></div>';
            return;
        }
        box.innerHTML = list.map(s => {
            const av = (s.avatar || '').trim();
            const raw = String(s.name || '梦角').trim();
            const isCur = (typeof SESSION_ID !== 'undefined') && s.id === SESSION_ID;
            const isGroup = s.type === 'group';
            return '<div class="session-item ' + (isCur ? 'active' : '') + '" data-id="' + esc(s.id) + '">'
                + '<div class="contact-av">' + (av ? '<img src="' + esc(av) + '" alt="">' : esc(raw.slice(0, 1))) + '</div>'
                + '<div class="session-info"><div class="session-name">' + esc(raw)
                + (isCur ? '<span class="contact-cur">当前</span>' : '') + '</div>'
                + '<div class="session-meta">' + (isGroup ? '群聊 · ' + ((s.members || []).length + 1) + ' 人' : esc(s.note || '私聊')) + '</div></div>'
                + '<div class="session-actions">'
                + '<button class="session-action-btn rename" title="重命名"><i class="fas fa-pen"></i></button>'
                + '<button class="session-action-btn delete" title="删除"><i class="fas fa-trash"></i></button>'
                + '</div></div>';
        }).join('');
    }

    /* 对方偶尔主动申请换一组（只在库里有别的组时；拒绝后仍会再申请） */
    function startPartnerAvatarWatcher() {
        let last = -1;
        setInterval(() => {
            try {
                const len = (typeof messages !== 'undefined' && messages) ? messages.length : 0;
                if (last < 0) { last = len; return; }
                if (len <= last) { last = len; return; }
                if (window.__f2Suppress === len) { last = len; window.__f2Suppress = null; return; }
                last = len;
                if (PairLib.data.pairs.length < 2) return;
                if (Math.random() > 0.12) return;
                PairLib.requestFromPartner();
            } catch (e) {}
        }, 9000);
    }

    /* ============================================================
       四、事件绑定
       ============================================================ */
    function bind() {
        document.addEventListener('click', e => {
            const t = e.target;
            const q = sel => (t && t.closest) ? t.closest(sel) : null;
            let el;

            // --- 头像库 ---
            el = q('[data-alib-apply]'); if (el) { PairLib.requestFromMe(el.dataset.alibApply); return; }
            el = q('[data-alib-reask]'); if (el) { PairLib.requestFromMe(el.dataset.alibReask); return; }
            el = q('[data-alib-agree]'); if (el) { PairLib.agree(el.dataset.alibAgree); return; }
            el = q('[data-alib-reject]'); if (el) { PairLib.reject(el.dataset.alibReject); return; }
            el = q('[data-alib-del]'); if (el) { e.stopPropagation(); PairLib.remove(el.dataset.alibDel); return; }
            if (q('#alib-add-pair')) { const f = $('alib-pair-form'); if (f) f.style.display = ''; PairLib.renderFormSlots(); return; }
            if (q('#alib-pair-cancel')) {
                const f = $('alib-pair-form'); if (f) f.style.display = 'none';
                PairLib.tmp = { me: null, partner: null }; PairLib.renderFormSlots(); return;
            }
            if (q('#alib-pair-save')) {
                PairLib.addPair().then(ok => { if (ok) { const f = $('alib-pair-form'); if (f) f.style.display = 'none'; } });
                return;
            }
            if (q('#alib-slot-me')) { const fi = $('alib-file-me'); if (fi) fi.click(); return; }
            if (q('#alib-slot-partner')) { const fi = $('alib-file-partner'); if (fi) fi.click(); return; }

            // --- 人物 / 群聊 ---
            if (q('#gp-add-person')) {
                closeModal('group-chat-modal');
                People.open(true, true);
                return;
            }
            if (q('#person-add-btn')) { People.openForm(); return; }
            if (q('#person-cancel')) { People.hideForm(); return; }
            if (q('#person-save')) { People.save(); return; }
            if (q('#person-close')) { People.close(); return; }
            if (q('#person-avatar-preview')) { const fi = $('person-avatar-file'); if (fi) fi.click(); return; }
            el = q('[data-person-edit]'); if (el) { People.openForm(el.dataset.personEdit); return; }
            el = q('[data-person-del]'); if (el) { People.remove(el.dataset.personDel); return; }
        });

        document.addEventListener('change', async e => {
            const id = e.target && e.target.id;
            if (id === 'alib-file-me' || id === 'alib-file-partner') {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                try {
                    const url = await shrink(f, 480);
                    PairLib.tmp[id === 'alib-file-me' ? 'me' : 'partner'] = url;
                    PairLib.renderFormSlots();
                } catch (err) { toast('这张图读不了', 'error'); }
                e.target.value = '';
                return;
            }
            if (id === 'person-avatar-file') {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                try { People.tmpAvatar = await shrink(f, 480); People.paintAvatar(); } catch (err) {}
                e.target.value = '';
            }
        });
    }

    /* ============================================================
       启动
       ============================================================ */
    async function boot() {
        // 暴露给 🫧 面板与其它扩展
        window.People = People;
        window.PairLib = PairLib;

        patchALib();
        patchGroupNew();
        try { window.renderSessionList = filteredSessionList; } catch (e) {}
        bind();

        // 彻底隐藏批量发送（防止收纳模式把它再显示出来）
        ['batch-btn', 'batch-btn-extra'].forEach(id => {
            const el = $(id);
            if (el) el.style.setProperty('display', 'none', 'important');
        });
        // 夜间 / 日间切换按钮恢复可见
        const tt = $('theme-toggle');
        if (tt) tt.style.removeProperty('display');

        await waitReady();
        try {
            await PairLib.load();
            PairLib.render();
            PairLib.renderFormSlots();
        } catch (e) { console.warn('[final2] 头像库初始化失败', e); }
        startPartnerAvatarWatcher();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 60));
    else setTimeout(boot, 60);
})();
