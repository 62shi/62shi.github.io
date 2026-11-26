/* ============================================================
   home-ext.js —— 主页桌面 / 组件 / 设置重组 / 单聊·群聊双模式 /
                  状态栏 / 距离 / 素材 / 情话 / 小游戏 / 字体 / 模式
   原则：
   1) 只在最外层新增「主页」入口，原聊天界面与原有功能一律不动；
   2) 所有新面板独立挂载，不改写原有弹层；
   3) 不生成任何「从未保存过」的内容——情话来自情话库，回复来自回复池。
   ============================================================ */
(function () {
    'use strict';

    const W = window;
    const $ = id => document.getElementById(id);
    const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, t) => { try { if (typeof showNotification === 'function') showNotification(m, t || 'success'); } catch (e) {} };
    const sid = () => { try { return SESSION_ID || '0'; } catch (e) { return '0'; } };
    const pref = () => { try { return APP_PREFIX || 'CHAT_APP_V3_'; } catch (e) { return 'CHAT_APP_V3_'; } };

    /* ============================================================
       v21-1：全站字体同步（换字体后主页1 / 主页2 也跟随）
       根因：原站默认 --font-family 是宋体，且 core.js applySettings 每次刷新
       都重写它；主页读的 --hx-home-font 只是内联样式，刷新即丢，而「跟随系统
       字体」「主题方案」等入口根本不写它。这里统一监听 --font-family 并同步，
       覆盖全部入口；未换字体（默认宋体）时主页保持原来的无衬线外观不变。
       ============================================================ */
    (function installFontSync() {
        const root = document.documentElement;
        const DEF = "'Noto Serif SC', serif";
        const norm = s => String(s || '').replace(/\s+/g, '').replace(/["']/g, '');
        const isDefault = ff => !ff || norm(ff) === norm(DEF);
        function readFont() {
            let ff = (root.style.getPropertyValue('--font-family') || '').trim();
            if (!ff) { try { ff = (W.getComputedStyle(root).getPropertyValue('--font-family') || '').trim(); } catch (e) {} }
            /* 兜底：某些入口（上传字体 / 跟随系统 / 主题方案）只改 settings，
               或加载时被 applySettings 用默认宋体重写；从持久化设置里把用户
               真正选过的字体捞回来，保证刷新后主页依旧跟随。 */
            if (isDefault(ff)) {
                const cand = [];
                try { if (typeof settings !== 'undefined' && settings && settings.messageFontFamily) cand.push(settings.messageFontFamily); } catch (e) {}
                try { const raw = localStorage.getItem('hx_font'); if (raw) { const h = JSON.parse(raw); if (h) cand.push(h); } } catch (e) {}
                for (let i = 0; i < cand.length; i++) {
                    if (!isDefault(cand[i])) { ff = String(cand[i]).trim(); break; }
                }
            }
            return ff;
        }
        function sync() {
            try {
                const ff = readFont();
                const want = isDefault(ff) ? '' : ff;
                const cur = (root.style.getPropertyValue('--hx-home-font') || '').trim();
                if (cur === want) return;                 /* 幂等：避免 observer 自触发循环 */
                if (want) root.style.setProperty('--hx-home-font', want);
                else root.style.removeProperty('--hx-home-font');
            } catch (e) {}
        }
        W.HXFontSync = sync;
        try {
            if (W.MutationObserver) {
                new W.MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['style'] });
            }
        } catch (e) {}
        sync();
        document.addEventListener('DOMContentLoaded', sync);
        W.addEventListener('load', sync);
        [0, 120, 500, 1500, 3500].forEach(t => setTimeout(sync, t));
        setInterval(sync, 2000);   /* 兜底：CSS 类切换等不改 style 的场景也能恢复 */
    })();

    /* ---------------- 存储 ---------------- */
    const HG = {
        get(k, d) {
            try { const v = localStorage.getItem('hx_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; }
        },
        set(k, v) {
            try { localStorage.setItem('hx_' + k, JSON.stringify(v)); } catch (e) {}
        }
    };
    const HS = {
        k(k) { return 'hx_' + sid() + '_' + k; },
        get(k, d) {
            try { const v = localStorage.getItem(this.k(k)); return v === null ? d : JSON.parse(v); } catch (e) { return d; }
        },
        set(k, v) {
            try { localStorage.setItem(this.k(k), JSON.stringify(v)); } catch (e) {}
        }
    };

    /* ---------------- 通用面板 ---------------- */
    let __hxOrder = 0;
    /* v20-8：统一的「← 返回上一层」——先关最上层面板，再关原站弹层，最后才回主页 */
    function hxBack() {
        try {
            const mods = $$('.hx-modal.on').sort((a, b) =>
                (Number(b.dataset.hxOrder) || 0) - (Number(a.dataset.hxOrder) || 0));
            if (mods.length) {
                const top = mods[0];
                const cameFromUs = W.__hxBackToUs;
                closePanel(top.id);
                W.__hxBackToUs = false;
                if ($$('.hx-modal.on').length) return;          // 还有上一层面板，就停在那
                if (cameFromUs && top.id !== 'hx-us-panel') { Us.open(); return; }
                if (Home && typeof Home.shown === 'boolean' && !Home.shown) Home.show();
                return;
            }
            const om = document.querySelector('.modal.active');
            if (om) {
                try { if (typeof hideModal === 'function') hideModal(om); else om.classList.remove('active'); }
                catch (e) { om.classList.remove('active'); om.style.display = 'none'; }
                return;
            }
            if (Home && typeof Home.shown === 'boolean' && !Home.shown) Home.show();
        } catch (e) {}
    }
    function openPanel(id) {
        const m = $(id);
        if (!m) return;
        m.dataset.hxOrder = String(++__hxOrder);
        m.classList.add('on');
        m.style.display = 'flex';
    }
    function closePanel(id) {
        const m = $(id);
        if (!m) return;
        m.classList.remove('on');
        m.style.display = 'none';
    }
    function makePanel(id, title, bodyHTML) {
        let m = $(id);
        if (!m) {
            m = document.createElement('div');
            m.id = id;
            m.className = 'hx-modal';
            m.innerHTML = '<div class="hx-panel"><div class="hx-head">'
                + '<span class="hx-title"></span>'
                + '<button class="hx-close" data-hx-close><i class="fas fa-times"></i></button>'
                + '</div><div class="hx-body"></div></div>';
            document.body.appendChild(m);
            m.addEventListener('click', e => {
                if (e.target === m || e.target.closest('[data-hx-close]')) {
                    const backToUs = W.__hxBackToUs && id !== 'hx-us-panel';
                    closePanel(id);
                    if (backToUs) { W.__hxBackToUs = false; Us.open(); }
                }
            });
        }
        m.querySelector('.hx-title').textContent = title;
        if (bodyHTML != null) m.querySelector('.hx-body').innerHTML = bodyHTML;
        const head = m.querySelector('.hx-head');
        let back = head.querySelector('[data-hx-backus]');
        if (!back) {
            back = document.createElement('button');
            back.className = 'hx-backus';
            back.setAttribute('data-hx-backus', '1');
            back.title = '返回上一层';
            back.innerHTML = '<i class="fas fa-arrow-left"></i>';
            head.insertBefore(back, head.firstChild);
            back.onclick = (e) => { e.stopPropagation(); hxBack(); };
        }
        /* v20-8：所有面板头部都常驻「←」，点它回到上一层 */
        back.style.display = '';
        return m;
    }
    function panelBody(id) { const m = $(id); return m ? m.querySelector('.hx-body') : null; }

    /* ---------------- 图片压缩 ---------------- */
    function shrink(file, max) {
        max = max || 900;
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
                    try { resolve(c.toDataURL('image/jpeg', 0.82)); } catch (e) { reject(e); }
                };
                img.src = fr.result;
            };
            fr.readAsDataURL(file);
        });
    }

    /* ---------------- 名字 ---------------- */
    function myName() { try { return (settings && settings.myName) || '我'; } catch (e) { return '我'; } }
    function partnerName() {
        try {
            const s = (sessionList || []).filter(x => x.id === sid())[0];
            if (s && s.name && s.type !== 'group') return s.name;
            return (settings && settings.partnerName) || '梦角';
        } catch (e) { return '梦角'; }
    }
    function curSession() {
        try { return (sessionList || []).filter(x => x.id === sid())[0] || null; } catch (e) { return null; }
    }
    function curAvatar(which) {
        const el = document.querySelector(which === 'me' ? '#my-avatar img' : '#partner-avatar img');
        return el ? el.src : '';
    }

    /* ============================================================
       1. 外观模式（日间 / 夜间 / 傍晚 / 黄昏 / 雨天）
       ============================================================ */
    const MODES = [
        { k: 'day', name: '日间', dot: 'linear-gradient(135deg,#fffdf8,#e8f1fb)' },
        { k: 'night', name: '夜间', dot: 'linear-gradient(135deg,#2b3448,#161d2b)' },
        { k: 'dusk', name: '傍晚', dot: 'linear-gradient(135deg,#ffe0c9,#ffb98f)' },
        { k: 'twilight', name: '黄昏', dot: 'linear-gradient(135deg,#e6d8ff,#bda6ef)' },
        { k: 'rain', name: '雨天', dot: 'linear-gradient(135deg,#dbe8f4,#a9c1d6)' }
    ];
    const Modes = {
        get() { return HG.get('mode', 'day'); },
        apply(mode) {
            const m = mode || this.get();
            HG.set('mode', m);
            document.documentElement.setAttribute('data-hx-mode', m);
            document.body.setAttribute('data-hx-mode', m);
            try { document.body.style.setProperty('--hx-mode', m); } catch (e) {}
            try {
                settings.isDarkMode = (m === 'night');
                if (typeof DOMElements !== 'undefined' && DOMElements.html) {
                    DOMElements.html.setAttribute('data-theme', settings.isDarkMode ? 'dark' : 'light');
                } else {
                    document.documentElement.setAttribute('data-theme', settings.isDarkMode ? 'dark' : 'light');
                }
                if (typeof throttledSaveData === 'function') throttledSaveData();
            } catch (e) {}
        },
        open() {
            makePanel('hx-mode-panel', '外观模式',
                '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-circle-half-stroke"></i>选择模式</div>'
                + '<div class="hx-mode-grid">' + MODES.map(m =>
                    '<div class="hx-mode-card ' + (this.get() === m.k ? 'on' : '') + '" data-hx-mode="' + m.k + '">'
                    + '<div class="hx-mode-dot" style="background:' + m.dot + '"></div>' + m.name + '</div>').join('')
                + '</div></div>');
            const body = panelBody('hx-mode-panel');
            body.querySelectorAll('[data-hx-mode]').forEach(el => {
                el.onclick = () => {
                    this.apply(el.dataset.hxMode);
                    body.querySelectorAll('.hx-mode-card').forEach(x => x.classList.toggle('on', x === el));
                    toast('已切换到「' + MODES.filter(m => m.k === el.dataset.hxMode)[0].name + '」');
                };
            });
            openPanel('hx-mode-panel');
        }
    };

    /* ============================================================
       2. 字体选择
       ============================================================ */
    const FONT_PRESETS = [
        { name: '系统默认', stack: '-apple-system, BlinkMacSystemFont, "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", sans-serif' },
        { name: '思源宋体', stack: '"Noto Serif SC", "Songti SC", SimSun, serif' },
        { name: '圆体', stack: '"Yuanti SC", "PingFang SC", "Hiragino Sans GB", sans-serif' },
        { name: '楷体', stack: '"Kaiti SC", KaiTi, STKaiti, serif' },
        { name: '黑体', stack: '"Heiti SC", SimHei, "Microsoft YaHei", sans-serif' },
        { name: '仿宋', stack: 'FangSong, STFangsong, serif' },
        { name: '英文衬线', stack: 'Georgia, "Times New Roman", serif' },
        { name: '等宽', stack: '"SF Mono", Consolas, Menlo, monospace' },
        { name: '奶油体', stack: '"Yuanti SC", "PingFang SC", "Microsoft YaHei", sans-serif', css: 'font-weight:600;letter-spacing:1.5px;' },
        { name: '手写体', stack: '"Kaiti SC", "Xingkai SC", KaiTi, STKaiti, cursive', css: 'font-style:italic;letter-spacing:1px;' },
        { name: '盐系细体', stack: '"PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", sans-serif', css: 'font-weight:300;letter-spacing:2px;' },
        { name: '复古打字机', stack: 'Courier New, "SF Mono", Consolas, monospace', css: 'letter-spacing:1px;' },
        { name: '少女圆圆', stack: '"Yuanti SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif', css: 'font-weight:700;letter-spacing:1px;' },
        { name: '杂志衬线', stack: 'Georgia, "Songti SC", "Noto Serif SC", serif', css: 'letter-spacing:.5px;' },
        { name: '软萌加粗', stack: '"PingFang SC", "Microsoft YaHei", sans-serif', css: 'font-weight:800;letter-spacing:.5px;' }
    ];
    const Fonts = {
        get() { return HG.get('font', ''); },
        apply(stack, label) {
            HG.set('font', stack || '');
            HG.set('fontName', label || '');
            const fp = FONT_PRESETS.filter(f => f.name === label)[0];
            HG.set('fontCss', fp ? (fp.css || '') : '');
            try {
                if (stack) {
                    document.documentElement.style.setProperty('--message-font-family', stack);
                    document.documentElement.style.setProperty('--font-family', stack);
                    /* v20-1：主页1 / 主页2 也跟着全站字体一起变 */
                    document.documentElement.style.setProperty('--hx-home-font', stack);
                    settings.messageFontFamily = stack;
                } else {
                    /* v20-1：清除字体时也要把全站（含主页1/主页2）一起还原 */
                    document.documentElement.style.removeProperty('--message-font-family');
                    document.documentElement.style.removeProperty('--font-family');
                    document.documentElement.style.removeProperty('--hx-home-font');
                    settings.messageFontFamily = '';
                }
                if (typeof throttledSaveData === 'function') throttledSaveData();
            } catch (e) {}
        },
        // 上传照片 → 提取氛围 → 匹配最接近的字体
        async fromPhoto(file) {
            const data = await shrink(file, 520);
            const img = await new Promise((res, rej) => {
                const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = data;
            });
            const c = document.createElement('canvas');
            const n = 40;
            c.width = n; c.height = n;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, n, n);
            const px = ctx.getImageData(0, 0, n, n).data;
            let r = 0, g = 0, b = 0, lum = 0, cnt = 0;
            for (let i = 0; i < px.length; i += 4) {
                r += px[i]; g += px[i + 1]; b += px[i + 2];
                lum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
                cnt++;
            }
            r /= cnt; g /= cnt; b /= cnt; lum /= cnt;
            const warm = r - b;
            const isLight = lum > 150;
            let pick;
            if (warm > 22) pick = isLight ? FONT_PRESETS[1] : FONT_PRESETS[4];      // 暖调 → 宋体 / 黑体
            else if (warm < -14) pick = isLight ? FONT_PRESETS[6] : FONT_PRESETS[7]; // 冷调 → 英文衬线 / 等宽
            else pick = isLight ? FONT_PRESETS[2] : FONT_PRESETS[3];               // 中性 → 圆体 / 楷体
            const label = (file.name || '照片').replace(/\.[^.]+$/, '') + ' · 风格';
            const made = HG.get('fontsMade', []);
            made.unshift({ label: label, stack: pick.stack, base: pick.name, ts: Date.now() });
            HG.set('fontsMade', made.slice(0, 12));
            return { label: label, stack: pick.stack, base: pick.name };
        },
        open() {
            const made = HG.get('fontsMade', []);
            const cur = HG.get('font', '');
            makePanel('hx-font-panel', '字体选择',
                '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-font"></i>可选字体</div>'
                + '<div class="hx-font-list" id="hx-font-list">'
                + FONT_PRESETS.map((f, i) =>
                    '<div class="hx-font-item ' + (cur === f.stack ? 'on' : '') + '" data-hx-font="' + i + '">'
                    + '<div class="hx-font-preview" style="font-family:' + f.stack.replace(/"/g, '&quot;') + ';' + (f.css || '') + '">此刻想对你说的话</div>'
                    + '<div class="hx-font-name">' + f.name + '</div></div>').join('')
                + '</div></div>'
                + '<div class="hx-sec"><button class="hx-btn block" id="hx-font-them"><i class="fas fa-heart"></i> 让 TA 挑一个字体</button>'
                + '<div id="hx-font-req"></div></div>'
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-camera"></i>用照片生成字体风格</div>'
                + '<div class="hx-row"><div class="hx-row-label">上传照片</div></div>'
                + '<button class="hx-btn block" id="hx-font-photo"><i class="fas fa-upload"></i> 上传照片生成</button>'
                + '<input type="file" id="hx-font-file" accept="image/*" style="display:none;">'
                + '<div id="hx-font-made" style="margin-top:10px;">'
                + (made.length ? made.map((m, i) =>
                    '<div class="hx-font-item" data-hx-made="' + i + '"><div class="hx-font-preview" style="font-family:' + m.stack.replace(/"/g, '&quot;') + '">此刻想对你说的话</div>'
                    + '<div class="hx-font-name">' + esc(m.label) + '<br>≈ ' + esc(m.base) + '</div></div>').join('')
                    : '<div class="hx-empty">还没有生成过字体风格</div>')
                + '</div></div>');
            const body = panelBody('hx-font-panel');
            body.querySelectorAll('[data-hx-font]').forEach(el => {
                el.onclick = () => {
                    const f = FONT_PRESETS[Number(el.dataset.hxFont)];
                    this.apply(f.stack, f.name);
                    body.querySelectorAll('.hx-font-item').forEach(x => x.classList.remove('on'));
                    el.classList.add('on');
                    toast('已应用「' + f.name + '」');
                };
            });
            const themBtn = body.querySelector('#hx-font-them');
            if (themBtn) themBtn.onclick = () => {
                const f = FONT_PRESETS[Math.floor(Math.random() * FONT_PRESETS.length)];
                if (W.V8 && W.V8.Consent) {
                    W.V8.Consent.ask({
                        kind: 'font', title: '我让 TA 挑字体「' + f.name + '」',
                        detail: '来自字体选择', by: myName(), from: 'me',
                        apply: () => { this.apply(f.stack, f.name); Home.render(); }
                    });
                } else { this.apply(f.stack, f.name); }
                this.open();
            };
            const photoBtn = body.querySelector('#hx-font-photo');
            const fileInput = body.querySelector('#hx-font-file');
            if (photoBtn && fileInput) {
                photoBtn.onclick = () => fileInput.click();
                fileInput.onchange = async e => {
                    const f = e.target.files && e.target.files[0];
                    if (!f) return;
                    try {
                        const r = await this.fromPhoto(f);
                        this.apply(r.stack, r.label);
                        toast('已生成「' + r.label + '」并应用');
                        this.open();
                    } catch (err) { toast('这张照片读不了', 'warning'); }
                    e.target.value = '';
                };
            }
            body.querySelectorAll('[data-hx-made]').forEach(el => {
                el.onclick = () => {
                    const m = HG.get('fontsMade', [])[Number(el.dataset.hxMade)];
                    if (!m) return;
                    this.apply(m.stack, m.label);
                    toast('已应用「' + m.label + '」');
                };
            });
            openPanel('hx-font-panel');
        }
    };

    /* ============================================================
       3. 组件背景（主页组件 / 入口图标）
       ============================================================ */
    /* v22 按用户点名调整：
       - 需求4：音乐 ↔ 选择 互换位置
       - 需求12：设置排到禁言前面
       - 需求14：钱包排在重要日后面 */
    /* v23-16：主页1 / 主页2 组件顺序按需求重排（「🌧️」由 widgetList 固定排首位） */
    const WIDGETS = [
        /* 主页1：🌧️ → 聊天 → 群聊 → 钱包 → 朋友圈 → 游戏 → 重要日 → 音乐 */
        { k: 'chat', name: '聊天', page: 1 },
        { k: 'group', name: '群聊', page: 1 },
        { k: 'wallet', name: '钱包', page: 1 },
        { k: 'moments', name: '朋友圈', page: 1 },
        { k: 'game', name: '游戏', page: 1 },
        { k: 'anniv', name: '重要日', page: 1 },
        { k: 'music', name: '音乐', page: 1 },
        /* 主页2：🌧️ → 信箱 → 🤍 → 日夜 → 选择 → 设置 → 禁言 */
        { k: 'letter', name: '信箱', page: 2 },
        { k: 'mood', name: '🤍', page: 2 },
        { k: 'mode', name: '日夜', page: 2 },
        { k: 'us', name: '选择', page: 2 },
        { k: 'settings', name: '设置', page: 2 },
        { k: 'mute', name: '禁言', page: 2 }
    ];
    const CARDS = [
        { k: 'together', name: '主页1 · 在一起的时间' }, { k: 'quote', name: '主页1 · 今日情话' },
        { k: 'together2', name: '主页2 · 在一起的时间' }, { k: 'quote2', name: '主页2 · 今日情话' },
        { k: 'period', name: '主页1 · 距离经期' },
        { k: 'period2', name: '主页2 · 距离经期' }
    ];
    function contacts() {
        try { return (sessionList || []).filter(s => s.type !== 'group' && s.type !== 'person'); } catch (e) { return []; }
    }
    function widgetList(page) {
        const cs = contacts();
        const c1 = cs[0] || { id: sid(), name: partnerName() };
        const c2 = cs[1];
        const m1 = { k: 'mood1', name: '心情', cid: c1.id, page: 1 };
        const m2 = { k: 'mood2', name: '心情', cid: (c2 && c2.id) || '', page: 2 };
        if (page === 1) return [m1].concat(WIDGETS.filter(w => w.page === 1));
        if (page === 2) return [m2].concat(WIDGETS.filter(w => w.page === 2));
        return [m1].concat(WIDGETS.filter(w => w.page === 1), [m2], WIDGETS.filter(w => w.page === 2));
    }
    const WidgetBg = {
        bg(k) { return HG.get('wbg', {})[k] || ''; },
        op(k) { const o = HG.get('wbgop', {})[k]; return o === undefined ? 100 : o; },
        setBg(k, url) { const m = HG.get('wbg', {}); m[k] = url || ''; HG.set('wbg', m); },
        setOp(k, v) { const m = HG.get('wbgop', {}); m[k] = Number(v); HG.set('wbgop', m); },
        open(which) {
            const all = CARDS.concat(WIDGETS, [{ k: 'mood1', name: '心情 · 第一位' }, { k: 'mood2', name: '心情 · 第二位' }]);
            const cards = all.filter(w => /^(together|quote|period)/.test(w.k));
            const icons = all.filter(w => !/^(together|quote|period)/.test(w.k));
            const item = w =>
                '<div style="border:1px solid var(--hg-line);border-radius:14px;padding:8px;">'
                + '<div class="hx-thumb" data-wbg-pick="' + w.k + '" style="' + (this.bg(w.k) ? "background-image:url('" + this.bg(w.k) + "');background-size:cover;background-position:center;" : '') + '">'
                + (this.bg(w.k) ? '' : '<i class="fas fa-plus"></i>')
                + '</div>'
                + '<div style="font-size:11.5px;font-weight:600;color:#5b6b81;text-align:center;margin:6px 0 4px;">' + w.name + '</div>'
                + '<div class="hx-slider-row"><input type="range" min="0" max="100" value="' + this.op(w.k) + '" data-wbg-op="' + w.k + '"><span class="hx-slider-val" data-wbg-opv="' + w.k + '">' + this.op(w.k) + '%</span></div>'
                + '<div style="display:flex;gap:6px;margin-top:6px;">'
                + '<button class="hx-btn" style="flex:1;padding:5px;font-size:11px;" data-wbg-up="' + w.k + '">上传</button>'
                + '<button class="hx-btn" style="padding:5px 9px;font-size:11px;" data-wbg-clr="' + w.k + '">清空</button>'
                + '</div></div>';
            makePanel('hx-wbg-panel', '组件背景',
                '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-image"></i>主页组件</div>'
                + '<div class="hx-grid2" id="hx-wbg-grid">' + cards.map(item).join('') + '</div></div>'
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-shapes"></i>入口图标</div>'
                + '<div class="hx-grid2">' + icons.map(item).join('') + '</div></div>'
                + '<input type="file" id="hx-wbg-file" accept="image/*" style="display:none;">');
            const body = panelBody('hx-wbg-panel');
            const file = body.querySelector('#hx-wbg-file');
            let target = null;
            body.querySelectorAll('[data-wbg-up]').forEach(b => b.onclick = () => { target = b.dataset.wbgUp; file.click(); });
            file.onchange = async e => {
                const f = e.target.files && e.target.files[0];
                if (!f || !target) return;
                try {
                    const url = await shrink(f, 1000);
                    this.setBg(target, url);
                    /* v20-15：换完立刻刷新主页，两个「在一起的时间」背景也能马上看到 */
                    try { Home.render(); } catch (e) {}
                    toast('背景已更换');
                    this.open(which);
                } catch (err) { toast('这张图片读不了', 'warning'); }
                e.target.value = '';
            };
            body.querySelectorAll('[data-wbg-clr]').forEach(b => b.onclick = () => {
                this.setBg(b.dataset.wbgClr, '');
                try { Home.render(); } catch (e) {}
                toast('已清空');
                this.open(which);
            });
            body.querySelectorAll('[data-wbg-op]').forEach(sl => {
                sl.oninput = () => {
                    this.setOp(sl.dataset.wbgOp, sl.value);
                    const v = body.querySelector('[data-wbg-opv="' + sl.dataset.wbgOp + '"]');
                    if (v) v.textContent = sl.value + '%';
                };
                sl.onchange = () => { Home.render(); };
            });
            openPanel('hx-wbg-panel');
        }
    };

    /* ============================================================
       4. 状态（头像下方的文字）
       ============================================================ */
    const STATUS_DEFAULT = ['在线', '想你', '发呆', '在忙', '睡前', '听歌', '刚醒', '心情很好'];
    const Status = {
        lib() { return HG.get('statusLib', STATUS_DEFAULT.slice()); },
        map() { return HS.get('statusMap', {}); },
        current(who, cid) {
            const map = this.map();
            let v = '';
            if (who === 'me') v = map.__me__;
            else v = map[cid || sid()];
            if (!v) {
                try {
                    const isCur = !cid || cid === sid();
                    v = who === 'me' ? (settings.myStatus || '在线') : ((isCur ? settings.partnerStatus : '') || '');
                } catch (e) {}
            }
            return v || '';
        },
        set(who, text, cid) {
            const map = this.map();
            map[who === 'me' ? '__me__' : (cid || sid())] = text;
            HS.set('statusMap', map);
            try {
                if (who === 'me') settings.myStatus = text;
                else if ((cid || sid()) === sid()) settings.partnerStatus = text;
                if (typeof throttledSaveData === 'function') throttledSaveData();
            } catch (e) {}
            this.paint();
        },
        paint() {
            try {
                const p = $('partner-status');
                if (p) { const sp = p.querySelector('span'); if (sp) sp.textContent = this.current('partner') || '在线'; }
                const m = $('my-status-text');
                if (m) m.textContent = this.current('me');
            } catch (e) {}
        },
        open(cid) {
            const all = contacts();
            const c1 = all[0] || { id: sid(), name: partnerName() };
            const c2 = all[1] || { id: '', name: '第二位' };
            const cid2 = cid || c1.id || sid();
            const cs = (sessionList || []).filter(s => s.id === cid2)[0];
            const taName = (cs && cs.name) || (cid2 === sid() ? partnerName() : '梦角');
            const lib = this.lib();
            const pending = HS.get('statusPending', []);
            const taNow = this.current('partner', cid2) || '在线';
            const whoTabs = '<div class="hx-whotabs">'
                + '<button class="hx-whotab ' + (cid2 === c1.id ? 'on' : '') + '" data-hx-stwho="' + esc(c1.id) + '">' + esc(c1.name || '第一位') + '</button>'
                + '<button class="hx-whotab ' + (cid2 === c2.id ? 'on' : '') + '" data-hx-stwho="' + esc(c2.id) + '">' + esc(c2.name || '第二位') + '</button></div>';
            /* v22-2：状态（原「心情」），操作方式与昵称一致：让 TA 自己选 / 我帮 TA 选 / 让 TA 帮我选 */
            makePanel('hx-status-panel', '状态',
                whoTabs
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-user"></i>我的状态</div>'
                + '<div class="hx-chipline">' + lib.map((s, i) =>
                    '<button class="hx-chip ' + (this.current('me') === s ? 'on' : '') + '" data-hx-mystatus="' + i + '">' + esc(s) + '</button>').join('')
                + '</div>'
                + '<div style="display:flex;gap:8px;margin-top:10px;"><input class="hx-input" id="hx-status-new" placeholder="再添加一个状态" maxlength="10"><button class="hx-btn primary" id="hx-status-add">添加</button></div>'
                + '</div>'
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-heart"></i>' + esc(taName) + ' 的状态</div>'
                + '<div class="hx-row"><div class="hx-row-label" style="font-size:15px;font-weight:600;">' + esc(taNow) + '</div></div>'
                + '<div class="v8-nick-acts" style="margin-top:8px;">'
                + '<button class="hx-btn" id="hx-status-ask"><i class="fas fa-wand-magic-sparkles"></i> 让 TA 自己选</button>'
                + '<button class="hx-btn" id="hx-status-help"><i class="fas fa-hand-pointer"></i> 我帮 TA 选</button>'
                + '<button class="hx-btn" id="hx-status-thempick"><i class="fas fa-heart"></i> 让 TA 帮我选</button>'
                + '</div>'
                + '<div id="hx-status-pending">' + (pending.length
                    ? pending.map((p, i) => '<div class="hx-item"><div class="hx-item-main"><div class="hx-item-name">' + esc(p.text) + '</div><div class="hx-item-sub">TA 想把你状态改成这个</div></div>'
                        + '<div class="hx-item-act"><button class="hx-btn primary" style="padding:5px 10px;font-size:11px;" data-hx-stagree="' + i + '">同意</button>'
                        + '<button class="hx-btn" style="padding:5px 9px;font-size:11px;" data-hx-stdeny="' + i + '">不用</button></div></div>').join('')
                    : '<div class="hx-empty">暂时没有待处理</div>')
                + '</div></div>');
            const body = panelBody('hx-status-panel');
            body.querySelectorAll('[data-hx-stwho]').forEach(b => b.onclick = () => {
                if (b.dataset.hxStwho) this.open(b.dataset.hxStwho);
            });
            body.querySelectorAll('[data-hx-mystatus]').forEach(b => b.onclick = () => {
                this.set('me', lib[Number(b.dataset.hxMystatus)]);
                body.querySelectorAll('[data-hx-mystatus]').forEach(x => x.classList.toggle('on', x === b));
                toast('状态已更新');
            });
            const add = body.querySelector('#hx-status-add');
            if (add) add.onclick = () => {
                const inp = body.querySelector('#hx-status-new');
                const v = (inp.value || '').trim();
                if (!v) return;
                const l = this.lib(); l.push(v); HG.set('statusLib', l);
                this.open(cid2);
            };
            const themPick = body.querySelector('#hx-status-thempick');
            if (themPick) themPick.onclick = () => {
                const l = this.lib();
                if (!l.length) return;
                const p0 = HS.get('statusPending', []);
                p0.push({ text: l[Math.floor(Math.random() * l.length)], ts: Date.now() });
                HS.set('statusPending', p0);
                toast(taName + ' 帮你挑了一个，等你同意');
                this.open(cid2);
            };
            const ask = body.querySelector('#hx-status-ask');
            if (ask) ask.onclick = () => {
                const l = this.lib();
                const t = l[Math.floor(Math.random() * l.length)];
                if (W.V8 && W.V8.Consent) {
                    W.V8.Consent.ask({
                        kind: 'status', title: '我让 ' + taName + ' 换状态「' + t + '」',
                        detail: '来自心情', by: myName(), from: 'me', cid: cid2,
                        apply: () => { this.set('partner', t, cid2); Home.render(); }
                    });
                } else { this.set('partner', t, cid2); }
                this.open(cid2);
            };
            /* v22-2：我帮 TA 选（从状态库里指定一个，需要 TA 同意） */
            const helpSel = body.querySelector('#hx-status-help');
            if (helpSel) helpSel.onclick = () => {
                const l2 = this.lib();
                makePanel('hx-status-help-panel', '我帮 ' + taName + ' 选状态',
                    '<div class="hx-sec"><div class="hx-chipline">' + l2.map((s, i) =>
                        '<button class="hx-chip" data-hx-sthelp="' + i + '">' + esc(s) + '</button>').join('') + '</div></div>');
                const bd2 = panelBody('hx-status-help-panel');
                bd2.querySelectorAll('[data-hx-sthelp]').forEach(x => x.onclick = () => {
                    const v = l2[Number(x.dataset.hxSthelp)];
                    closePanel('hx-status-help-panel');
                    if (W.V8 && W.V8.Consent) {
                        W.V8.Consent.ask({
                            kind: 'status', title: '我帮 ' + taName + ' 把状态改成「' + v + '」',
                            detail: '需要 TA 同意', by: myName(), from: 'me', cid: cid2,
                            apply: () => { this.set('partner', v, cid2); Home.render(); }
                        });
                    } else { this.set('partner', v, cid2); }
                });
                openPanel('hx-status-help-panel');
            };
            body.querySelectorAll('[data-hx-stagree]').forEach(b => b.onclick = () => {
                const p = HS.get('statusPending', []);
                const i = Number(b.dataset.hxStagree);
                if (!p[i]) return;
                this.set('me', p[i].text);
                p.splice(i, 1);
                HS.set('statusPending', p);
                toast('已同意，状态已更新');
                this.open(cid2);
            });
            body.querySelectorAll('[data-hx-stdeny]').forEach(b => b.onclick = () => {
                const p = HS.get('statusPending', []);
                const i = Number(b.dataset.hxStdeny);
                if (!p[i]) return;
                p.splice(i, 1);
                HS.set('statusPending', p);
                toast('已拒绝');
                this.open(cid2);
            });
            openPanel('hx-status-panel');
        }
    };

    /* ============================================================
       5. 距离（两个头像中间 / 只能梦角选或补充）
       ============================================================ */
    const DIST_DEFAULT = ['0.5 km', '1.2 km', '3 公里', '隔着一座城', '同城', '异地 1200 公里', '一步之遥'];
    const Distance = {
        lib() { return HS.get('distLib', DIST_DEFAULT.slice()); },
        map() { return HS.get('distMap', {}); },
        current(cid) {
            const m = this.map();
            const k = cid || sid();
            if (m[k]) return m[k];
            // 兼容旧版单值
            const old = HS.get('distCurrent', '');
            return (!cid || cid === sid()) ? old : '';
        },
        setFor(cid, v) {
            const m = this.map();
            m[cid || sid()] = v;
            HS.set('distMap', m);
            HS.set('distCurrent', v);
            this.apply();
        },
        apply() {
            const bar = $('distance-bar');
            if (!bar) return;
            const v = this.current();
            const txt = $('distance-text');
            const ico = bar.querySelector('i');
            /* v25-2：昵称固定在距离左右两边，距离栏需常显；没设置距离时只隐藏图标和文字 */
            if (txt) txt.textContent = v || '';
            if (ico) ico.style.display = v ? '' : 'none';
            bar.classList.add('show');
        },
        // 梦角自己换
        themPick(cid) {
            const lib = this.lib();
            const v = lib[Math.floor(Math.random() * lib.length)];
            this.setFor(cid || sid(), v);
        },
        open(cid) {
            const all = contacts();
            const c1 = all[0] || { id: sid(), name: partnerName() };
            const c2 = all[1] || { id: '', name: '第二位' };
            const cid2 = cid || c1.id || sid();
            const lib = this.lib();
            const cur = this.current(cid2);
            const taName = ((sessionList || []).filter(x => x.id === cid2)[0] || {}).name || c1.name || partnerName();
            const whoTabs = '<div class="hx-whotabs">'
                + '<button class="hx-whotab ' + (cid2 === c1.id ? 'on' : '') + '" data-hx-distwho="' + esc(c1.id) + '">' + esc(c1.name || '第一位') + '</button>'
                + '<button class="hx-whotab ' + (cid2 === c2.id ? 'on' : '') + '" data-hx-distwho="' + esc(c2.id) + '">' + esc(c2.name || '第二位') + '</button></div>';
            makePanel('hx-dist-panel', '距离',
                whoTabs
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-location-dot"></i>' + esc(taName) + ' 当前显示</div>'
                + '<div class="hx-row"><div class="hx-row-label" style="font-size:16px;font-weight:600;">' + (cur ? esc(cur) : '还没设置') + '</div>'
                + '<button class="hx-btn" id="hx-dist-reroll">让 ' + esc(taName) + ' 换一个</button></div>'
                + '</div>'
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-list"></i>距离库</div>'
                + '<div class="hx-chipline">' + lib.map((d, i) => '<span class="hx-chip">' + esc(d) + '</span>').join('') + '</div>'
                + '<div style="display:flex;gap:8px;margin-top:10px;"><input class="hx-input" id="hx-dist-new" placeholder="补充一个距离，例如 800 km" maxlength="16"><button class="hx-btn primary" id="hx-dist-add">补充</button></div>'
                + '</div>');
            const body = panelBody('hx-dist-panel');
            body.querySelectorAll('[data-hx-distwho]').forEach(b => b.onclick = () => {
                if (b.dataset.hxDistwho) this.open(b.dataset.hxDistwho);
            });
            body.querySelector('#hx-dist-reroll').onclick = () => {
                const l = this.lib();
                const t = l[Math.floor(Math.random() * l.length)];
                if (W.V8 && W.V8.Consent) {
                    W.V8.Consent.ask({
                        kind: 'distance', title: '我让 ' + taName + ' 换距离「' + t + '」',
                        detail: '来自距离', by: myName(), from: 'me', cid: cid2,
                        apply: () => { this.setFor(cid2, t); Home.render(); }
                    });
                } else { this.themPick(cid2); }
                this.open(cid2);
            };
            body.querySelector('#hx-dist-add').onclick = () => {
                const inp = body.querySelector('#hx-dist-new');
                const v = (inp.value || '').trim();
                if (!v) return;
                const l = this.lib(); l.push(v); HS.set('distLib', l);
                toast('已补充，TA 会从里面挑');
                this.open(cid2);
            };
            openPanel('hx-dist-panel');
        }
    };

    /* ============================================================
       6. 情话（组件 2 / 4）
       ============================================================ */
    /* ============================================================
       6. 经期（组件5 与距离一起显示）
       ============================================================ */
    const Period = {
        data() { return HS.get('period', { start: '', cycle: 28 }); },
        set(d) { HS.set('period', d); },
        info() {
            const d = this.data();
            if (!d.start) return { label: '经期', text: '未设置', on: false };
            const st = new Date(d.start + 'T00:00:00');
            if (isNaN(st.getTime())) return { label: '经期', text: '未设置', on: false };
            const cycle = Math.max(20, Math.min(45, Number(d.cycle) || 28));
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const diff = Math.floor((today - st) / 86400000);
            if (diff < 0) return { label: '经期', text: Math.abs(diff) + ' 天后开始', on: true };
            const dayIn = (diff % cycle) + 1;
            if (dayIn <= 5) return { label: '经期', text: '第 ' + dayIn + ' 天', on: true };
            return { label: '距经期', text: '还有 ' + (cycle - dayIn + 1) + ' 天', on: false };
        },
        open() {
            const d = this.data();
            makePanel('hx-period-panel', '经期',
                '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-droplet"></i>上次开始</div>'
                + '<input class="hx-input" type="date" id="hx-period-start" value="' + esc(d.start || '') + '"></div>'
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-rotate"></i>周期</div>'
                + '<div class="hx-slider-row"><input type="range" min="20" max="45" value="' + (Number(d.cycle) || 28) + '" id="hx-period-cycle"><span class="hx-slider-val" id="hx-period-cyclev">' + (Number(d.cycle) || 28) + ' 天</span></div></div>'
                + '<div class="hx-sec"><button class="hx-btn primary block" id="hx-period-save">保存</button></div>');
            const body = panelBody('hx-period-panel');
            const sl = body.querySelector('#hx-period-cycle');
            sl.oninput = () => { body.querySelector('#hx-period-cyclev').textContent = sl.value + ' 天'; };
            body.querySelector('#hx-period-save').onclick = () => {
                const s = (body.querySelector('#hx-period-start').value || '').trim();
                if (!s) { toast('先选一个日期', 'warning'); return; }
                this.set({ start: s, cycle: Number(sl.value) || 28 });
                closePanel('hx-period-panel');
                Home.render();
                toast('已更新');
            };
            openPanel('hx-period-panel');
        }
    };

    const QUOTE_DEFAULT = [
        { id: 'q1', text: '你不用和任何人比较。', by: '我', source: '情话库', for: 'c1' },
        { id: 'q2', text: '今天也很想你。', by: '我', source: '情话库', for: 'c1' },
        { id: 'q3', text: '有你在，日子就有了盼头。', by: '我', source: '情话库', for: 'c1' },
        { id: 'q4', text: '慢慢来，我等你。', by: '我', source: '情话库', for: 'c2' },
        { id: 'q5', text: '今天也辛苦啦。', by: '我', source: '情话库', for: 'c2' },
        { id: 'q6', text: '想见你的日子都在倒数。', by: '我', source: '情话库', for: 'c2' }
    ];
    const Quotes = {
        lib() {
            let l = HG.get('quoteLib', QUOTE_DEFAULT.slice());
            if (!l.some(q => q.for === 'c2')) {
                l = l.concat(QUOTE_DEFAULT.filter(q => q.for === 'c2'));
                HG.set('quoteLib', l);
            }
            return l.map(q => Object.assign({ for: 'c1' }, q));
        },
        save(l) { HG.set('quoteLib', l); },
        slot(cid) {
            const cs = contacts();
            return (cs[1] && cid === cs[1].id) ? 'c2' : 'c1';
        },
        whoName(cid) {
            const cs = contacts();
            const c = cs.filter(x => x.id === cid)[0];
            return (c && c.name) || 'TA';
        },
        libFor(cid) {
            const s0 = this.slot(cid);
            return this.lib().filter(q => (q.for || 'c1') === s0 || q.for === 'both');
        },
        /* 今日情话：TA 选过就显示 TA 选的那条，否则按日期从 TA 的情话库里轮换 */
        today(cid) {
            const s0 = this.slot(cid);
            const chosen = HG.get('quoteChosen', {})[s0];
            const lib = this.lib();
            if (chosen) {
                const q = lib.filter(x => x.id === chosen.qid)[0];
                if (q) return Object.assign({}, q, { by: chosen.by || q.by, picked: true });
            }
            const arr = this.libFor(cid);
            if (!arr.length) return { text: '', by: '' };
            const d = new Date();
            const seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate() + (s0 === 'c2' ? 1 : 0);
            return arr[seed % arr.length];
        },
        add(text, by, source, cid) {
            const lib = this.lib();
            lib.push({ id: 'q' + Date.now(), text: text, by: by || myName(), source: source || '情话库', for: this.slot(cid) });
            this.save(lib);
        },
        choose(cid, qid, by) {
            const m = HG.get('quoteChosen', {});
            m[this.slot(cid)] = { qid: qid, by: by, ts: Date.now() };
            HG.set('quoteChosen', m);
        },
        /* 我发请求，由 TA 自己从库里挑一条 */
        askThem(cid) {
            const nm = this.whoName(cid);
            const arr = this.libFor(cid);
            if (!arr.length) { toast('先给 ' + nm + ' 加几句情话', 'warning'); return; }
            if (!(W.V8 && W.V8.Consent)) return;
            W.V8.Consent.ask({
                kind: 'quote', title: '让 ' + nm + ' 选今天的今日情话', detail: '来自情话库',
                by: myName(), from: 'me', cid: cid,
                apply: () => {
                    setTimeout(() => {
                        const pool = this.libFor(cid);
                        const q = pool[Math.floor(Math.random() * pool.length)];
                        this.choose(cid, q.id, nm);
                        Home.render();
                        toast(nm + ' 选好了');
                    }, 1500 + Math.random() * 1500);
                }
            });
        },
        open(cid) {
            const cs = contacts();
            const c1 = cs[0] || { id: sid(), name: partnerName() };
            const c2 = cs[1] || { id: '', name: '第二位' };
            let cur = cid || c1.id;
            const tabs = '<div class="hx-whotabs">'
                + '<button class="hx-whotab ' + (cur === c1.id ? 'on' : '') + '" data-hx-qwho="' + esc(c1.id) + '">' + esc(c1.name || '第一位') + '</button>'
                + (c2.id ? '<button class="hx-whotab ' + (cur === c2.id ? 'on' : '') + '" data-hx-qwho="' + esc(c2.id) + '">' + esc(c2.name || '第二位') + '</button>' : '')
                + '</div>';
            const q = this.today(cur);
            const nm = this.whoName(cur);
            const lib = this.libFor(cur);
            makePanel('hx-quote-panel', '情话',
                tabs
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-comment-heart"></i>' + esc(nm) + ' 的今日情话</div>'
                + '<div class="hx-row"><div class="hx-row-label" style="font-size:15px;font-weight:600;">' + (q && q.text ? esc(q.text) : '还没有') + '</div>'
                + '<button class="hx-btn primary" id="hx-quote-ask">让 ' + esc(nm) + ' 选一条</button></div>'
                + '<div class="hx-empty" style="margin-top:6px;">' + (q && q.by ? esc(q.by) + ' 选的' : '') + '</div></div>'
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-list"></i>' + esc(nm) + ' 的情话库</div>'
                + '<div class="hx-list">' + (lib.length ? lib.map((x, i) =>
                    '<div class="hx-item"><div class="hx-item-main"><div class="hx-item-name" style="font-weight:500;">' + esc(x.text) + '</div>'
                    + '<div class="hx-item-sub">来自：' + esc(x.source || '情话库') + '</div></div>'
                    + '<div class="hx-item-act"><button class="hx-mini" data-hx-qdel="' + esc(x.id) + '"><i class="fas fa-trash"></i></button></div></div>').join('')
                    : '<div class="hx-empty">还没有，先写一条</div>') + '</div></div>'
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-plus"></i>添加（只能你来添加）</div>'
                + '<textarea class="hx-textarea" id="hx-quote-text" placeholder="写一句想对 ' + esc(nm) + ' 说的话"></textarea>'
                + '<div style="display:flex;gap:8px;margin-top:8px;">'
                + '<select class="hx-input" id="hx-quote-src" style="flex:1;"><option value="情话库">情话库</option><option value="聊天记录">聊天记录里的话</option><option value="我发的链接">我发的链接</option></select>'
                + '<button class="hx-btn primary" id="hx-quote-add">添加</button></div></div>');
            const body = panelBody('hx-quote-panel');
            body.querySelectorAll('[data-hx-qwho]').forEach(b => b.onclick = () => {
                if (b.dataset.hxQwho) this.open(b.dataset.hxQwho);
            });
            const ask = body.querySelector('#hx-quote-ask');
            if (ask) ask.onclick = () => { this.askThem(cur); this.open(cur); };
            body.querySelector('#hx-quote-add').onclick = () => {
                const t = (body.querySelector('#hx-quote-text').value || '').trim();
                if (!t) return;
                const src = body.querySelector('#hx-quote-src').value;
                this.add(t, myName(), src, cur);
                toast('已添加');
                this.open(cur);
            };
            body.querySelectorAll('[data-hx-qdel]').forEach(b => b.onclick = () => {
                const l = this.lib().filter(x => x.id !== b.dataset.hxQdel);
                this.save(l);
                this.open(cur);
            });
            openPanel('hx-quote-panel');
        }
    };

    /* ============================================================
       7. 素材（文字 / 图片 / 表情 / 截屏）
       ============================================================ */
    const Materials = {
        lib() { return HG.get('materials', []); },
        add(type, content, by) {
            const l = this.lib();
            l.unshift({ id: 'm' + Date.now() + Math.floor(Math.random() * 100), type: type, content: content, by: by || myName(), ts: Date.now() });
            HG.set('materials', l);
        },
        remove(id) {
            const l = this.lib().filter(x => x.id !== id);
            HG.set('materials', l);
        },
        // 聊天截屏：把当前会话最近几条消息画成一张图（仅本地）
        async snapshot() {
            const msgs = (typeof messages !== 'undefined' ? messages : []).slice(-8);
            if (!msgs.length) { toast('还没有聊天内容', 'warning'); return null; }
            const W_ = 640, pad = 22, lineH = 26;
            const lines = [];
            msgs.forEach(m => {
                if (m.type === 'system') return;
                const who = m.sender === 'user' ? myName() : partnerName();
                const txt = String(m.text || '').replace(/<[^>]+>/g, '').replace(/\n/g, ' ');
                if (!txt) return;
                // 手动折行
                const maxChars = 20;
                for (let i = 0; i < txt.length; i += maxChars) {
                    lines.push({ who: who, text: txt.slice(i, i + maxChars) });
                }
            });
            if (!lines.length) { toast('没有可截取的内容', 'warning'); return null; }
            const H_ = 90 + lines.length * lineH + 30;
            const c = document.createElement('canvas');
            c.width = W_; c.height = H_;
            const ctx = c.getContext('2d');
            const g = ctx.createLinearGradient(0, 0, 0, H_);
            g.addColorStop(0, '#eaf3fc'); g.addColorStop(1, '#f7fbff');
            ctx.fillStyle = g; ctx.fillRect(0, 0, W_, H_);
            ctx.fillStyle = '#5b7fa6';
            ctx.font = 'bold 17px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
            ctx.fillText('聊天记录', pad, 38);
            ctx.fillStyle = '#9db4cb';
            ctx.font = '11px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
            ctx.fillText(new Date().toLocaleString('zh-CN'), pad, 58);
            let y = 86;
            ctx.font = '13px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
            lines.forEach(l => {
                ctx.fillStyle = '#8aa3bb';
                ctx.fillText(l.who, pad, y - 8);
                ctx.fillStyle = '#3d5266';
                ctx.fillText(l.text, pad + 58, y - 8);
                y += lineH;
            });
            try { return c.toDataURL('image/jpeg', 0.86); } catch (e) { return null; }
        },
        open() {
            const lib = this.lib();
            makePanel('hx-mat-panel', '素材',
                '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-layer-group"></i>素材库</div>'
                + '<div class="hx-grid2" id="hx-mat-list">' + (lib.length ? lib.map(m =>
                    (m.type === 'image' || m.type === 'shot'
                        ? '<div class="hx-thumb" data-hx-mat="' + m.id + '" style="background-image:url(\'' + m.content + '\');background-size:cover;background-position:center;">'
                          + '<button class="hx-thumb-del" data-hx-mdel="' + m.id + '"><i class="fas fa-times"></i></button></div>'
                        : m.type === 'emoji'
                        ? '<div class="hx-thumb" data-hx-mat="' + m.id + '" style="font-size:34px;">' + esc(m.content)
                          + '<button class="hx-thumb-del" data-hx-mdel="' + m.id + '"><i class="fas fa-times"></i></button></div>'
                        : '<div class="hx-thumb" data-hx-mat="' + m.id + '" style="padding:8px;font-size:11px;color:#4a5568;word-break:break-all;text-align:left;">' + esc(m.content).slice(0, 42)
                          + '<button class="hx-thumb-del" data-hx-mdel="' + m.id + '"><i class="fas fa-times"></i></button></div>')
                ).join('') : '<div class="hx-empty" style="grid-column:1/-1;">还没有素材</div>') + '</div></div>'
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-plus"></i>补充素材</div>'
                + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
                + '<button class="hx-btn" id="hx-mat-img"><i class="fas fa-image"></i> 上传图片</button>'
                + '<button class="hx-btn" id="hx-mat-shot"><i class="fas fa-crop-simple"></i> 聊天截屏</button>'
                + '<button class="hx-btn" id="hx-mat-txt"><i class="fas fa-font"></i> 文字</button>'
                + '<button class="hx-btn" id="hx-mat-emoji"><i class="fas fa-face-smile"></i> 表情</button>'
                + '</div><input type="file" id="hx-mat-file" accept="image/*" style="display:none;">'
                + '<div id="hx-mat-emojis" style="display:none;margin-top:10px;flex-wrap:wrap;gap:6px;">'
                + ['😀','🥰','😴','🥺','😭','😡','🤍','✨','🌙','☁️','🌷','🧸','🍰','☕','🎧','📷'].map(e=>'<button class="hx-btn" data-hx-memoji="'+e+'" style="padding:6px 9px;font-size:16px;">'+e+'</button>').join('')
                + '</div>'
                + '<div id="hx-mat-txtwrap" style="display:none;margin-top:10px;"><textarea class="hx-textarea" id="hx-mat-text" placeholder="写点什么当朋友圈素材"></textarea>'
                + '<button class="hx-btn primary block" style="margin-top:8px;" id="hx-mat-txtsave">保存</button></div>'
                + '</div>');
            const body = panelBody('hx-mat-panel');
            const file = body.querySelector('#hx-mat-file');
            body.querySelector('#hx-mat-img').onclick = () => file.click();
            file.onchange = async e => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                try { this.add('image', await shrink(f, 1000)); toast('已加入素材库'); this.open(); }
                catch (err) { toast('这张图片读不了', 'warning'); }
                e.target.value = '';
            };
            body.querySelector('#hx-mat-shot').onclick = async () => {
                const url = await this.snapshot();
                if (url) { this.add('shot', url); toast('已截屏并加入素材库'); this.open(); }
            };
            body.querySelector('#hx-mat-emoji').onclick = () => {
                const w = body.querySelector('#hx-mat-emojis');
                w.style.display = w.style.display === 'none' ? 'flex' : 'none';
            };
            body.querySelectorAll('[data-hx-memoji]').forEach(b => b.onclick = () => {
                this.add('emoji', b.dataset.hxMemoji);
                toast('已加入素材库');
                this.open();
            });
            body.querySelector('#hx-mat-txt').onclick = () => {
                const w = body.querySelector('#hx-mat-txtwrap');
                w.style.display = w.style.display === 'none' ? '' : 'none';
            };
            body.querySelector('#hx-mat-txtsave').onclick = () => {
                const t = (body.querySelector('#hx-mat-text').value || '').trim();
                if (!t) return;
                this.add('text', t);
                toast('已保存');
                this.open();
            };
            body.querySelectorAll('[data-hx-mdel]').forEach(b => b.onclick = e => {
                e.stopPropagation();
                const id = b.dataset.hxMdel;
                if (W.V8 && W.V8.Consent) {
                    W.V8.Consent.ask({
                        kind: 'materialDel', title: '我想删除一条素材', detail: '来自素材库', by: myName(), from: 'me',
                        apply: () => { this.remove(id); this.open(); }
                    });
                } else { this.remove(id); this.open(); }
            });
            openPanel('hx-mat-panel');
        }
    };

    /* ============================================================
       8. 小游戏
       ============================================================ */
    const GAMES_PLAT = [
        { k: 'steam', name: 'Steam', re: /steam/i }, { k: 'wegame', name: 'WeGame', re: /wegame|qq\.com/i },
        { k: '4399', name: '4399', re: /4399/i }, { k: 'miniclip', name: '小游戏', re: /miniclip|poki|itch/i },
        { k: 'other', name: '链接', re: /.*/ }
    ];
    const Games = {
        list() { return HG.get('games', []); },
        save(l) { HG.set('games', l); },
        platOf(url) {
            for (const p of GAMES_PLAT) if (p.re.test(url)) return p.name;
            return '链接';
        },
        /* v14：战绩就一句话 —— 谁与谁玩，结果谁赢 */
        vs(g) {
            if (!g) return '';
            if (g.from === 'pair') return esc(g.a || 'TA') + ' 与 ' + esc(g.b || 'TA');
            return esc(g.me || '我') + ' 与 ' + esc(g.them || 'TA');
        },
        resultOf(g) {
            if (!g || !g.result) return '';
            if (g.state === '已拒绝') return this.vs(g) + ' · 没同意，这一局没玩';
            const w = g.result.winner || '';
            return this.vs(g) + ' 玩 · ' + (w && w !== '平局' ? esc(w) + ' 赢' : '平局');
        },
        tab() { return this._tab === 'done' ? 'done' : 'pending'; },
        isDone(g) { const t = (g && g.state) || ''; return t === '已结束' || t === '已拒绝'; },
        /* 不再需要手动记分：退出游戏 / 回到本页就自动记下这一局 */
        autoFinish(id, why) {
            const l = this.list();
            const g = l.filter(x => x.id === id)[0];
            if (!g || g.state !== '进行中') return;
            const dur = Math.max(1, Math.round((Date.now() - (g.startTs || g.ts || Date.now())) / 60000));
            g.state = '已结束';
            g.endTs = Date.now();
            g.duration = dur;
            g.result = g.result || { me: 0, them: 0, total: 0, winner: '' };
            g.auto = why || '退出游戏';
            this.save(l);
            toast('这一局已自动记下：' + (g.with || 'TA') + ' · ' + dur + ' 分钟');
            try { Home.render(); } catch (e) {}
        },
        start(g) {
            let win = null;
            try { win = window.open(g.url, '_blank'); } catch (e) {}
            const l = this.list();
            const x = l.filter(i => i.id === g.id)[0];
            if (x && !x.startTs) { x.startTs = Date.now(); this.save(l); }
            const done = () => this.autoFinish(g.id, '退出游戏');
            if (win) {
                const t = setInterval(() => {
                    let closed = false;
                    try { closed = win.closed; } catch (e) { closed = true; }
                    if (closed) { clearInterval(t); done(); }
                }, 1200);
                setTimeout(() => clearInterval(t), 4 * 3600 * 1000);
            }
            const onVis = () => {
                if (document.visibilityState === 'visible') {
                    document.removeEventListener('visibilitychange', onVis);
                    setTimeout(done, 700);
                }
            };
            document.addEventListener('visibilitychange', onVis);
            setTimeout(done, 3 * 3600 * 1000);
        },
        finish(id, me, them) {
            const l = this.list();
            const g = l.filter(x => x.id === id)[0];
            if (!g) return;
            const a = Number(me) || 0, b = Number(them) || 0;
            g.result = { me: a, them: b, total: a + b, winner: a > b ? (g.me || '我') : (b > a ? (g.them || 'TA') : '平局') };
            g.state = '已结束';
            g.endTs = g.endTs || Date.now();
            this.save(l);
        },
        open() {
            const all = this.list();
            const tab = this.tab();
            const cs = (sessionList || []).filter(s => s.type !== 'group');
            const pend = all.filter(g => !this.isDone(g));
            const done = all.filter(g => this.isDone(g));
            const list = tab === 'pending' ? pend : done;
            const row = g => {
                const acts = [];
                if (g.state === '待我同意') acts.push('<button class="hx-btn primary" style="padding:5px 8px;font-size:11px;" data-hx-gyes="' + g.id + '">同意</button>'
                    + '<button class="hx-btn" style="padding:5px 7px;font-size:11px;" data-hx-gno="' + g.id + '">拒绝</button>');
                if (g.state === '进行中') acts.push('<button class="hx-btn primary" style="padding:5px 9px;font-size:11px;" data-hx-gopen="' + g.id + '">打开</button>');
                if (g.state === '已结束') acts.push('<button class="hx-mini" title="补填分数" data-hx-gfinish="' + g.id + '"><i class="fas fa-pen"></i></button>');
                return '<div class="hx-item"><div class="hx-item-av"><i class="fas fa-gamepad"></i></div>'
                    + '<div class="hx-item-main"><div class="hx-item-name">' + esc(g.title) + '</div>'
                    + '<div class="hx-item-sub">' + this.vs(g) + ' · ' + esc(g.state || '') + (g.plat ? ' · ' + esc(g.plat) : '') + '</div>'
                    + (g.result ? '<div class="hx-game-result">' + this.resultOf(g) + '</div>' : '')
                    + '</div><div class="hx-item-act">' + acts.join('') + '</div></div>';
            };
            /* v22-10：与不同联系人玩游戏的累计时长 */
            const durAgg = {};
            done.forEach(g => {
                const nm = g.with || g.them || '';
                if (!nm) return;
                durAgg[nm] = (durAgg[nm] || 0) + Number(g.duration || 0);
            });
            const fmtDur = m => m >= 60 ? (Math.floor(m / 60) + ' 小时 ' + (m % 60) + ' 分钟') : (m + ' 分钟');
            const durRows = Object.keys(durAgg).map(nm =>
                '<div class="v22-g-dur"><span class="v22-g-name">' + esc(nm) + '</span><span class="v22-g-time">' + fmtDur(durAgg[nm]) + '</span></div>').join('');
            makePanel('hx-game-panel', '游戏',
                '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-hourglass-half"></i>游戏时长</div>'
                + (durRows || '<div class="hx-empty">还没有记录，玩完一局会自动累计</div>')
                + '</div>'
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-gamepad"></i>发起一局</div>'
                + '<input class="hx-input" id="hx-game-url" placeholder="粘贴任何平台的游戏链接">'
                + '<div style="display:flex;gap:8px;margin-top:8px;">'
                + '<select class="hx-input" id="hx-game-to" style="flex:1;">'
                + (cs.length ? cs.map(c => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('') : '<option value="">还没有联系人</option>')
                + (cs.length > 1 ? '<option value="__pair__">（他们两位互相邀请）</option>' : '')
                + '</select><button class="hx-btn primary" id="hx-game-send">邀请</button></div></div>'
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-clock-rotate-left"></i>游戏</div>'
                + '<div style="display:flex;gap:8px;margin-bottom:8px;">'
                + '<button class="hx-btn ' + (tab === 'pending' ? 'primary' : '') + '" style="flex:1;padding:7px;font-size:12px;" data-hx-gtab="pending">待玩游戏 · ' + pend.length + '</button>'
                + '<button class="hx-btn ' + (tab === 'done' ? 'primary' : '') + '" style="flex:1;padding:7px;font-size:12px;" data-hx-gtab="done">玩过游戏 · ' + done.length + '</button>'
                + '</div>'
                + '<div class="hx-list">' + (list.length ? list.map(row).join('')
                    : '<div class="hx-empty">' + (tab === 'pending' ? '暂时没有待玩的，粘贴链接邀请 TA 试试' : '还没有玩过') + '</div>') + '</div></div>');
            const body = panelBody('hx-game-panel');
            body.querySelectorAll('[data-hx-gtab]').forEach(b => b.onclick = () => { this._tab = b.dataset.hxGtab; this.open(); });
            const send = body.querySelector('#hx-game-send');
            if (send) send.onclick = () => {
                const url = (body.querySelector('#hx-game-url').value || '').trim();
                const to = body.querySelector('#hx-game-to').value;
                if (!/^https?:\/\//i.test(url)) { toast('先粘贴一个游戏链接', 'warning'); return; }
                if (!to) { toast('先新建一位联系人', 'warning'); return; }
                /* 他们两位互相邀请：他们自己同意 / 拒绝；没同意没拒绝就留在待玩 */
                if (to === '__pair__') {
                    if (cs.length < 2) { toast('需要两位联系人', 'warning'); return; }
                    const a = cs[0].name, bb = cs[1].name;
                    const g0 = { id: 'gp' + Date.now(), url: url, plat: this.platOf(url),
                        title: a + ' 邀 ' + bb + ' 一起玩', from: 'pair', a: a, b: bb,
                        state: '待他们决定', ts: Date.now(), me: a, them: bb };
                    const l0 = this.list(); l0.unshift(g0); this.save(l0);
                    toast('已发出，等他们自己决定');
                    setTimeout(() => {
                        const l2 = this.list();
                        const g2 = l2.filter(x => x.id === g0.id)[0];
                        if (!g2 || g2.state !== '待他们决定') return;
                        const rnd = Math.random();
                        if (rnd < 0.62) {
                            const w = Math.random() < 0.5 ? a : bb;
                            g2.state = '已结束'; g2.startTs = Date.now(); g2.endTs = Date.now();
                            g2.duration = 6 + Math.floor(Math.random() * 25);
                            g2.result = { me: 0, them: 0, total: 0, winner: w };
                            toast(a + ' 和 ' + bb + ' 玩完了 · ' + w + ' 赢');
                        } else if (rnd < 0.86) {
                            g2.state = '已拒绝';
                        }
                        this.save(l2);
                        if (this.tab() === 'done') this.open();
                    }, 2600 + Math.random() * 2200);
                    this.open();
                    return;
                }
                const c = (sessionList || []).filter(x => x.id === to)[0];
                const g = {
                    id: 'g' + Date.now(), url: url, plat: this.platOf(url),
                    title: (c ? c.name : 'TA') + ' 的游戏邀请',
                    with: c ? c.name : 'TA', state: '等待同意', ts: Date.now(),
                    me: myName(), them: c ? c.name : 'TA'
                };
                const l = this.list(); l.unshift(g); this.save(l);
                toast('已发出邀请，等 ' + (c ? c.name : 'TA') + ' 同意');
                setTimeout(() => {
                    const l2 = this.list();
                    const g2 = l2.filter(x => x.id === g.id)[0];
                    if (!g2) return;
                    const agree = Math.random() < 0.85;
                    g2.state = agree ? '进行中' : '已拒绝';
                    if (agree) g2.startTs = Date.now();
                    this.save(l2);
                    if (agree) toast((c ? c.name : 'TA') + ' 同意了，可以一起玩');
                    this.open();
                }, 1600 + Math.random() * 1600);
                this.open();
            };
            body.querySelectorAll('[data-hx-gopen]').forEach(b => b.onclick = () => {
                const g = this.list().filter(x => x.id === b.dataset.hxGopen)[0];
                if (g) this.start(g);
            });
            body.querySelectorAll('[data-hx-gyes]').forEach(b => b.onclick = () => {
                const l = this.list();
                const g = l.filter(x => x.id === b.dataset.hxGyes)[0];
                if (g) { g.state = '进行中'; g.startTs = Date.now(); this.save(l); toast('已同意，可以一起玩了'); }
                this.open();
            });
            body.querySelectorAll('[data-hx-gno]').forEach(b => b.onclick = () => {
                const l = this.list();
                const g = l.filter(x => x.id === b.dataset.hxGno)[0];
                if (g) { g.state = '已拒绝'; this.save(l); toast('已拒绝'); }
                this.open();
            });
            body.querySelectorAll('[data-hx-gfinish]').forEach(b => b.onclick = () => {
                const id = b.dataset.hxGfinish;
                const g = this.list().filter(x => x.id === id)[0];
                if (!g) return;
                makePanel('hx-gscore-panel', '补填分数（可选）',
                    '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-users"></i>' + this.vs(g) + '</div>'
                    + '<div style="display:flex;gap:8px;margin-top:8px;">'
                    + '<input class="hx-input" id="hx-gs-me" type="number" placeholder="我的分数" style="flex:1;">'
                    + '<input class="hx-input" id="hx-gs-them" type="number" placeholder="TA 的分数" style="flex:1;"></div>'
                    + '<button class="hx-btn primary block" style="margin-top:10px;" id="hx-gs-save">保存结果</button></div>');
                const bd = panelBody('hx-gscore-panel');
                bd.querySelector('#hx-gs-save').onclick = () => {
                    const a = bd.querySelector('#hx-gs-me').value, c2 = bd.querySelector('#hx-gs-them').value;
                    if (a === '' && c2 === '') { toast('先填分数', 'warning'); return; }
                    this.finish(id, a, c2);
                    closePanel('hx-gscore-panel');
                    toast('已记录结果');
                    this.open();
                };
                openPanel('hx-gscore-panel');
            });
            /* TA 也会邀请我（最多留一条等我同意） */
            if (cs.length && !this.list().some(g => g.state === '待我同意') && Math.random() < 0.5) {
                const c = cs[Math.floor(Math.random() * cs.length)];
                const l = this.list();
                l.unshift({
                    id: 'gi' + Date.now(), url: 'https://poki.com/', plat: '链接',
                    title: c.name + ' 邀你一起玩', with: c.name, state: '待我同意',
                    ts: Date.now(), me: myName(), them: c.name
                });
                this.save(l);
                this.open();
                return;
            }
            openPanel('hx-game-panel');
        }
    };

    /* ============================================================
       9. 联系人 / 群聊
       ============================================================ */
    function switchSession(id, opts) {
        opts = opts || {};
        if (!id) return;
        if (id === sid() && !opts.force) { Home.hide(); applyChatMode(); return; }
        const go = async () => {
            try { if (typeof saveData === 'function') await saveData(); } catch (e) {}
            try {
                SESSION_ID = id;
                await localforage.setItem(pref() + 'lastSessionId', id);
            } catch (e) {}
            try { if (typeof loadData === 'function') await loadData(); } catch (e) {}
            try {
                const cs0 = (sessionList || []).filter(x => x.id === id)[0] || {};
                if (cs0.name) settings.partnerName = cs0.name;
            } catch (e) {}
            try { if (typeof renderMessages === 'function') renderMessages(); } catch (e) {}
            try { if (typeof updateUI === 'function') updateUI(); } catch (e) {}
            // 顶部名字 / 头像跟着切换
            try {
                const cs = (sessionList || []).filter(x => x.id === id)[0] || {};
                const nm = document.querySelector('#partner-name');
                if (nm && cs.name) nm.textContent = cs.name;
                if (cs.avatar) {
                    const av = document.querySelector('#partner-avatar');
                    if (av) av.innerHTML = '<img src="' + cs.avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
                }
            } catch (e) {}
            applyChatMode();
            if (!Distance.current()) Distance.themPick();
            Distance.apply();
            Status.paint();
            Home.hide();
        };
        go();
    }

    const Contacts = {
        open() {
            const list = (sessionList || []).filter(s => s.type !== 'group');
            makePanel('hx-contacts-panel', '聊天',
                '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-comments"></i>联系人</div>'
                + '<div class="hx-list">' + (list.length ? list.map(c => {
                    const on = c.id === sid();
                    const av = c.avatar ? '<img src="' + esc(c.avatar) + '">' : esc((c.name || '梦').slice(0, 1));
                    return '<div class="hx-item" data-hx-open="' + esc(c.id) + '">'
                        + '<div class="hx-item-av">' + av + '</div>'
                        + '<div class="hx-item-main"><div class="hx-item-name">' + esc(c.name || '梦角') + (on ? ' <span class="hx-tag">当前</span>' : '') + '</div>'
                        + '</div>'
                        + '<button class="hx-mini" data-hx-cdel="' + esc(c.id) + '" style="margin-right:4px;"><i class="fas fa-trash"></i></button>'
                        + '<i class="fas fa-chevron-right" style="color:#b8c7d8;font-size:11px;"></i></div>';
                }).join('') : '<div class="hx-empty">还没有联系人</div>') + '</div>'
                + '<button class="hx-btn primary block" id="hx-new-contact" style="margin-top:12px;"><i class="fas fa-plus"></i> 新建联系人</button></div>');
            const body = panelBody('hx-contacts-panel');
            body.querySelectorAll('[data-hx-open]').forEach(el => el.onclick = () => {
                closePanel('hx-contacts-panel');
                switchSession(el.dataset.hxOpen, { force: true });
            });
            body.querySelectorAll('[data-hx-cdel]').forEach(b => b.onclick = async e => {
                e.stopPropagation();
                const id = b.dataset.hxCdel;
                const c = (sessionList || []).filter(x => x.id === id)[0];
                if (!c) return;
                if (!confirm('删除联系人「' + (c.name || '梦角') + '」？')) return;
                try {
                    sessionList = (sessionList || []).filter(x => x.id !== id);
                    await localforage.setItem(pref() + 'sessionList', sessionList);
                } catch (err) {}
                toast('已删除');
                if (id === sid()) {
                    const next = (sessionList || []).filter(x => x.type !== 'group')[0];
                    if (next) switchSession(next.id, { force: true });
                    else { closePanel('hx-contacts-panel'); Home.show(); }
                } else {
                    this.open();
                }
            });
            const nb = body.querySelector('#hx-new-contact');
            if (nb) nb.onclick = () => {
                let tmp = '';
                makePanel('hx-newc-panel', '新建联系人',
                    '<div class="hx-sec"><div style="display:flex;gap:12px;align-items:center;">'
                    + '<div class="hx-avpick" id="hx-nc-av">＋</div>'
                    + '<div style="flex:1;"><input class="hx-input" id="hx-nc-name" placeholder="TA 的名字 / 备注" maxlength="12"></div>'
                    + '</div><input type="file" id="hx-nc-file" accept="image/*" style="display:none;"></div>'
                    + '<div class="hx-sec"><button class="hx-btn primary block" id="hx-nc-save">创建并进入聊天</button></div>');
                const b2 = panelBody('hx-newc-panel');
                const av = b2.querySelector('#hx-nc-av');
                const file = b2.querySelector('#hx-nc-file');
                av.onclick = () => file.click();
                file.onchange = async e => {
                    const f = e.target.files && e.target.files[0];
                    if (!f) return;
                    try { tmp = await shrink(f, 400); av.innerHTML = '<img src="' + tmp + '">'; } catch (err) {}
                    e.target.value = '';
                };
                b2.querySelector('#hx-nc-save').onclick = async () => {
                    const v = (b2.querySelector('#hx-nc-name').value || '').trim();
                    if (!v) { toast('先起个名字', 'warning'); return; }
                    const newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
                    try {
                        if (!Array.isArray(sessionList)) sessionList = [];
                        sessionList.push({ id: newId, name: v, avatar: tmp || '', createdAt: Date.now() });
                        await localforage.setItem(pref() + 'sessionList', sessionList);
                    } catch (e) {}
                    closePanel('hx-newc-panel');
                    closePanel('hx-contacts-panel');
                    toast('已新建联系人「' + v + '」');
                    switchSession(newId, { force: true });
                };
                openPanel('hx-newc-panel');
            };
            openPanel('hx-contacts-panel');
        }
    };

    const Groups = {
        mine() { return (sessionList || []).filter(s => s.type === 'group' && (s.owner === 'me' || !s.owner)); },
        theirs() { return (sessionList || []).filter(s => s.type === 'group' && s.owner === 'them'); },
        open() {
            const mine = this.mine(), theirs = this.theirs();
            const item = g => {
                const on = g.id === sid();
                return '<div class="hx-item" data-hx-gopen2="' + esc(g.id) + '">'
                    + '<div class="hx-item-av"><i class="fas fa-users"></i></div>'
                    + '<div class="hx-item-main"><div class="hx-item-name">' + esc(g.name) + (on ? ' <span class="hx-tag">当前</span>' : '') + '</div>'
                    + '<div class="hx-item-sub">' + ((g.members || []).length + 1) + ' 人</div></div>'
                    + '<button class="hx-mini" data-hx-gdel="' + esc(g.id) + '" style="margin-right:4px;"><i class="fas fa-trash"></i></button>'
                    + '<i class="fas fa-chevron-right" style="color:#b8c7d8;font-size:11px;"></i></div>';
            };
            const cur = curSession();
            const inGroup = !!(cur && cur.type === 'group');
            // 梦角偶尔会申请改群名，需要我点头
            if (inGroup && Math.random() < 0.28) {
                const p0 = HS.get('renamePending', []);
                if (!p0.some(x => x.gid === cur.id)) {
                    const pool = ['我们的小窝', '深夜食堂', '今天也在摸鱼', '三个人的小群', '慢慢说话的地方'];
                    const nm = pool[Math.floor(Math.random() * pool.length)];
                    if (nm !== cur.name) {
                        p0.push({ gid: cur.id, name: nm, by: partnerName(), ts: Date.now() });
                        HS.set('renamePending', p0);
                    }
                }
            }
            const pend = HS.get('renamePending', []);
            makePanel('hx-groups-panel', '群聊',
                '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-plus"></i>新建群聊</div>'
                + '<button class="hx-btn primary block" id="hx-new-group"><i class="fas fa-users"></i> 新建群聊</button></div>'
                + (pend.length ? '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-pen"></i>改名申请</div><div class="hx-list">'
                    + pend.map((p, i) => '<div class="hx-item"><div class="hx-item-main"><div class="hx-item-name">「' + esc(p.name) + '」</div>'
                        + '<div class="hx-item-sub">' + esc(p.by || 'TA') + ' 想改群名</div></div>'
                        + '<div class="hx-item-act"><button class="hx-btn primary" style="padding:5px 9px;font-size:11px;" data-hx-rnagree="' + i + '">同意</button>'
                        + '<button class="hx-btn" style="padding:5px 8px;font-size:11px;" data-hx-rndeny="' + i + '">拒绝</button></div></div>').join('')
                    + '</div></div>' : '')
                + (inGroup ? '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-pen"></i>改群名</div>'
                    + '<div style="display:flex;gap:8px;"><input class="hx-input" id="hx-rename-input" value="' + esc(cur.name || '') + '" maxlength="16">'
                    + '<button class="hx-btn primary" id="hx-rename-btn">申请</button></div></div>' : '')
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-crown"></i>我的群聊</div>'
                + '<div class="hx-list">' + (mine.length ? mine.map(item).join('') : '<div class="hx-empty">还没有自己建的群</div>') + '</div></div>'
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-envelope-open-text"></i>拥有群聊</div>'
                + '<div class="hx-list">' + (theirs.length ? theirs.map(item).join('') : '<div class="hx-empty">还没有人邀请你进群</div>') + '</div></div>');
            const body = panelBody('hx-groups-panel');
            const nb2 = body.querySelector('#hx-rename-btn');
            if (nb2) nb2.onclick = () => {
                const v = (body.querySelector('#hx-rename-input').value || '').trim();
                if (!v) return;
                if (v === cur.name) return;
                if (W.V8 && W.V8.Consent) {
                    W.V8.Consent.ask({
                        kind: 'groupRename', title: '我想把群名改成「' + v + '」', detail: '来自群聊', by: myName(), from: 'me',
                        apply: () => {
                            cur.name = v;
                            localforage.setItem(pref() + 'sessionList', sessionList).catch(() => {});
                            closePanel('hx-groups-panel');
                            applyChatMode();
                            Home.render();
                        }
                    });
                } else {
                    toast('已发出改名申请，等 TA 同意');
                    setTimeout(() => {
                        if (Math.random() < 0.75) {
                            cur.name = v;
                            localforage.setItem(pref() + 'sessionList', sessionList).catch(() => {});
                            applyChatMode(); Home.render();
                        }
                    }, 1400);
                }
            };
            body.querySelectorAll('[data-hx-rnagree]').forEach(b => b.onclick = () => {
                const p = HS.get('renamePending', []);
                const i = Number(b.dataset.hxRnagree);
                if (!p[i]) return;
                const g = (sessionList || []).filter(x => x.id === p[i].gid)[0];
                if (g) {
                    g.name = p[i].name;
                    localforage.setItem(pref() + 'sessionList', sessionList).catch(() => {});
                }
                p.splice(i, 1);
                HS.set('renamePending', p);
                toast('已同意改名');
                closePanel('hx-groups-panel');
                applyChatMode();
                Home.render();
            });
            body.querySelectorAll('[data-hx-rndeny]').forEach(b => b.onclick = () => {
                const p = HS.get('renamePending', []);
                p.splice(Number(b.dataset.hxRndeny), 1);
                HS.set('renamePending', p);
                toast('已拒绝');
                closePanel('hx-groups-panel');
                Groups.open();
            });
            const ng = body.querySelector('#hx-new-group');
            if (ng) ng.onclick = () => {
                closePanel('hx-groups-panel');
                HG.set('skipHome', 1);      // 建完群 reload 后直接进群聊，不再弹主页
                const b = $('group-chat-btn');
                if (b) b.click();
            };
            body.querySelectorAll('[data-hx-gdel]').forEach(b => b.onclick = e => {
                e.stopPropagation();
                const id = b.dataset.hxGdel;
                const g = (sessionList || []).filter(x => x.id === id)[0];
                if (!g) return;
                const doDel = async () => {
                    try {
                        sessionList = (sessionList || []).filter(x => x.id !== id);
                        await localforage.setItem(pref() + 'sessionList', sessionList);
                    } catch (err) {}
                    closePanel('hx-gdel-panel');
                    toast('已删除群聊');
                    if (id === sid()) {
                        const next = (sessionList || []).filter(x => x.type !== 'group')[0];
                        if (next) switchSession(next.id, { force: true });
                        else { closePanel('hx-groups-panel'); Home.show(); }
                    } else { Groups.open(); }
                };
                /* v25-1：两种删除方式 —— ①直接删除 ②发申请等他们同意后再删；
                   自己建的群、他们邀请我进的群，两种方式都可以用 */
                const isMine = (g.owner === 'me' || !g.owner);
                makePanel('hx-gdel-panel', '删除群聊',
                    '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-trash"></i>「' + esc(g.name || '群聊') + '」</div>'
                    + '<div class="hx-item-sub" style="margin-bottom:12px;">' + (isMine ? '这是你自己建的群' : '这是他们邀请你进的群') + '，选一种方式删掉它。</div>'
                    + '<button class="hx-btn primary block" id="hx-gdel-now" style="margin-bottom:8px;"><i class="fas fa-bolt"></i> 直接删除</button>'
                    + '<button class="hx-btn block" id="hx-gdel-ask"><i class="fas fa-hourglass-half"></i> 等他们同意后删除</button>'
                    + '</div>');
                const db = panelBody('hx-gdel-panel');
                if (!db) return;
                db.querySelector('#hx-gdel-now').onclick = () => doDel();
                db.querySelector('#hx-gdel-ask').onclick = () => {
                    closePanel('hx-gdel-panel');
                    if (W.V8 && W.V8.Consent) {
                        W.V8.Consent.ask({
                            kind: 'groupDel', title: '删除群聊「' + (g.name || '群聊') + '」',
                            detail: '来自群聊 · 等他们同意', by: myName(), from: 'me', apply: doDel
                        });
                    } else { doDel(); }
                    Groups.open();
                };
                openPanel('hx-gdel-panel');
            });
            body.querySelectorAll('[data-hx-gopen2]').forEach(el => el.onclick = () => {
                closePanel('hx-groups-panel');
                switchSession(el.dataset.hxGopen2, { force: true });
            });
            openPanel('hx-groups-panel');
        }
    };

    /* ---------------- 群聊模式 ---------------- */
    function applyChatMode() {
        let s = curSession();
        const isGroup = !!(s && s.type === 'group');
        document.body.classList.toggle('group-mode', isGroup);
        const bar = $('group-name-bar');
        if (bar) {
            const t = bar.querySelector('.gname-txt');
            if (t) t.textContent = isGroup ? (s.name || '群聊') : '';
            bar.style.display = isGroup ? 'flex' : 'none';
            // 顶部显示群内禁言人数（点群名进群管理可看具体是谁）
            try {
                let chip = bar.querySelector('.gname-mute');
                let n = 0;
                const gv = W.GX && W.GX.gov && W.GX.gov();
                if (isGroup && gv && gv.mutes) {
                    Object.keys(gv.mutes).forEach(k => {
                        const m = gv.mutes[k];
                        if (m && (m.until || 0) > Date.now()) n++;
                    });
                }
                if (n) {
                    if (!chip) { chip = document.createElement('span'); chip.className = 'gname-mute'; bar.appendChild(chip); }
                    chip.textContent = '🔇 ' + n;
                } else if (chip) { chip.remove(); }
            } catch (e) {}
            if (isGroup && !bar.dataset.hxBound) {
                bar.dataset.hxBound = '1';
                // 点群名 → 群管理（禁言、拉人踢人、改群名都在这里）
                bar.onclick = () => {
                    const b = $('group-chat-btn');
                    if (b) b.click();
                };
            }
        }
        // 记住最近一次单聊，供群聊返回
        if (s && s.type !== 'group') HG.set('lastSingle', s.id);
        try {
            if (typeof groupChatSettings !== 'undefined') {
                if (isGroup) {
                    const ids = (s.members || []);
                    const list = (sessionList || []).filter(x => ids.indexOf(x.id) >= 0);
                    groupChatSettings.enabled = true;
                    groupChatSettings.members = list.map(x => ({ name: x.name, id: x.id, avatar: x.avatar || null }));
                    if (typeof saveGroupChatSettings === 'function') saveGroupChatSettings();
                } else {
                    groupChatSettings.enabled = false;
                    if (typeof saveGroupChatSettings === 'function') saveGroupChatSettings();
                    groupChatSettings.members = [];
                }
            }
        } catch (e) {}
        Distance.apply();
    }

    /* ============================================================
       10. 「我们」
       ============================================================ */
    const Us = {
        open() {
            W.__hxBackToUs = false;
            const items = [
                { k: 'distance', name: '距离', ico: 'fa-location-dot' },
                /* v22-2：原「心情」改为「状态」，与私聊头像下方的「在线」联动 */
                { k: 'status', name: '状态', ico: 'fa-id-badge' },
                { k: 'materials', name: '素材', ico: 'fa-layer-group' },
                { k: 'quotes', name: '情话', ico: 'fa-comment-heart' },
                { k: 'nick', name: '昵称', ico: 'fa-user-edit' },
                { k: 'avatar', name: '头像与头像库', ico: 'fa-user-circle' },
                /* v15：邀请 / 请求的入口放回主页，聊天界面里不再挂标志 */
                { k: 'consent', name: '待同意', ico: 'fa-bell' },
                /* v20-17：私聊 / 群聊背景单独设置 */
                { k: 'chatbg', name: '聊天背景', ico: 'fa-image' }
            ];
            /* v22-15：去掉「选择」面板里的「我们」标题与「我与XX」那行文字 */
            makePanel('hx-us-panel', '',
                '<div class="hx-sec"><div class="hx-grid3">'
                + items.map(it => '<button class="hx-btn hx-usitem" data-hx-us="' + it.k + '"><i class="fas ' + it.ico + '"></i><span>' + it.name + '</span></button>').join('')
                + '</div></div>');
            const body = panelBody('hx-us-panel');
            body.querySelectorAll('[data-hx-us]').forEach(b => b.onclick = () => {
                const k = b.dataset.hxUs;
                closePanel('hx-us-panel');
                const cs = contacts();
                const c1 = (cs[0] && cs[0].id) || sid();
                const c2 = (cs[1] && cs[1].id) || '';
                W.__hxBackToUs = true; W.__hxBackToUsAt = Date.now();   // 子页返回时回到 🤍，而不是设置
                if (k === 'distance') { Distance.open(c1); return; }
                if (k === 'status') { Status.open(c1); return; }
                if (k === 'materials') { Materials.open(); return; }
                if (k === 'quotes') { Quotes.open(); return; }
                if (k === 'nick') { if (W.V8 && W.V8.Nicknames) W.V8.Nicknames.open(); else openChatNames(); return; }
                if (k === 'avatar') { if (W.V8 && W.V8.Avatars) W.V8.Avatars.open(); else openChatNames(); return; }
                if (k === 'consent') { if (W.V8 && W.V8.Consent) { W.V8.Consent.open(); } return; }
                if (k === 'chatbg') { ChatBg.open(); return; }
                if (k === 'anniv') { const e = $('anniversary-function'); if (e) e.click(); return; }
                if (k === 'letter') { const e = $('envelope-function'); if (e) e.click(); return; }
            });
            openPanel('hx-us-panel');
        }
    };

    /* ============================================================
       v22-14：钱包（排在「重要日」后面）
       —— 收到的：来自谁 + 红包/转账 分别累计
       —— 我的支出：转给谁 + 红包/转账 分别累计
       ============================================================ */
    const Wallet = {
        key: 'walletData',
        data() {
            const d = HG.get(this.key, null);
            if (d && Array.isArray(d['in']) && Array.isArray(d.out)) return d;
            return { 'in': [], out: [] };
        },
        save(d) { HG.set(this.key, d); },
        people() {
            const cs = contacts();
            return (cs.length ? cs : [{ id: sid(), name: partnerName() }]).map(c => ({ id: c.id, name: c.name || '梦角' }));
        },
        tabs: 'in',
        open() {
            const d = this.data();
            const ps = this.people();
            const tab = this.tabs === 'out' ? 'out' : 'in';
            const arr = tab === 'in' ? d['in'] : d.out;
            const keyOf = x => (tab === 'in' ? x.from : x.to) || '未指定';
            const agg = {};
            arr.forEach(x => {
                const k = keyOf(x);
                agg[k] = agg[k] || { '红包': 0, '转账': 0 };
                const t = (x.type === '转账' ? '转账' : '红包');
                agg[k][t] += Number(x.amount || 0);
            });
            const total = { '红包': 0, '转账': 0 };
            Object.keys(agg).forEach(k => { total['红包'] += agg[k]['红包']; total['转账'] += agg[k]['转账']; });
            const money = n => '¥' + (Math.round(n * 100) / 100).toFixed(2);
            const rows = Object.keys(agg).length
                ? Object.keys(agg).map(k => {
                    const o = agg[k];
                    return '<div class="v22-w-row"><div class="v22-w-who">' + esc(k) + '</div>'
                        + '<div class="v22-w-nums"><span>红包 ' + money(o['红包']) + '</span><span>转账 ' + money(o['转账']) + '</span></div>'
                        + '<div class="v22-w-total">' + money(o['红包'] + o['转账']) + '</div></div>';
                }).join('')
                : '<div class="hx-empty">还没有记录</div>';
            const whoOpts = ps.map(p => '<option value="' + esc(p.name) + '">' + esc(p.name) + '</option>').join('');
            makePanel('hx-wallet-panel', '钱包',
                '<div class="v22-w-tabs">'
                + '<button class="v22-w-tab ' + (tab === 'in' ? 'on' : '') + '" data-hx-wtab="in">收到的</button>'
                + '<button class="v22-w-tab ' + (tab === 'out' ? 'on' : '') + '" data-hx-wtab="out">我的支出</button>'
                + '</div>'
                + '<div class="v22-w-sum">'
                + '<div><b>' + money(total['红包']) + '</b><span>红包</span></div>'
                + '<div><b>' + money(total['转账']) + '</b><span>转账</span></div>'
                + '<div><b>' + money(total['红包'] + total['转账']) + '</b><span>合计</span></div>'
                + '</div>'
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-list"></i>' + (tab === 'in' ? '按谁分别累计' : '按转给谁分别累计') + '</div>'
                + '<div class="v22-w-list">' + rows + '</div></div>'
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-plus"></i>记一笔</div>'
                + '<div class="v22-w-form">'
                + '<select id="hx-w-type"><option>红包</option><option>转账</option></select>'
                + '<select id="hx-w-who">' + whoOpts + '</select>'
                + '<input type="number" id="hx-w-amount" placeholder="金额" min="0.01" step="0.01">'
                + '<input type="text" id="hx-w-note" placeholder="备注（可不填）" maxlength="20">'
                + '<button class="hx-btn primary" id="hx-w-add">添加</button>'
                + '</div></div>');
            const bd = panelBody('hx-wallet-panel');
            bd.querySelectorAll('[data-hx-wtab]').forEach(b => b.onclick = () => { this.tabs = b.dataset.hxWtab; this.open(); });
            const add = bd.querySelector('#hx-w-add');
            if (add) add.onclick = () => {
                const type = bd.querySelector('#hx-w-type').value;
                const who = bd.querySelector('#hx-w-who').value;
                const amt = parseFloat(bd.querySelector('#hx-w-amount').value);
                const note = (bd.querySelector('#hx-w-note').value || '').trim();
                if (!amt || amt <= 0) { toast('金额要大于 0', 'warning'); return; }
                const dd = this.data();
                const rec = { type: type, amount: amt, note: note, ts: Date.now() };
                if (tab === 'in') { rec.from = who; dd['in'].push(rec); } else { rec.to = who; dd.out.push(rec); }
                this.save(dd);
                toast('已记一笔');
                this.open();
            };
            openPanel('hx-wallet-panel');
        }
    };

    /* 昵称（含昵称库）——入口在 🤍 */
    function openChatNames() {
        const m = $('chat-modal');
        if (m && typeof showModal === 'function') showModal(m);
        setTimeout(() => {
            const t = m && m.querySelector('.cs-title-text');
            if (t) t.textContent = '昵称';
            const tabs = $('cs-tabs');
            if (tabs) tabs.style.display = 'none';
            const tab = document.querySelector('.cs-tab[data-panel="cs-panel-names"]');
            if (tab && typeof W.switchCsTab === 'function') W.switchCsTab(tab);
        }, 90);
    }
    function restoreChatSettingsTitle() {
        const m = $('chat-modal');
        if (!m) return;
        const t = m.querySelector('.cs-title-text');
        if (t) t.textContent = '聊天设置';
        const tabs = $('cs-tabs');
        if (tabs) tabs.style.display = '';
        const first = m.querySelector('.cs-tab');
        if (first && typeof W.switchCsTab === 'function') W.switchCsTab(first);
    }

    function openMoments() {
        const m = $('love-panel-modal');
        /* v24-3：从主页组件进入朋友圈，返回键应回主页 */
        try { if (W.LoveExt && W.LoveExt.LP) W.LoveExt.LP._fromHome = true; } catch (e) {}
        if (m && typeof showModal === 'function') showModal(m);
        setTimeout(() => {
            try { W.LoveExt.LP.pick('moments'); } catch (e) {}
        }, 70);
    }


    /* ============================================================
       11. 主页
       ============================================================ */
    const Home = {
        built: false,
        shown: false,
        startDate() {
            const d = HG.get('startDate', '');
            if (d) return d;
            try {
                if (typeof anniversaries !== 'undefined' && anniversaries.length) {
                    const a = anniversaries.filter(x => x.type !== 'countdown')[0];
                    if (a && a.date) return a.date;
                }
            } catch (e) {}
            const n = new Date();
            const s = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
            HG.set('startDate', s);
            return s;
        },
        days() {
            return this.daysOf(this.startDate());
        },
        daysOf(sd) {
            const d = new Date(sd);
            if (isNaN(d.getTime())) return 0;
            return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
        },
        build() {
            if ($('home-screen')) { this.built = true; return; }
            const el = document.createElement('div');
            el.id = 'home-screen';
            el.innerHTML =
                '<div class="home-bg-layer"></div>'
                + '<div class="home-topbar">'
                + '<div class="home-topbar-right"><button class="home-edit-btn" id="home-edit-btn" title="组件背景"><i class="fas fa-sliders"></i></button></div></div>'
                + '<div class="home-viewport" id="home-viewport">'
                + '<section class="home-page" data-hx-page="1">'
                + '<div id="hg-card-together"></div>'
                + '<div class="hg-row2"><div id="hg-card-quote"></div><div id="hg-card-period"></div></div>'
                + '<div class="hg-widgets" id="hg-widgets-1"></div>'
                + '</section>'
                + '<section class="home-page" data-hx-page="2">'
                + '<div id="hg-card-together2"></div>'
                + '<div class="hg-row2"><div id="hg-card-quote2"></div><div id="hg-card-period2"></div></div>'
                + '<div class="hg-widgets" id="hg-widgets-2"></div>'
                + '</section>'
                + '</div>'
                + '<div class="home-dots" id="home-dots"><span class="home-dot on"></span><span class="home-dot"></span></div>';
            document.body.appendChild(el);

            $('home-edit-btn').onclick = () => WidgetBg.open('widget');
            $('home-viewport').addEventListener('scroll', () => {
                const vp = $('home-viewport');
                const idx = Math.round(vp.scrollLeft / Math.max(1, vp.clientWidth));
                $$('.home-dot').forEach((d, i) => d.classList.toggle('on', i === idx));
            }, { passive: true });
            this.built = true;
        },
        applyBg() {
            const el = $('home-screen');
            if (!el) return;
            const bg = HG.get('homeBg', '');
            const layer = el.querySelector('.home-bg-layer');
            if (bg) {
                layer.style.backgroundImage = 'url("' + bg + '")';
                el.classList.add('has-bg');
            } else {
                layer.style.backgroundImage = '';
                el.classList.remove('has-bg');
            }
        },
        cardTogether(key) {
            key = key || 'together';
            const second = key === 'together2';
            const cs = contacts();
            const c = second ? cs[1] : cs[0];
            const isCur = !c || c.id === sid();
            const pName = (c && c.name) ? c.name : partnerName();
            const avP = second
                ? (HG.get('avPartner2', '') || (c && c.avatar) || (isCur ? curAvatar('partner') : '') || '')
                : ((isCur ? curAvatar('partner') : '') || (c && c.avatar) || HG.get('avPartner', ''));
            const avM = curAvatar('me') || HG.get('avMe', '');
            const sd0 = second ? HG.get('startDate2', this.startDate()) : this.startDate();
            const d = this.daysOf(sd0);
            const sd = String(sd0).replace(/-/g, '.');
            const bg = WidgetBg.bg(key), op = WidgetBg.op(key);
            return '<div class="hg-card hg-together" data-hgw="' + key + '">'
                + '<div class="hg-bg" style="' + (bg ? "background-image:url('" + bg + "');opacity:" + (op / 100) : '') + '"></div>'
                + '<div class="hg-body">'
                + '<div class="hg-avatars">'
                + '<div class="hg-avwrap"><div class="hg-av" data-hgav="' + (second ? 'partner2' : 'partner') + '">' + (avP ? '<img src="' + esc(avP) + '">' : '<i class="fas fa-user"></i>') + '</div>'
                + '<span class="hg-avname">' + esc(pName) + '</span></div>'
                + '<div class="hg-heart"><svg viewBox="0 0 24 24" width="22" height="22" fill="rgba(255,255,255,.55)" stroke="#8fa8c8" stroke-width="1.6" stroke-linejoin="round"><path d="M12 20.2S4.6 15.4 4.6 9.9A3.9 3.9 0 0 1 12 7.4a3.9 3.9 0 0 1 7.4 2.5c0 5.5-7.4 10.3-7.4 10.3z"/></svg></div>'
                + '<div class="hg-avwrap"><div class="hg-av" data-hgav="me">' + (avM ? '<img src="' + esc(avM) + '">' : '<i class="fas fa-user"></i>') + '</div>'
                + '<span class="hg-avname">' + esc(myName()) + '</span></div>'
                + '</div>'
                + '<div class="hg-days-row"><span class="hg-days-num">' + d + '</span><span class="hg-days-unit">天</span>'
                + '<span class="hg-since" data-hgsince="' + (second ? '2' : '1') + '">' + esc(sd) + ' 起 · 和 ' + esc(pName) + ' 在一起</span></div>'
                + '</div></div>';
        },
        cardQuote(key) {
            key = key || 'quote';
            const cs = contacts();
            const c = (key === 'quote2') ? (cs[1] || {}) : (cs[0] || {});
            const q = Quotes.today(c.id || (key === 'quote2' ? '' : sid()));
            const bg = WidgetBg.bg(key), op = WidgetBg.op(key);
            return '<div class="hg-card hg-quote" data-hgw="' + key + '">'
                + '<div class="hg-bg" style="' + (bg ? "background-image:url('" + bg + "');opacity:" + (op / 100) : '') + '"></div>'
                + '<div class="hg-body">'
                + '<div class="hg-quote-label"><i class="fas fa-heart" style="font-size:9px;"></i> 今日情话</div>'
                + '<div class="hg-quote-text">' + (q && q.text ? esc(q.text) : '还没有情话，去「情话」里写一条') + '</div>'
                + '<div class="hg-quote-from">' + (q && q.by ? esc(q.by) + ' 选的' : '') + '</div>'
                + '</div></div>';
        },
        cardPeriod(key) {
            key = key || 'period';
            const dist = Distance.current();
            const pi = Period.info();
            const bg = WidgetBg.bg(key), op = WidgetBg.op(key);
            return '<div class="hg-card hg-period" data-hgw="' + key + '">'
                + '<div class="hg-bg" style="' + (bg ? "background-image:url('" + bg + "');opacity:" + (op / 100) : '') + '"></div>'
                + '<div class="hg-body">'
                + '<div class="hg-mini"><div class="hg-mini-label">距离</div><div class="hg-mini-val">' + (dist ? esc(dist) : '—') + '</div></div>'
                + '<div class="hg-mini"><div class="hg-mini-label">' + esc(pi.label) + '</div><div class="hg-mini-val ' + (pi.on ? 'on' : '') + '">' + esc(pi.text) + '</div></div>'
                + '</div></div>';
        },
        widgetHTML(w) {
            const heart = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#8fa8c8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.2S4.6 15.4 4.6 9.9A3.9 3.9 0 0 1 12 7.4a3.9 3.9 0 0 1 7.4 2.5c0 5.5-7.4 10.3-7.4 10.3z"/></svg>';
            const ico = {
                chat: '<i class="fas fa-comment-dots"></i>',
                group: '<i class="fas fa-users"></i>',
                game: '<i class="fas fa-gamepad"></i>',
                settings: '<img src="vendor/emoji/1fae7.svg" alt="" style="width:30px;height:30px;">',
                us: '<i class="fas fa-hand-pointer"></i>',
                moments: '<i class="fas fa-images"></i>',
                mode: '<i class="fas fa-circle-half-stroke"></i>',
                anniv: '<i class="fas fa-heart"></i>',
                mood: '<i class="fas fa-book-open"></i>',
                replies: '<i class="fas fa-comment-dots"></i>',
                letter: '<i class="fas fa-envelope"></i>',
                test: '<i class="fas fa-vial"></i>',
                mute: '<i class="fas fa-volume-xmark"></i>',
                wallet: '<i class="fas fa-wallet"></i>',
                mood1: '<i class="fas fa-face-smile"></i>',
                mood2: '<i class="fas fa-face-smile"></i>'
            }[w.k] || '<i class="fas fa-star"></i>';
            const bg = WidgetBg.bg(w.k), op = WidgetBg.op(w.k);
            // 音乐组件：直接上一首 / 暂停 / 下一首，不进面板
            if (w.k === 'music') {
                /* v23-5：只显示「音乐」，下面不再挂「一起听」或任何说明文字 */
                return '<div class="hg-widget hg-music" data-hgwidget="music">'
                    + '<span class="hg-widget-tile">'
                    + '<span class="hg-tile-bg" style="' + (bg ? "background-image:url('" + bg + "');opacity:" + (op / 100) : '') + '"></span>'
                    + '<span class="hg-music-ctrls">'
                    + '<button data-hx-music="prev"><i class="fas fa-backward-step"></i></button>'
                    + '<button data-hx-music="toggle"><i class="fas fa-play"></i></button>'
                    + '<button data-hx-music="next"><i class="fas fa-forward-step"></i></button>'
                    + '</span></span>'
                    + '<span class="hg-widget-label">音乐</span></div>';
            }
            let sub = '';
            let moodEmoji = '';
            const pendN = (w.k === 'us' && W.V8 && W.V8.Consent) ? W.V8.Consent.pending().length : 0;
            if (w.k === 'mood1' || w.k === 'mood2') {
                const M = W.V8 && W.V8.Mood;
                try { if (M) M.meMood(); } catch (e) {}   /* 顺带清洗旧数据 */
                const theirs = M ? M.get(w.cid) : '🥰';
                /* v15：主页1 只显示第一位自己选的那一个，主页2 只显示第二位自己选的那一个 */
                moodEmoji = '<span class="hg-mood-pair">' + (M ? M.html(theirs) : esc(theirs)) + '</span>';
                sub = (M ? M.who(w.cid) : '') || '';
            }
            let labelHTML;
            if (w.k === 'mood1' || w.k === 'mood2') {
                /* v22-5：去掉「心情」下面的文字说明；v23-12：文字「心情」改为「🌧️」 */
                labelHTML = '<span class="hg-emoji-label">🌧️</span>';
            } else if (w.k === 'mood') {
                /* v23-12：「心情手账」文字改为「🤍」；
                   白心 emoji 在部分系统缺字形，这里用同款白心 SVG（灰描边）保证任何设备都看得清 */
                labelHTML = '<span class="hg-emoji-label hg-emoji-svg" data-emoji="🤍">'
                    + '<svg viewBox="0 0 24 24" width="15" height="15" aria-label="🤍" role="img">'
                    + '<path d="M12 20.4c-.3 0-6.6-4.2-8.6-7.6C1.7 9.5 3.1 5.9 6.4 5.1c2-.5 4 .4 5.6 2.1 1.6-1.7 3.6-2.6 5.6-2.1 3.3.8 4.7 4.4 3 7.7-2 3.4-8.3 7.6-8.6 7.6z" fill="#ffffff" stroke="#8b95a6" stroke-width="1.7" stroke-linejoin="round"/>'
                    + '</svg></span>';
            } else {
                labelHTML = esc(w.name);
            }
            return '<button class="hg-widget" data-hgopen="' + w.k + '">'
                + '<span class="hg-widget-tile">'
                + '<span class="hg-tile-bg" style="' + (bg ? "background-image:url('" + bg + "');opacity:" + (op / 100) : '') + '"></span>'
                + '<span class="hg-tile-ico">' + (moodEmoji ? '<span class="hg-mood-emoji">' + moodEmoji + '</span>' : ico) + '</span>'
                + (pendN ? '<span class="hg-badge">' + (pendN > 9 ? '9+' : pendN) + '</span>' : '')
                + '</span>'
                + '<span class="hg-widget-label">' + labelHTML + '</span></button>';
        },
        render() {
            this.build();
            const t1 = $('hg-card-together'), q1 = $('hg-card-quote'), p1 = $('hg-card-period');
            const t2 = $('hg-card-together2'), q2 = $('hg-card-quote2'), p2 = $('hg-card-period2');
            if (t1) t1.innerHTML = this.cardTogether('together');
            if (q1) q1.innerHTML = this.cardQuote('quote');
            if (p1) p1.innerHTML = this.cardPeriod('period');
            if (t2) t2.innerHTML = this.cardTogether('together2');
            if (q2) q2.innerHTML = this.cardQuote('quote2');
            if (p2) p2.innerHTML = this.cardPeriod('period2');
            const w1 = $('hg-widgets-1'), w2 = $('hg-widgets-2');
            if (w1) w1.innerHTML = widgetList(1).map(w => this.widgetHTML(w)).join('');
            if (w2) w2.innerHTML = widgetList(2).map(w => this.widgetHTML(w)).join('');
            this.bind();
            this.applyBg();
        },
        bind() {
            const el = $('home-screen');
            if (!el) return;
            el.querySelectorAll('[data-hgopen]').forEach(b => {
                b.onclick = () => {
                    const k = b.dataset.hgopen;
                    if (k === 'chat') { Contacts.open(); return; }
                    if (k === 'group') { Groups.open(); return; }
                    if (k === 'game') { Games.open(); return; }
                    if (k === 'settings') {
                        const s = $('settings-modal');
                        if (s && typeof showModal === 'function') showModal(s);
                        return;
                    }
                    if (k === 'mute') { if (W.V8 && W.V8.Mute && W.V8.Mute.homeOpen) W.V8.Mute.homeOpen(); else if (W.V8 && W.V8.Mute) W.V8.Mute.open(); return; }
                    if (k === 'us') { Us.open(); return; }
                    if (k === 'wallet') { Wallet.open(); return; }   /* v22-14 */
                    if (k === 'moments') { openMoments(); return; }
                    if (k === 'mode') { Modes.open(); return; }
                    if (k === 'anniv') { const e = $('anniversary-function'); if (e) e.click(); return; }
                    if (k === 'mood') { const e = $('mood-function'); if (e) e.click(); return; }
                    if (k === 'replies') {
                        const m = $('custom-replies-modal');
                        if (m && typeof showModal === 'function') showModal(m);
                        return;
                    }
                    if (k === 'letter') { const e = $('envelope-function'); if (e) e.click(); return; }
                    if (k === 'mood1' || k === 'mood2') {
                        const cs = contacts();
                        const cid = k === 'mood2' ? ((cs[1] && cs[1].id) || '') : ((cs[0] && cs[0].id) || sid());
                        if (W.V8 && W.V8.Mood) W.V8.Mood.open(cid);
                        else Status.open(cid);
                        return;
                    }
                };
            });
            // 音乐组件：直接控制一起听
            el.querySelectorAll('[data-hx-music]').forEach(b => {
                b.onclick = (e) => {
                    e.stopPropagation();
                    const pl = W.GX && W.GX.Player;
                    if (!pl) { toast('先打开一次「一起听」', 'warning'); return; }
                    const act = b.dataset.hxMusic;
                    const n = (window.GX && window.GX.TRACK_COUNT) || 3;
                    if (act === 'prev') pl.switchTo((pl.idx - 1 + n) % n);
                    else if (act === 'next') pl.switchTo((pl.idx + 1) % n);
                    else pl.toggle();
                    const nm = $('hx-music-name');
                    if (nm) nm.textContent = pl.playing ? '播放中' : '已暂停';
                };
            });
            // 组件头像点击更换
            el.querySelectorAll('[data-hgav]').forEach(av => {
                av.onclick = () => {
                    const who = av.dataset.hgav;
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = async () => {
                        const f = input.files && input.files[0];
                        if (!f) return;
                        try {
                            const url = await shrink(f, 400);
                            if (who === 'partner2') {
                                HG.set('avPartner2', url);
                                const cs = contacts();
                                if (cs[1]) {
                                    cs[1].avatar = url;
                                    localforage.setItem(pref() + 'sessionList', sessionList).catch(() => {});
                                }
                            } else {
                                HG.set(who === 'me' ? 'avMe' : 'avPartner', url);
                                const target = document.querySelector(who === 'me' ? '#my-avatar' : '#partner-avatar');
                                if (target) target.innerHTML = '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
                                try {
                                    await localforage.setItem(pref() + sid() + '_' + (who === 'me' ? 'myAvatar' : 'partnerAvatar'), url);
                                } catch (e) {}
                            }
                            this.render();
                            toast('头像已更换');
                        } catch (e) { toast('这张图片读不了', 'warning'); }
                    };
                    input.click();
                };
            });
            // 长按/点击日期 → 设置起始日
            el.querySelectorAll('[data-hgsince]').forEach(s => {
                s.onclick = (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const is2 = s.dataset.hgsince === '2';
                    const cur = is2 ? HG.get('startDate2', this.startDate()) : this.startDate();
                    makePanel('hx-date-panel', '在一起的起始日',
                        '<div class="hx-sec"><input class="hx-input" type="date" id="hx-date-input" value="' + esc(cur) + '"></div>'
                        + '<div class="hx-sec"><button class="hx-btn primary block" id="hx-date-save">保存</button></div>');
                    const bd = panelBody('hx-date-panel');
                    bd.querySelector('#hx-date-save').onclick = () => {
                        const v = (bd.querySelector('#hx-date-input').value || '').trim();
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { toast('日期格式不对', 'warning'); return; }
                        HG.set(is2 ? 'startDate2' : 'startDate', v);
                        closePanel('hx-date-panel');
                        this.render();
                        toast('已更新');
                    };
                    openPanel('hx-date-panel');
                };
            });
            // 点击情话卡片 → 情话库
            el.querySelectorAll('.hg-quote').forEach(c => {
                c.onclick = () => {
                    const cs = contacts();
                    const is2 = c.dataset.hgw === 'quote2';
                    Quotes.open(is2 ? ((cs[1] || {}).id || '') : ((cs[0] || {}).id || sid()));
                };
            });
            el.querySelectorAll('.hg-period').forEach(c => {
                c.onclick = () => Period.open();
            });
            // 长按/点击日期 → 设置起始日
        },
        show() {
            this.build();
            this.render();
            const el = $('home-screen');
            if (el) { el.style.display = 'flex'; requestAnimationFrame(() => el.classList.add('show')); }
            const fab = $('home-back-fab');
            if (fab) fab.classList.remove('show');
            this.shown = true;
        },
        hide() {
            const el = $('home-screen');
            if (el) {
                el.classList.remove('show');
                setTimeout(() => { if (!el.classList.contains('show')) el.style.display = 'none'; }, 430);
            }
            const fab = $('home-back-fab');
            if (fab) fab.classList.add('show');
            this.shown = false;
        }
    };

    /* v20-8：聊天里的标识改成和朋友圈一样的「←」，返回上一层（不再一键跳主页） */
    function ensureFab() {
        if ($('home-back-fab')) return;
        const b = document.createElement('button');
        b.id = 'home-back-fab';
        b.title = '返回上一层 · 可拖动';
        b.innerHTML = '<i class="fas fa-arrow-left"></i>';
        b.onclick = () => hxBack();
        document.body.appendChild(b);
    }

    /* ============================================================
       12. 设置重组
       ============================================================ */
    const Settings = {
        rebuild() {
            const grid = document.querySelector('.settings-grid');
            if (!grid || grid.dataset.hxDone) return;
            grid.dataset.hxDone = '1';
            // 把原有卡片挪到隐藏容器，保留其事件绑定
            let keep = $('hx-keep');
            if (!keep) {
                keep = document.createElement('div');
                keep.id = 'hx-keep';
                keep.style.display = 'none';
                document.body.appendChild(keep);
            }
            ['appearance-settings', 'chat-settings', 'advanced-settings', 'data-settings'].forEach(id => {
                const el = $(id);
                if (el) keep.appendChild(el);
            });
            grid.classList.add('hx-regrid');
            grid.innerHTML = '';

            // scope: shared = 所有联系人共用；own = 每位联系人各自独立
            const cards = [
                { k: 'theme', ico: 'fa-paint-roller', name: '主题配色', scope: 'shared' },
                { k: 'fontbg', ico: 'fa-font', name: '背景字体', scope: 'shared' },
                { k: 'bubblecss', ico: 'fa-comment', name: '气泡CSS', scope: 'shared' },
                { k: 'wbg', ico: 'fa-image', name: '组件背景', scope: 'shared' },
                { k: 'chat', ico: 'fa-comments', name: '聊天设置', scope: 'own' },
                { k: 'data', ico: 'fa-database', name: '数据管理', scope: 'shared' },
                { k: 'stats', ico: 'fa-chart-bar', name: '消息统计', scope: 'own' },
                { k: 'music', ico: 'fa-music', name: '悬浮音乐播放器', scope: 'shared' },
                { k: 'replies', ico: 'fa-comment-dots', name: '回应', scope: 'shared' }
            ];
            cards.forEach(c => {
                const d = document.createElement('div');
                d.className = 'settings-card';
                d.dataset.hxSet = c.k;
                d.innerHTML = '<i class="fas ' + c.ico + '"></i><span>' + c.name + '</span>'
                    + '<em class="hx-scope ' + c.scope + '">' + (c.scope === 'shared' ? '共用' : '独立') + '</em>';
                d.onclick = () => this.onCard(c.k);
                grid.appendChild(d);
            });
        },
        onCard(k) {
            const hideSet = () => { const s = $('settings-modal'); if (s && typeof hideModal === 'function') hideModal(s); };
            const openAppearance = (panel) => {
                hideSet();
                const a = $('appearance-modal');
                if (a && typeof showModal === 'function') showModal(a);
                setTimeout(() => { try { showAppearancePanel(panel); } catch (e) {} }, 80);
            };
            if (k === 'theme') { openAppearance('theme'); return; }
            if (k === 'fontbg') { openAppearance('font-bg'); return; }
            if (k === 'bubblecss') { openAppearance('bubble-css'); return; }
            if (k === 'avatar') { openAppearance('avatar'); return; }
            if (k === 'wbg') { hideSet(); WidgetBg.open('widget'); return; }
            if (k === 'status') { hideSet(); Status.open(); return; }
            if (k === 'chat') { restoreChatSettingsTitle(); const e = $('chat-settings'); if (e) e.click(); return; }
            if (k === 'data') { const e = $('data-settings'); if (e) e.click(); return; }
            if (k === 'nick') { hideSet(); this.openNick(); return; }
            if (k === 'replies') {
                hideSet();
                const m = $('custom-replies-modal');
                if (m && typeof showModal === 'function') showModal(m);
                return;
            }
            if (k === 'stats') {
                hideSet();
                const m = $('stats-modal');
                if (m && typeof showModal === 'function') showModal(m);
                try { if (typeof switchStatsTab === 'function') switchStatsTab('stats'); } catch (e) {}
                try { if (typeof renderStats === 'function') renderStats(); } catch (e) {}
                return;
            }
            if (k === 'music') {
                hideSet();
                const e = $('music-player-toggle');
                if (e) e.click();
                return;
            }
            if (k === 'mode') { hideSet(); Modes.open(); return; }
        },
        openNick() {
            const n = (sessionList || []).filter(s => s.id === sid())[0] || {};
            makePanel('hx-nick-panel', '昵称',
                '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-user"></i>我的昵称</div>'
                + '<div style="display:flex;gap:8px;"><input class="hx-input" id="hx-nick-me" value="' + esc(myName()) + '" maxlength="12"><button class="hx-btn primary" id="hx-nick-mesave">保存</button></div></div>'
                + '<div class="hx-sec"><div class="hx-sec-title"><i class="fas fa-heart"></i>' + esc(partnerName()) + ' 的昵称</div>'
                + '<div style="display:flex;gap:8px;"><input class="hx-input" id="hx-nick-ta" value="' + esc(n.name || partnerName()) + '" maxlength="12"><button class="hx-btn primary" id="hx-nick-tasave">保存</button></div>'
                + '</div>');
            const body = panelBody('hx-nick-panel');
            body.querySelector('#hx-nick-mesave').onclick = () => {
                const v = (body.querySelector('#hx-nick-me').value || '').trim();
                if (!v) return;
                try {
                    settings.myName = v;
                    if (typeof throttledSaveData === 'function') throttledSaveData();
                    if (typeof updateUI === 'function') updateUI();
                } catch (e) {}
                toast('我的昵称已更新');
                Home.render();
            };
            body.querySelector('#hx-nick-tasave').onclick = () => {
                const v = (body.querySelector('#hx-nick-ta').value || '').trim();
                if (!v) return;
                try {
                    const s = (sessionList || []).filter(x => x.id === sid())[0];
                    if (s) { s.name = v; localforage.setItem(pref() + 'sessionList', sessionList).catch(() => {}); }
                    settings.partnerName = v;
                    if (typeof throttledSaveData === 'function') throttledSaveData();
                    if (typeof updateUI === 'function') updateUI();
                } catch (e) {}
                toast('昵称已更新');
                Home.render();
            };
            openPanel('hx-nick-panel');
        }
    };

    /* ============================================================
       13. 朋友圈增强：评论可互相回复
       ============================================================ */
    function enhanceMoments() {
        try {
            const MF = W.GX && W.GX.MF;
            if (!MF || MF.__hxEnhanced) return;
            MF.__hxEnhanced = true;
            const origComment = MF.comment.bind(MF);
            MF.comment = function (postId, text, replyTo) {
                const f = this.feed.filter(x => x.id === postId)[0];
                if (!f || !text) return;
                const mine = { byId: '__me__', byName: myName() || '我', text: text, ts: Date.now() };
                if (replyTo) mine.replyTo = replyTo;
                f.comments.push(mine);
                this.persist();
                // 被回复的人（或作者）自己决定要不要回
                const targetId = replyTo && replyTo.byId ? replyTo.byId : (f.author !== '__me__' ? f.author : null);
                if (targetId && Math.random() < 0.72) {
                    setTimeout(() => {
                        const p = this.person(targetId);
                        const words = ['嗯，我看到了。', '好，听你的。', '哈哈，也是。', '那就这样。'];
                        f.comments.push({
                            byId: p.id, byName: p.name,
                            text: words[Math.floor(Math.random() * words.length)],
                            replyTo: { byId: '__me__', byName: myName() || '我' }
                        });
                        this.persist();
                        try { if (document.getElementById('love-panel-modal').classList.contains('active')) this.render(); } catch (e) {}
                    }, 2600 + Math.random() * 2600);
                }
            };
        } catch (e) {}
    }

    /* ============================================================
       v21-9：主页里「每一个组件」都能单独设置文字大小 / 组件大小 / 颜色
       入口在「设置」→「背景字体」。也保留 v20 的「全部组件」统一项作为快捷。
       ============================================================ */
    /* 组件清单：卡片用 data-hgw，图标方块用 data-hgopen / data-hgwidget */
    function compList() {
        const out = [
            { k: 'together', n: '主页1 · 在一起的时间' }, { k: 'quote', n: '主页1 · 今日情话' }, { k: 'period', n: '主页1 · 距离经期' },
            { k: 'together2', n: '主页2 · 在一起的时间' }, { k: 'quote2', n: '主页2 · 今日情话' }, { k: 'period2', n: '主页2 · 距离经期' }
        ];
        WIDGETS.forEach(w => out.push({ k: w.k, n: '主页' + w.page + ' · ' + w.name }));
        out.push({ k: 'mood1', n: '主页1 · 心情' }, { k: 'mood2', n: '主页2 · 心情' });
        const seen = {};
        return out.filter(x => x.k && !seen[x.k] && (seen[x.k] = 1));
    }
    const HomeText = {
        /* v20 全局快捷（当作「全部组件」默认值） */
        scale() { const n = Number(HG.get('homeFontScale', 100)); return (isFinite(n) && n >= 60 && n <= 180) ? n : 100; },
        color() { return HG.get('homeTextColor', '') || ''; },
        setScale(n) { HG.set('homeFontScale', Math.max(60, Math.min(180, Number(n) || 100))); this.apply(); },
        setColor(c) { HG.set('homeTextColor', c || ''); this.apply(); },
        /* 逐组件配置 { key: { fs, zoom, color } } */
        all() { const o = HG.get('homeComp', {}); return (o && typeof o === 'object') ? o : {}; },
        per(k) { return this.all()[k] || {}; },
        setPer(k, patch) {
            const a = this.all(); a[k] = Object.assign({ fs: 100, zoom: 100, color: '' }, a[k] || {}, patch);
            HG.set('homeComp', a); this.apply();
        },
        clearPer(k) { const a = this.all(); delete a[k]; HG.set('homeComp', a); this.apply(); },
        clearAll() { HG.set('homeComp', {}); HG.set('homeFontScale', 100); HG.set('homeTextColor', ''); this.apply(); },
        apply() {
            try {
                const root = $('home-screen');
                if (!root) return;
                const gFs = this.scale() / 100, gColor = this.color(), per = this.all();
                root.querySelectorAll('[data-hgw], [data-hgopen], [data-hgwidget]').forEach(comp => {
                    const key = comp.dataset.hgw || comp.dataset.hgopen || comp.dataset.hgwidget;
                    if (!key) return;
                    const p = per[key] || {};
                    const fs = ((p.fs == null ? 100 : Number(p.fs)) / 100) * gFs;
                    const zoom = (p.zoom == null ? 100 : Number(p.zoom)) / 100;
                    const col = p.color || gColor;
                    /* 组件整体大小：默认 100% 时完全不介入，布局一点不变 */
                    if (Math.abs(zoom - 1) > 0.001) comp.style.zoom = String(zoom);
                    else comp.style.removeProperty('zoom');
                    const nodes = [comp].concat(Array.from(comp.querySelectorAll('*')));
                    nodes.forEach(el => {
                        const tag = el.tagName;
                        if (tag === 'I' || tag === 'SVG' || tag === 'PATH' || tag === 'IMG') return;
                        if (el.classList.contains('hg-bg') || el.classList.contains('hg-tile-bg') || el.classList.contains('hg-tile-ico')) return;
                        if (el.dataset.hxFsBase == null) {
                            const px = parseFloat(W.getComputedStyle(el).fontSize);
                            if (!(px > 0)) return;
                            el.dataset.hxFsBase = String(px);
                        }
                        el.style.fontSize = (parseFloat(el.dataset.hxFsBase) * fs) + 'px';
                        if (col) el.style.color = col;
                        else el.style.removeProperty('color');
                    });
                });
            } catch (e) {}
        }
    };

    /* ============================================================
       v20-17：「我们」里私聊 / 群聊背景单独设置
       ============================================================ */
    const ChatBg = {
        get(kind) { return HG.get('chatBg_' + kind, '') || ''; },
        _base: null,          /* 原站自己的聊天背景基线 */
        _own: '',             /* 我们最近一次写进 --chat-bg-image 的值 */
        _baseClass: false,    /* 原站原本是否带 with-background */
        /* 记录原站基线（只在当前值不是我们写的时候刷新），用于切回未设置背景的会话 */
        captureBase() {
            try {
                const cur = document.documentElement.style.getPropertyValue('--chat-bg-image') || '';
                if (this._own && cur === this._own) return;      /* 当前是我们设的，基线不变 */
                this._base = cur;
                this._baseClass = document.body.classList.contains('with-background');
            } catch (e) {}
        },
        set(kind, url) {
            HG.set('chatBg_' + kind, url || '');
            this.apply();
        },
        curKind() {
            try { const s = (sessionList || []).filter(x => x.id === sid())[0]; return (s && s.type === 'group') ? 'group' : 'private'; }
            catch (e) { return 'private'; }
        },
        apply() {
            try {
                this.captureBase();
                const url = this.get(this.curKind());
                const root = document.documentElement;
                if (url) {
                    const v = url.indexOf('url(') === 0 ? url : 'url(' + url + ')';
                    root.style.setProperty('--chat-bg-image', v);
                    document.body.classList.add('with-background');
                    this._own = v;
                } else {
                    /* v21-10：切到没单独设置背景的会话，恢复原站背景，
                       绝不把上一个私聊 / 群聊的背景带过来 */
                    if (this._base) root.style.setProperty('--chat-bg-image', this._base);
                    else root.style.removeProperty('--chat-bg-image');
                    if (this._baseClass) document.body.classList.add('with-background');
                    else document.body.classList.remove('with-background');
                    this._own = '';
                }
            } catch (e) {}
        },
        thumb(k) {
            const u = this.get(k);
            return '<div class="hx-thumb" id="hx-chatbg-thumb-' + k + '" style="aspect-ratio:16/9;'
                + (u ? "background-image:url('" + u + "');background-size:cover;background-position:center;" : '')
                + '">' + (u ? '' : '<span style="font-size:11px;">未设置</span>') + '</div>';
        },
        open() {
            const sec = k =>
                '<div class="hx-sec"><div class="hx-sec-title"><i class="fas ' + (k === 'group' ? 'fa-users' : 'fa-comment') + '"></i>'
                + (k === 'group' ? '群聊背景' : '私聊背景') + '</div>'
                + this.thumb(k)
                + '<div style="display:flex;gap:8px;margin-top:8px;">'
                + '<button class="hx-btn primary" style="flex:1;" data-hx-chatbg-up="' + k + '"><i class="fas fa-upload"></i> 上传</button>'
                + '<button class="hx-btn" data-hx-chatbg-clr="' + k + '">清除</button></div></div>';
            makePanel('hx-chatbg-panel', '聊天背景',
                sec('private') + sec('group')
                + '<div class="hx-sec"><div style="font-size:11px;color:var(--text-secondary);line-height:1.6;">私聊和群聊各用各的背景，切换会话时自动对应；没设置的沿用原来的聊天背景。</div></div>'
                + '<input type="file" id="hx-chatbg-file" accept="image/*" style="display:none;">');
            const bd = panelBody('hx-chatbg-panel');
            const file = bd.querySelector('#hx-chatbg-file');
            let target = 'private';
            bd.querySelectorAll('[data-hx-chatbg-up]').forEach(b => b.onclick = () => { target = b.dataset.hxChatbgUp; file.click(); });
            file.onchange = async e => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                try { this.set(target, await shrink(f, 1200)); toast('背景已更换'); this.open(); }
                catch (err) { toast('这张图片读不了', 'warning'); }
                e.target.value = '';
            };
            bd.querySelectorAll('[data-hx-chatbg-clr]').forEach(b => b.onclick = () => {
                this.set(b.dataset.hxChatbgClr, '');
                toast('已清除');
                this.open();
            });
            openPanel('hx-chatbg-panel');
        }
    };

    /* v20：同意入群后只刷新群聊列表，不跳转、不串其它群的消息 */
    function refreshGroupList() {
        try {
            const m = $('hx-groups-panel');
            if (m && m.classList.contains('on')) Groups.open();
        } catch (e) {}
    }

    /* ============================================================
       14. 启动
       ============================================================ */
    /* v21-9：重置 / 清除某个组件后，重建「逐个调整」区块以同步控件数值 */
    function rebuildHomeTextSec() {
        try { const s = $('hx-home-text-sec'); if (s) s.remove(); } catch (e) {}
        setTimeout(injectAppearanceExtras, 0);
    }
    /* 在外观「背景字体」里补两个入口：字体选择 / 主页背景 */
    function injectAppearanceExtras() {
        const fontPanel = $('appearance-panel-font');
        if (fontPanel && !$('hx-font-entry')) {
            const sec = document.createElement('div');
            sec.className = 'settings-section';
            sec.id = 'hx-font-entry';
            sec.innerHTML = '<div class="settings-section-title"><i class="fas fa-font"></i>字体选择</div>'
                + '<div class="hx-btn block" id="hx-open-fonts" style="padding:11px;font-size:13px;"><i class="fas fa-list"></i> 选择字体 / 用照片生成</div>'
                + '<div style="font-size:11px;color:var(--text-secondary);margin-top:6px;">'
                + (HG.get('fontName', '') ? '当前：' + esc(HG.get('fontName', '')) : '当前：未指定') + '</div>';
            fontPanel.appendChild(sec);
            sec.querySelector('#hx-open-fonts').onclick = () => Fonts.open();
        }
        /* v21-9：主页每一个组件都能单独设置「文字大小 / 组件大小 / 文字颜色」 */
        if (fontPanel && !$('hx-home-text-sec')) {
            const sec = document.createElement('div');
            sec.className = 'settings-section';
            sec.id = 'hx-home-text-sec';
            const sc = HomeText.scale(), c = HomeText.color();
            const row = item => {
                const p = HomeText.per(item.k);
                const fs = p.fs == null ? 100 : Number(p.fs), zm = p.zoom == null ? 100 : Number(p.zoom), col = p.color || '#5b6b81';
                return '<div class="hx-comp-row" data-hxcompk="' + esc(item.k) + '">'
                    + '<div class="hx-comp-name">' + esc(item.n) + '</div>'
                    + '<div class="hx-comp-ctl"><span>文字</span><input type="range" data-hxcf="' + esc(item.k) + '" min="60" max="180" step="5" value="' + fs + '">'
                    + '<em data-hxcfv="' + esc(item.k) + '">' + fs + '%</em></div>'
                    + '<div class="hx-comp-ctl"><span>大小</span><input type="range" data-hxcz="' + esc(item.k) + '" min="70" max="140" step="5" value="' + zm + '">'
                    + '<em data-hxczv="' + esc(item.k) + '">' + zm + '%</em></div>'
                    + '<div class="hx-comp-ctl"><span>颜色</span><input type="color" data-hxcc="' + esc(item.k) + '" value="' + esc(col) + '">'
                    + '<button class="hx-btn" data-hxcx="' + esc(item.k) + '">清除</button></div>'
                    + '</div>';
            };
            sec.innerHTML = '<div class="settings-section-title"><i class="fas fa-text-height"></i>主页组件 · 逐个调整</div>'
                + '<div style="font-size:11px;color:var(--text-secondary);line-height:1.6;margin-bottom:9px;">'
                + '每一个组件都能单独设置文字大小、组件大小、文字颜色；「全部组件」是统一快捷项。</div>'
                + '<div class="hx-comp-all">'
                + '<div class="hx-comp-ctl"><span>全部·文字</span><input type="range" id="hx-home-fs" min="70" max="160" step="5" value="' + sc + '">'
                + '<em id="hx-home-fsv">' + sc + '%</em></div>'
                + '<div class="hx-comp-ctl"><span>全部·颜色</span>'
                + '<input type="color" id="hx-home-tc" value="' + (c || '#5b6b81') + '">'
                + '<button class="hx-btn" id="hx-home-tc-clr">清除</button>'
                + '<button class="hx-btn" id="hx-comp-reset">重置全部</button></div></div>'
                + '<div class="hx-comp-list">' + compList().map(row).join('') + '</div>';
            fontPanel.appendChild(sec);
            const fs = sec.querySelector('#hx-home-fs'), fsv = sec.querySelector('#hx-home-fsv');
            if (fs) fs.oninput = () => { fsv.textContent = fs.value + '%'; HomeText.setScale(fs.value); };
            const tc = sec.querySelector('#hx-home-tc');
            if (tc) tc.oninput = () => HomeText.setColor(tc.value);
            const clr = sec.querySelector('#hx-home-tc-clr');
            if (clr) clr.onclick = () => { HomeText.setColor(''); if (tc) tc.value = '#5b6b81'; };
            const rst = sec.querySelector('#hx-comp-reset');
            if (rst) rst.onclick = () => { HomeText.clearAll(); toast('已重置'); rebuildHomeTextSec(); };
            sec.querySelectorAll('[data-hxcf]').forEach(i => i.oninput = () => {
                const k = i.dataset.hxcf, v = sec.querySelector('[data-hxcfv="' + k + '"]');
                if (v) v.textContent = i.value + '%';
                HomeText.setPer(k, { fs: Number(i.value) });
            });
            sec.querySelectorAll('[data-hxcz]').forEach(i => i.oninput = () => {
                const k = i.dataset.hxcz, v = sec.querySelector('[data-hxczv="' + k + '"]');
                if (v) v.textContent = i.value + '%';
                HomeText.setPer(k, { zoom: Number(i.value) });
            });
            sec.querySelectorAll('[data-hxcc]').forEach(i => i.oninput = () => HomeText.setPer(i.dataset.hxcc, { color: i.value }));
            sec.querySelectorAll('[data-hxcx]').forEach(b => b.onclick = () => { HomeText.clearPer(b.dataset.hxcx); rebuildHomeTextSec(); });
        }
        const bgPanel = $('appearance-panel-background');
        if (bgPanel && !$('hx-homebg-sec')) {
            const sec = document.createElement('div');
            sec.className = 'settings-section';
            sec.id = 'hx-homebg-sec';
            const cur = HG.get('homeBg', '');
            sec.innerHTML = '<div class="settings-section-title"><i class="fas fa-house"></i>主页背景</div>'
                
                + '<div class="hx-thumb" id="hx-homebg-thumb" style="aspect-ratio:16/9;' + (cur ? "background-image:url('" + cur + "');background-size:cover;background-position:center;" : '') + '">'
                + (cur ? '' : '<span style="font-size:11px;">未设置</span>') + '</div>'
                + '<div style="display:flex;gap:8px;margin-top:8px;">'
                + '<button class="hx-btn primary" style="flex:1;" id="hx-homebg-up"><i class="fas fa-upload"></i> 上传主页背景</button>'
                + '<button class="hx-btn" id="hx-homebg-clr">清除</button></div>'
                + '<input type="file" id="hx-homebg-file" accept="image/*" style="display:none;">';
            bgPanel.insertBefore(sec, bgPanel.firstElementChild);
            const file = sec.querySelector('#hx-homebg-file');
            sec.querySelector('#hx-homebg-up').onclick = () => file.click();
            file.onchange = async e => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                try {
                    const url = await shrink(f, 1200);
                    HG.set('homeBg', url);
                    Home.applyBg();
                    toast('主页背景已更换');
                    hideAppearancePanel();
                    showAppearancePanel('background');
                } catch (err) { toast('这张图片读不了', 'warning'); }
                e.target.value = '';
            };
            sec.querySelector('#hx-homebg-clr').onclick = () => {
                HG.set('homeBg', '');
                Home.applyBg();
                toast('已清除主页背景');
                hideAppearancePanel();
                showAppearancePanel('background');
            };
        }
    }

    function initAfterLoad() {
        Modes.apply();
        /* v21-1：只有 HomeExt 字体面板选过字体才由它恢复；否则不要清空，
           用户通过原站「字体」入口换的字体交给同步器从 settings 恢复 */
        const _hxFont = Fonts.get();
        if (_hxFont) Fonts.apply(_hxFont, HG.get('fontName', ''));
        else if (W.HXFontSync) W.HXFontSync();
        ensureFab();
        Home.build();
        Settings.rebuild();
        injectAppearanceExtras();
        enhanceMoments();
        applyChatMode();
        // 单聊第一次进来：由梦角先挑一个距离，保证顶部能看到距离栏
        try { if (!Distance.current() && curSession() && curSession().type !== 'group') Distance.themPick(); } catch (e) {}
        Distance.apply();
        Status.paint();
        Home.render();

        /* v20-16：主页每次重渲染后，重新套用文字大小 / 颜色 */
        try {
            if (Home.render && !W.__hxHomeTextHook) {
                W.__hxHomeTextHook = true;
                const origRender = Home.render;
                Home.render = function () {
                    const r = origRender.apply(this, arguments);
                    try { HomeText.apply(); } catch (e) {}
                    return r;
                };
            }
            HomeText.apply();
        } catch (e) {}
        /* v20-17：切会话 / 回退时，把对应类型的聊天背景套上 */
        try { ChatBg.apply(); } catch (e) {}
        try {
            if (W.HomeExt && W.HomeExt.switchSession && !W.__hxChatBgHook) {
                W.__hxChatBgHook = true;
                const origSS = W.HomeExt.switchSession;
                W.HomeExt.switchSession = function () {
                    const r = origSS.apply(this, arguments);
                    setTimeout(() => { try { ChatBg.apply(); } catch (e) {} }, 80);
                    setTimeout(() => { try { ChatBg.apply(); } catch (e) {} }, 900);
                    return r;
                };
            }
            W.addEventListener('hashchange', () => setTimeout(() => { try { ChatBg.apply(); } catch (e) {} }, 300));
        } catch (e) {}

        // 梦角会自己从状态库里挑（不是我替他选）；也会主动给你选一个，等你同意
        setInterval(() => {
            try {
                const lib = Status.lib();
                if (Math.random() < 0.35 && lib.length) {
                    Status.set('partner', lib[Math.floor(Math.random() * lib.length)]);
                }
                if (Math.random() < 0.16 && lib.length) {
                    const p = HS.get('statusPending', []);
                    if (!p.length) {
                        p.push({ text: lib[Math.floor(Math.random() * lib.length)], ts: Date.now() });
                        HS.set('statusPending', p);
                        toast(partnerName() + ' 想把你状态改成「' + p[0].text + '」，去心情看看');
                    }
                }
                if (Math.random() < 0.22) Distance.themPick();
            } catch (e) {}
        }, 150000);

        const skip = HG.get('skipHome', 0);
        if (skip) { HG.set('skipHome', 0); return; }
        // 等欢迎动画结束再进主页
        setTimeout(() => { if (!Home.shown) Home.show(); }, 1600);
    }

    function boot() {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
        else run();
    }
    function run() {
        // 等核心数据加载完（app.js 里 await loadData 之后）
        let tries = 0;
        const timer = setInterval(() => {
            tries++;
            let ok = false;
            try { ok = !!settings && Object.keys(settings).length > 0 && !!sessionList; } catch (e) {}
            if (ok) {
                clearInterval(timer);
                setTimeout(initAfterLoad, 2600);
            } else if (tries > 60) {
                clearInterval(timer);
                setTimeout(initAfterLoad, 200);
            }
        }, 200);
    }

    /* 对外暴露，便于其他脚本/测试调用 */
    W.HomeExt = {
        Home: Home, Modes: Modes, Fonts: Fonts, WidgetBg: WidgetBg,
        Status: Status, Distance: Distance, Quotes: Quotes, Materials: Materials,
        Games: Games, Contacts: Contacts, Groups: Groups, Us: Us, Wallet: Wallet,
        Status: Status, Distance: Distance, Fonts: Fonts, Materials: Materials,
        Period: Period, Quotes: Quotes, Modes: Modes, Home: Home, Settings: Settings,
        contacts: contacts, myName: myName, partnerName: partnerName, sid: sid,
        HG: HG, HS: HS, esc: esc, toast: toast, shrink: shrink,
        makePanel: makePanel, openPanel: openPanel, closePanel: closePanel, panelBody: panelBody,
        HomeText: HomeText, ChatBg: ChatBg, back: hxBack, refreshGroupList: refreshGroupList,
        switchSession: switchSession, applyChatMode: applyChatMode, applyMode: (m) => Modes.apply(m)
    };

    boot();
})();
