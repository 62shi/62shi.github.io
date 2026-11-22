/* ============================================================
   ❥ 扩展层：头像库 / 昵称库 / ❥ 面板（朋友圈·转账·红包·决定·分享·一起听）
   设计原则：
   1) 布局沿用原站（弹层 + 原生卡片），不新造页面结构
   2) 每条梦角世界线独立存储，头像库/昵称库不共享
   3) 只用原站已有的全局能力：addMessage / renderMessages / settings / localforage
   ============================================================ */
(function () {
    'use strict';

    const W = window;
    const P = () => APP_PREFIX || 'CHAT_APP_V3_';

    function sid() {
        try { return SESSION_ID || null; } catch (e) { return null; }
    }
    // 每条线独立键
    function K(base) {
        const s = sid();
        return s ? `${P()}${s}_${base}` : `${P()}0_${base}`;
    }
    const store = {
        get: (base, def) => localforage.getItem(K(base)).then(v => (v === null || v === undefined) ? def : v).catch(() => def),
        set: (base, val) => localforage.setItem(K(base), val).catch(() => {})
    };

    const toast = (msg, type) => {
        if (typeof showNotification === 'function') showNotification(msg, type || 'success');
    };
    const save = () => {
        if (typeof throttledSaveData === 'function') throttledSaveData();
        else if (typeof saveData === 'function') saveData();
    };
    const openModal = (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (typeof showModal === 'function') showModal(el);
        else el.classList.add('active');
    };
    const closeModal = (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (typeof hideModal === 'function') hideModal(el);
        else el.classList.remove('active');
    };

    /* ---------------- 图片压缩 ---------------- */
    function shrink(file, max) {
        max = max || 640;
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onerror = reject;
            fr.onload = () => {
                const img = new Image();
                img.onerror = reject;
                img.onload = () => {
                    const scale = Math.min(1, max / Math.max(img.width, img.height));
                    const c = document.createElement('canvas');
                    c.width = Math.max(1, Math.round(img.width * scale));
                    c.height = Math.max(1, Math.round(img.height * scale));
                    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                    let out = c.toDataURL('image/jpeg', 0.9);
                    if (out.length > 900000) out = c.toDataURL('image/jpeg', 0.75);
                    resolve(out);
                };
                img.src = fr.result;
            };
            fr.readAsDataURL(file);
        });
    }

    /* ---------------- 头像库 ---------------- */
    const ALib = {
        data: { partner: [], me: [] },
        async load() {
            const d = await store.get('avatarLib', null);
            this.data = (d && typeof d === 'object') ? { partner: d.partner || [], me: d.me || [] } : { partner: [], me: [] };
            await this.ensureCurrent();
        },
        // 把当前正在用的头像也放回库里（首次使用不空）
        async ensureCurrent() {
            for (const role of ['partner', 'me']) {
                const cur = await localforage.getItem(K(role === 'partner' ? 'partnerAvatar' : 'myAvatar')).catch(() => null);
                if (cur && !this.data[role].includes(cur)) this.data[role].unshift(cur);
            }
        },
        persist() { store.set('avatarLib', this.data); },
        async add(role, files) {
            const list = Array.from(files || []);
            if (!list.length) return;
            for (const f of list) {
                if (!/^image\//.test(f.type)) continue;
                try {
                    const url = await shrink(f, 640);
                    if (!this.data[role].includes(url)) this.data[role].unshift(url);
                } catch (e) { /* 跳过坏图 */ }
            }
            this.persist();
            this.render();
            toast(`已加入 ${this.data[role].length} 张头像`);
        },
        async apply(role, url) {
            await localforage.setItem(K(role === 'partner' ? 'partnerAvatar' : 'myAvatar'), url);
            this.paint(role, url);
            this.render();
            save();
            toast(role === 'partner' ? '已换成这张头像' : '你的头像已更换');
        },
        paint(role, url) {
            const el = document.getElementById(role === 'partner' ? 'partner-avatar' : 'my-avatar');
            if (el) {
                el.innerHTML = url
                    ? `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;">`
                    : '<i class="fas fa-user"></i>';
            }
            // 聊天区内的头像跟着刷新
            document.querySelectorAll('.message-avatar img').forEach(img => {
                const wrap = img.closest('.message-wrapper');
                const mine = wrap && wrap.classList.contains('my-message') || (wrap && wrap.dataset.sender === 'me');
                if ((role === 'me') === !!mine) img.src = url;
            });
            try { if (typeof updateUI === 'function') updateUI(); } catch (e) {}
        },
        async remove(role, url) {
            this.data[role] = this.data[role].filter(x => x !== url);
            this.persist();
            this.render();
        },
        render() {
            ['partner', 'me'].forEach(role => {
                const grid = document.getElementById('alib-grid-' + role);
                if (!grid) return;
                const cur = (role === 'partner')
                    ? (document.querySelector('#partner-avatar img') || {}).src
                    : (document.querySelector('#my-avatar img') || {}).src;
                const items = this.data[role] || [];
                grid.innerHTML = items.length
                    ? items.map((u, i) => `
                        <div class="alib-thumb ${cur === u ? 'on' : ''}" data-role="${role}" data-idx="${i}" title="点头像即更换">
                            <img src="${u}" alt="">
                            <button class="alib-del" data-del="${role}" data-idx="${i}" title="从库中移除">×</button>
                        </div>`).join('')
                    : `<div class="alib-empty">还没有头像，点右上角「添加」上传真实图片</div>`;
            });
        },
        // 梦角主动换头像（他自己从库里挑，或顺手帮你换一张）
        async heChanges(who) {
            const pool = this.data[who] || [];
            if (pool.length < 2) {
                toast(who === 'partner' ? '他库里还没有别的头像可选' : '你库里还没有别的头像可选', 'warning');
                return;
            }
            const cur = await localforage.getItem(K(who === 'partner' ? 'partnerAvatar' : 'myAvatar')).catch(() => null);
            const others = pool.filter(u => u !== cur);
            const pick = others[Math.floor(Math.random() * others.length)];
            await this.apply(who, pick);
        }
    };

    /* ---------------- 昵称库 ---------------- */
    const NLib = {
        data: { partner: [], me: [] },
        async load() {
            const d = await store.get('nickLib', null);
            if (d && typeof d === 'object') {
                /* 已有库就用库：不再把当前昵称塞回去，删掉的才能真正删掉 */
                this.data = { partner: d.partner || [], me: d.me || [] };
                return;
            }
            this.data = { partner: [], me: [] };
            const s = settings || {};
            if (s.partnerName) this.data.partner.push(s.partnerName);
            if (s.myName) this.data.me.push(s.myName);
            this.persist();
        },
        persist() { store.set('nickLib', this.data); },
        add(role, name) {
            name = (name || '').trim();
            if (!name) return false;
            if (this.data[role].includes(name)) { toast('这个昵称已经在库里了', 'warning'); return false; }
            this.data[role].unshift(name);
            this.persist();
            this.render();
            return true;
        },
        apply(role, name) {
            if (!settings) return;
            if (role === 'partner') settings.partnerName = name;
            else settings.myName = name;
            if (typeof updateUI === 'function') updateUI();
            this.render();
            this.persist();
            save();
            toast(role === 'partner' ? `他把昵称改成「${name}」` : `你的昵称改成「${name}」`);
        },
        remove(role, name) {
            this.data[role] = this.data[role].filter(x => x !== name);
            this.persist();
            this.render();
        },
        render() {
            ['partner', 'me'].forEach(role => {
                const box = document.getElementById('nlib-chips-' + role);
                if (!box) return;
                const cur = role === 'partner' ? (settings && settings.partnerName) : (settings && settings.myName);
                const list = this.data[role] || [];
                box.innerHTML = list.length
                    ? list.map(n => `
                        <span class="nlib-chip ${cur === n ? 'on' : ''}" data-role="${role}" data-name="${encodeURIComponent(n)}">
                            <span class="nlib-chip-t">${n}</span>
                            <button class="nlib-del" data-role="${role}" data-name="${encodeURIComponent(n)}" title="移除">×</button>
                        </span>`).join('')
                    : `<span class="nlib-empty">还没有昵称，点「添加」存几个</span>`;
            });
        }
    };

    /* ---------------- ❥ 面板 ---------------- */
    // 可选收件人：群会话里列出群成员，单聊里列出所有梦角
    function recipients() {
        const out = [];
        try {
            const inGroup = (sessionList || []).some(s => s.id === SESSION_ID && s.type === 'group');
            if (inGroup && typeof groupChatSettings !== 'undefined' && groupChatSettings.members) {
                groupChatSettings.members.forEach(m => out.push({ id: m.id, name: m.name }));
            }
        } catch (e) {}
        if (!out.length) {
            try {
                (sessionList || []).filter(s => s.type !== 'group').forEach(s => out.push({ id: s.id, name: s.name }));
            } catch (e) {}
        }
        return out;
    }
    function whoRow(title) {
        const list = recipients();
        if (list.length <= 1) return '';
        return `<label>${title || '发给谁'}</label>
            <select id="lp-to" class="lp-select">
                ${list.map((r, i) => `<option value="${i}">${r.name}</option>`).join('')}
            </select>`;
    }
    function whoPicked() {
        const sel = document.getElementById('lp-to');
        const list = recipients();
        if (!sel || !list.length) return { name: (settings && settings.partnerName) || '梦角', id: null };
        return list[Number(sel.value)] || list[0];
    }

    const LP = {
        async open() {
            await this.renderGrid();
            openModal('love-panel-modal');
        },
        renderGrid() {
            const body = document.getElementById('lp-body');
            if (body) { body.style.display = 'none'; body.innerHTML = ''; }
            const grid = document.getElementById('lp-grid');
            if (grid) grid.style.display = '';
        },
        async pick(key) {
            const grid = document.getElementById('lp-grid');
            const body = document.getElementById('lp-body');
            if (!body) return;
            if (grid) grid.style.display = 'none';
            body.style.display = '';
            body.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:12px;">加载中…</div>';
            const map = {
                moments: () => this.moments(),
                transfer: () => this.transfer(),
                redpacket: () => this.redpacket(),
                decide: () => this.decide(),
                share: () => this.share(),
                listen: () => this.listen(),
                // 今日公告 / 视频通话：从顶部、输入栏移进 ᕑᗢᓫ，转发到原功能
                daily: () => {
                    closeModal('love-panel-modal');
                    setTimeout(function () {
                        try { if (typeof reopenDailyGreeting === 'function') reopenDailyGreeting(); } catch (e) {}
                    }, 60);
                },
                call: () => {
                    closeModal('love-panel-modal');
                    setTimeout(function () {
                        const b = document.getElementById('call-toolbar-btn');
                        if (b && b.click) b.click();
                        else if (window.callFeature && typeof window.callFeature.startCall === 'function') window.callFeature.startCall(false);
                    }, 60);
                }
            };
            const fn = map[key];
            if (fn) await fn.call(this);
        },
        back() { this.renderGrid(); },

        /* --- 朋友圈：只能我发；梦角点赞评论 --- */
        async moments() {
            const posts = await store.get('moments', []);
            const body = document.getElementById('lp-body');
            const who = (settings && settings.myName) || '我';
            const partner = (settings && settings.partnerName) || '梦角';
            body.innerHTML = `
                <div class="lp-head"><button class="lp-back" data-lp-back><i class="fas fa-arrow-left"></i></button><span>朋友圈</span></div>
                <div class="mm-compose">
                    <textarea id="mm-input" placeholder="这一刻想说的话…（只能由你自己发，他不能替你发）" maxlength="200"></textarea>
                    <div class="mm-compose-bar">
                        <button class="modal-btn modal-btn-primary" id="mm-send" style="padding:6px 14px;font-size:12px;"><i class="fas fa-paper-plane"></i> 发表</button>
                    </div>
                </div>
                <div class="mm-list" id="mm-list"></div>`;
            const render = () => {
                const listEl = document.getElementById('mm-list');
                if (!listEl) return;
                if (!posts.length) {
                    listEl.innerHTML = '<div class="mm-empty">还没有动态。发第一条吧。</div>';
                    return;
                }
                listEl.innerHTML = posts.slice().reverse().map((p, ri) => {
                    const idx = posts.length - 1 - ri;
                    const likes = (p.likes || []).map(n => `<span class="mm-like-name">${n}</span>`).join('');
                    const cmts = (p.comments || []).map(c => `<div class="mm-cmt"><b>${c.by}</b>：${c.text}</div>`).join('');
                    return `<div class="mm-post">
                        <div class="mm-post-head"><span class="mm-post-name">${who}</span><span class="mm-post-time">${p.time || ''}</span></div>
                        <div class="mm-post-text">${p.text}</div>
                        <div class="mm-post-foot">
                            <button class="mm-act" data-mm-like="${idx}"><i class="fas fa-heart"></i> ${(p.likes || []).length || ''}</button>
                            <button class="mm-act" data-mm-cmt="${idx}"><i class="fas fa-comment"></i> ${(p.comments || []).length || ''}</button>
                        </div>
                        ${likes ? `<div class="mm-likes"><i class="fas fa-heart"></i> ${likes}</div>` : ''}
                        ${cmts ? `<div class="mm-cmts">${cmts}</div>` : ''}
                    </div>`;
                }).join('');
            };
            render();

            const sendBtn = document.getElementById('mm-send');
            if (sendBtn) sendBtn.onclick = async () => {
                const ta = document.getElementById('mm-input');
                const text = (ta.value || '').trim();
                if (!text) { toast('先写点什么', 'warning'); return; }
                posts.push({ text, time: new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }), likes: [], comments: [] });
                await store.set('moments', posts);
                ta.value = '';
                render();
                toast('已发表');
                // 他过几秒来点赞 / 评论（他自己来，不是我替他发）
                const delay = 3000 + Math.random() * 4000;
                setTimeout(async () => {
                    if (Math.random() < 0.85) {
                        posts[posts.length - 1].likes = posts[posts.length - 1].likes || [];
                        if (!posts[posts.length - 1].likes.includes(partner)) posts[posts.length - 1].likes.push(partner);
                    }
                    if (Math.random() < 0.6) {
                        const words = ['看到了。', '这张/这句我记住了。', '嗯，我在。', '今天心情不错？'];
                        posts[posts.length - 1].comments = posts[posts.length - 1].comments || [];
                        posts[posts.length - 1].comments.push({ by: partner, text: words[Math.floor(Math.random() * words.length)] });
                    }
                    await store.set('moments', posts);
                    const box = document.getElementById('mm-list');
                    if (box && document.getElementById('love-panel-modal').classList.contains('active')) render();
                }, delay);
            };
        },

        /* --- 转账 --- */
        async transfer() {
            const body = document.getElementById('lp-body');
            const partner = (settings && settings.partnerName) || '梦角';
            body.innerHTML = `
                <div class="lp-head"><button class="lp-back" data-lp-back><i class="fas fa-arrow-left"></i></button><span>转账</span></div>
                <div class="lp-form">
                    ${whoRow('转给谁')}
                    <label>金额</label>
                    <input type="number" id="tf-amount" placeholder="0.00" min="0.01" step="0.01">
                    <label>备注</label>
                    <input type="text" id="tf-note" placeholder="想对他说的话" maxlength="30">
                    <button class="modal-btn modal-btn-primary" id="tf-send" style="margin-top:12px;"><i class="fas fa-paper-plane"></i> 转给 ${partner}</button>
                </div>`;
            const sel = document.getElementById('lp-to');
            if (sel) sel.onchange = () => { document.getElementById('tf-send').innerHTML = '<i class="fas fa-paper-plane"></i> 转给 ' + whoPicked().name; };
            document.getElementById('tf-send').onclick = () => {
                const amt = parseFloat(document.getElementById('tf-amount').value);
                const note = (document.getElementById('tf-note').value || '').trim();
                if (!amt || amt <= 0) { toast('金额要大于 0', 'warning'); return; }
                this.pushCard('transfer', amt, note, null, whoPicked().name);
                closeModal('love-panel-modal');
            };
        },

        /* --- 红包 --- */
        async redpacket() {
            const body = document.getElementById('lp-body');
            body.innerHTML = `
                <div class="lp-head"><button class="lp-back" data-lp-back><i class="fas fa-arrow-left"></i></button><span>红包</span></div>
                <div class="lp-form">
                    ${whoRow('发给谁')}
                    <label>总金额</label>
                    <input type="number" id="rp-amount" placeholder="0.00" min="0.01" step="0.01">
                    <label>个数</label>
                    <input type="number" id="rp-count" value="1" min="1" max="20">
                    <label>祝福语</label>
                    <input type="text" id="rp-wish" placeholder="恭喜发财，大吉大利" maxlength="24">
                    <button class="modal-btn modal-btn-primary" id="rp-send" style="margin-top:12px;"><i class="fas fa-envelope-open-text"></i> 发红包</button>
                </div>`;
            document.getElementById('rp-send').onclick = () => {
                const amt = parseFloat(document.getElementById('rp-amount').value);
                if (!amt || amt <= 0) { toast('金额要大于 0', 'warning'); return; }
                const wish = (document.getElementById('rp-wish').value || '恭喜发财，大吉大利').trim();
                this.pushCard('redpacket', amt, wish, null, whoPicked().name);
                closeModal('love-panel-modal');
            };
        },

        /* --- 决定 --- */
        async decide() {
            const body = document.getElementById('lp-body');
            const partner = (settings && settings.partnerName) || '梦角';
            body.innerHTML = `
                <div class="lp-head"><button class="lp-back" data-lp-back><i class="fas fa-arrow-left"></i></button><span>让他来决定</span></div>
                <div class="lp-form">
                    ${whoRow('让谁决定')}
                    <label>选项（一行一个）</label>
                    <textarea id="dc-list" placeholder="吃火锅\n吃面\n点外卖"></textarea>
                    <button class="modal-btn modal-btn-primary" id="dc-go" style="margin-top:12px;"><i class="fas fa-dice"></i> 交给 ${partner}</button>
                </div>`;
            const sel = document.getElementById('lp-to');
            if (sel) sel.onchange = () => { document.getElementById('dc-go').innerHTML = '<i class="fas fa-dice"></i> 交给 ' + whoPicked().name; };
            document.getElementById('dc-go').onclick = () => {
                const opts = (document.getElementById('dc-list').value || '').split('\n').map(s => s.trim()).filter(Boolean);
                if (opts.length < 2) { toast('至少写两个选项', 'warning'); return; }
                const pick = opts[Math.floor(Math.random() * opts.length)];
                this.pushCard('decide', pick, opts.join(' / '), null, whoPicked().name);
                closeModal('love-panel-modal');
            };
        },

        /* --- 分享 --- */
        async share() {
            const body = document.getElementById('lp-body');
            body.innerHTML = `
                <div class="lp-head"><button class="lp-back" data-lp-back><i class="fas fa-arrow-left"></i></button><span>分享</span></div>
                <div class="lp-form">
                    ${whoRow('分享给谁')}
                    <label>链接</label>
                    <input type="url" id="sh-url" placeholder="https://…">
                    <label>标题</label>
                    <input type="text" id="sh-title" placeholder="这个想给你看" maxlength="40">
                    <button class="modal-btn modal-btn-primary" id="sh-send" style="margin-top:12px;"><i class="fas fa-link"></i> 分享给他</button>
                </div>`;
            document.getElementById('sh-send').onclick = () => {
                const url = (document.getElementById('sh-url').value || '').trim();
                const title = (document.getElementById('sh-title').value || '').trim();
                if (!/^https?:\/\//i.test(url)) { toast('链接要以 http 开头', 'warning'); return; }
                let host = '链接';
                try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {}
                this.pushCard('share', title || '分享了一个链接', url, host, whoPicked().name);
                closeModal('love-panel-modal');
            };
        },

        /* --- 一起听 --- */
        async listen() {
            const body = document.getElementById('lp-body');
            const partner = (settings && settings.partnerName) || '梦角';
            body.innerHTML = `
                <div class="lp-head"><button class="lp-back" data-lp-back><i class="fas fa-arrow-left"></i></button><span>一起听</span></div>
                <div class="lp-form">
                    ${whoRow('和谁一起听')}
                    <label>歌曲链接（网易云 / QQ 音乐）</label>
                    <input type="url" id="ls-url" placeholder="https://music.163.com/song?id=…">
                    <label>歌名</label>
                    <input type="text" id="ls-name" placeholder="歌名" maxlength="40">
                    <button class="modal-btn modal-btn-primary" id="ls-send" style="margin-top:12px;"><i class="fas fa-headphones"></i> 邀请 ${partner} 一起听</button>
                </div>`;
            const sel = document.getElementById('lp-to');
            if (sel) sel.onchange = () => { document.getElementById('ls-send').innerHTML = '<i class="fas fa-headphones"></i> 邀请 ' + whoPicked().name + ' 一起听'; };
            document.getElementById('ls-send').onclick = () => {
                const url = (document.getElementById('ls-url').value || '').trim();
                const name = (document.getElementById('ls-name').value || '').trim() || '一首歌';
                if (!/^https?:\/\//i.test(url)) { toast('先贴一个歌曲链接', 'warning'); return; }
                this.pushCard('listen', name, url, null, whoPicked().name);
                closeModal('love-panel-modal');
            };
        },

        /* --- 往聊天里放一张卡片，并让 TA 3~7 秒后回应 --- */
        pushCard(kind, a, b, c, to) {
            const partner = to || (settings && settings.partnerName) || '梦角';
            const money = (n) => '¥' + Number(n).toFixed(2);
            let html = '', reply = '';
            if (kind === 'transfer') {
                html = `<div class="card-pill card-transfer"><div class="card-ic"><i class="fas fa-yen-sign"></i></div><div><div class="card-t">转账 ${money(a)}</div><div class="card-s">${b || '给你的'}</div></div></div>`;
                reply = Math.random() < 0.85 ? `收到了，${money(a)}。谢谢。` : '怎么突然转钱给我？';
            } else if (kind === 'redpacket') {
                html = `<div class="card-pill card-red"><div class="card-ic"><i class="fas fa-envelope-open-text"></i></div><div><div class="card-t">红包 ${money(a)}</div><div class="card-s">${b}</div></div></div>`;
                reply = '红包我收下了，谢谢。';
            } else if (kind === 'decide') {
                html = `<div class="card-pill card-decide"><div class="card-ic"><i class="fas fa-dice"></i></div><div><div class="card-t">那就「${a}」</div><div class="card-s">在 ${b} 里选的</div></div></div>`;
                reply = `那就${a}吧。`;
            } else if (kind === 'share') {
                html = `<div class="card-pill card-share"><div class="card-ic"><i class="fas fa-link"></i></div><div><div class="card-t">${a}</div><div class="card-s">${c}</div></div></div>`;
                reply = '我看完了，挺有意思的。';
            } else if (kind === 'listen') {
                html = `<div class="card-pill card-listen"><div class="card-ic"><i class="fas fa-headphones"></i></div><div><div class="card-t">一起听 · ${a}</div><div class="card-s">我戴上耳机了</div></div></div>`;
                reply = '好，一起听。';
            }
            if (typeof addMessage === 'function') {
                addMessage({
                    sender: 'me',
                    type: 'system',
                    text: html,
                    timestamp: new Date(),
                    id: 'lp-' + Date.now()
                });
                save();
            }
            // 3~7 秒后他来一句（群里就是选中的那位来接）
            if (reply) {
                const delay = 3000 + Math.random() * 4000;
                setTimeout(() => {
                    if (typeof addMessage !== 'function') return;
                    addMessage({ sender: partner, type: 'normal', text: reply, timestamp: new Date(), id: 'lpr-' + Date.now() });
                    save();
                }, delay);
            }
        }
    };

    /* ---------------- 新建群聊 ---------------- */
    const GroupNew = {
        picked: new Set(),
        async render() {
            const box = document.getElementById('new-group-member-list');
            if (!box) return;
            const list = (sessionList || []).filter(s => s.id !== sid() && s.type !== 'group');
            if (!list.length) {
                box.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);padding:8px 0;">还没有别的联系人，先去「联系人」里新建几位梦角。</div>';
                return;
            }
            box.innerHTML = list.map(s => {
                const av = (s.avatar || '').trim();
                const on = this.picked.has(s.id);
                return `<div class="gp-item ${on ? 'on' : ''}" data-gp="${s.id}">
                    <div class="gp-av">${av ? `<img src="${av}" alt="">` : (s.name || '梦').slice(0, 1)}</div>
                    <div class="gp-name">${s.name}</div>
                    <div class="gp-check"><i class="fas fa-check"></i></div>
                </div>`;
            }).join('');
            const counter = document.getElementById('new-group-picked');
            if (counter) counter.textContent = `已选 ${this.picked.size} 位`;
        },
        toggle(id) {
            if (this.picked.has(id)) this.picked.delete(id);
            else this.picked.add(id);
            this.render();
        },
        async create() {
            const nameEl = document.getElementById('new-group-name');
            const name = (nameEl && nameEl.value || '').trim();
            if (!name) { toast('先给群起个名字', 'warning'); return; }
            if (!this.picked.size) { toast('至少邀请一位梦角', 'warning'); return; }
            const members = Array.from(this.picked);
            // 邀请需要对方同意：这里模拟对方点头
            const agreed = members.filter(() => Math.random() < 0.85);
            if (!agreed.length) {
                toast('大家都还没同意，等一会儿再建', 'warning');
                return;
            }
            const newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
            const session = {
                id: newId,
                name,
                type: 'group',
                members: agreed,
                createdAt: Date.now()
            };
            if (!sessionList) sessionList = [];
            sessionList.push(session);
            await localforage.setItem(`${P()}sessionList`, sessionList);
            this.picked.clear();
            if (nameEl) nameEl.value = '';
            closeModal('group-chat-modal');
            const skipped = members.length - agreed.length;
            toast(`群「${name}」已建好${skipped ? `，有 ${skipped} 位还没同意` : ''}`);
            setTimeout(() => { location.hash = newId; location.reload(); }, 600);
        }
    };

    /* ---------------- 事件绑定 ---------------- */
    function bind() {
        // 头像库
        const ap = document.getElementById('alib-add-partner');
        const am = document.getElementById('alib-add-me');
        const fp = document.getElementById('alib-file-partner');
        const fm = document.getElementById('alib-file-me');
        if (ap && fp) { ap.onclick = () => fp.click(); fp.onchange = e => { ALib.add('partner', e.target.files); e.target.value = ''; }; }
        if (am && fm) { am.onclick = () => fm.click(); fm.onchange = e => { ALib.add('me', e.target.files); e.target.value = ''; }; }

        document.addEventListener('click', e => {
            const thumb = e.target.closest('.alib-thumb');
            const del = e.target.closest('.alib-del');
            if (del) {
                e.stopPropagation();
                ALib.remove(del.dataset.del, ALib.data[del.dataset.del][Number(del.dataset.idx)]);
                return;
            }
            if (thumb) {
                const role = thumb.dataset.role, idx = Number(thumb.dataset.idx);
                ALib.apply(role, ALib.data[role][idx]);
            }
            // 昵称库
            const chipDel = e.target.closest('.nlib-del');
            if (chipDel) {
                e.stopPropagation();
                NLib.remove(chipDel.dataset.role, decodeURIComponent(chipDel.dataset.name));
                return;
            }
            const chip = e.target.closest('.nlib-chip');
            if (chip) {
                NLib.apply(chip.dataset.role, decodeURIComponent(chip.dataset.name));
                return;
            }
            // 群成员勾选
            const gp = e.target.closest('[data-gp]');
            if (gp) { GroupNew.toggle(gp.dataset.gp); return; }
            // ❥ 面板
            const lpc = e.target.closest('[data-lp]');
            if (lpc) { LP.pick(lpc.dataset.lp); return; }
            if (e.target.closest('[data-lp-back]')) { LP.back(); return; }
        });

        // ❥ 面板开关
        const lb = document.getElementById('love-panel-btn');
        if (lb) lb.onclick = () => LP.open();
        const lc = document.getElementById('love-panel-close');
        if (lc) lc.onclick = () => closeModal('love-panel-modal');

        // 昵称库添加
        const np = document.getElementById('nlib-add-partner');
        const nm = document.getElementById('nlib-add-me');
        const askName = (title, cb) => {
            const m = document.getElementById('edit-modal');
            if (!m) { const v = prompt(title); if (v) cb(v); return; }
            const ti = m.querySelector('#edit-modal-title');
            const ni = m.querySelector('#name-input');
            const sb = m.querySelector('#save-name');
            if (ti) ti.textContent = title;
            if (ni) ni.value = '';
            if (sb) {
                sb.disabled = true;
                sb.onclick = () => {
                    const v = (ni.value || '').trim();
                    if (v) cb(v);
                    closeModal('edit-modal');
                };
            }
            if (ni) ni.oninput = () => { if (sb) sb.disabled = !ni.value.trim(); };
            openModal('edit-modal');
            if (ni) setTimeout(() => ni.focus(), 120);
        };
        if (np) np.onclick = () => askName('添加梦角的昵称', v => NLib.add('partner', v));
        if (nm) nm.onclick = () => askName('添加我的昵称', v => NLib.add('me', v));

        // 新建群聊
        const gc = document.getElementById('group-chat-btn');
        if (gc) gc.addEventListener('click', () => {
            GroupNew.picked.clear();
            GroupNew.render();
            // 原站有自己的打开逻辑，这里补一次渲染即可
            setTimeout(() => GroupNew.render(), 60);
        });
        const cg = document.getElementById('create-group-btn');
        if (cg) cg.onclick = () => GroupNew.create();
    }

    /* ---------------- 群会话模式同步 ---------------- */
    function syncGroupMode() {
        try {
            var cur = (typeof sessionList !== 'undefined' ? sessionList : []).filter(function (s) { return s.id === (typeof SESSION_ID !== 'undefined' ? SESSION_ID : null); })[0];
            if (!cur || cur.type !== 'group') return;
            if (typeof groupChatSettings === 'undefined') return;
            groupChatSettings.enabled = true;
            groupChatSettings.showName = true;
            groupChatSettings.members = (cur.members || []).map(function (id) {
                var c = sessionList.filter(function (x) { return x.id === id; })[0];
                return { id: id, name: c ? c.name : '成员', avatar: c ? (c.avatar || '') : '' };
            });
            if (typeof saveGroupChatSettings === 'function') saveGroupChatSettings();
            // 群会话顶部显示群名
            if (typeof settings !== 'undefined' && settings && settings.partnerName !== cur.name) {
                settings.partnerName = cur.name;
                if (typeof updateUI === 'function') updateUI();
                save();
            }
        } catch (e) { /* 静默 */ }
    }

    /* ---------------- 梦角主动：换头像 / 换昵称 ---------------- */
    function startSelfChangeWatcher() {
        var lastLen = -1;
        setInterval(function () {
            try {
                var len = (typeof messages !== 'undefined' && messages) ? messages.length : 0;
                if (lastLen === -1) { lastLen = len; return; }
                if (len <= lastLen) { lastLen = len; return; }
                lastLen = len;
                // 新消息来了，低概率他顺手换个头像或昵称
                if (Math.random() > 0.08) return;
                if (Math.random() < 0.5) {
                    if (ALib.data.partner.length > 1) ALib.heChanges('partner');
                    else if (ALib.data.me.length > 1 && Math.random() < 0.5) ALib.heChanges('me');
                } else if (NLib.data.partner.length > 1) {
                    var pool = NLib.data.partner;
                    var pick = pool[Math.floor(Math.random() * pool.length)];
                    NLib.apply('partner', pick);
                }
            } catch (e) { /* 静默 */ }
        }, 9000);
    }

    /* ---------------- 启动 ---------------- */
    async function boot() {
        bind();
        try { await ALib.load(); ALib.render(); } catch (e) { console.warn('头像库初始化失败', e); }
        try { await NLib.load(); NLib.render(); } catch (e) { console.warn('昵称库初始化失败', e); }
        try { syncGroupMode(); } catch (e) {}
        try { startSelfChangeWatcher(); } catch (e) {}
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 300));
    else setTimeout(boot, 300);

    // 暴露给设置面板打开时刷新
    window.LoveExt = { ALib, NLib, LP, GroupNew, refresh: async () => { await ALib.load(); ALib.render(); await NLib.load(); NLib.render(); } };
})();
