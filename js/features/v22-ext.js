/* ============================================================
   v22 扩展层（纯增量，不动原站）：
   - 需求13 / 6⑦⑨：所有组件全屏 + ← 返回上一层
   - 需求3：朋友圈去掉「关闭」，保留 ←；可移动的「+」发表
   - 需求6 / 11：音乐全屏（歌单 / 链接 / 收听历史 / 联系人歌单 / 邀请 / 迷你悬浮）
   - 需求⑧：主页消息提示条（长条、小字）
   ============================================================ */
(function () {
    'use strict';
    const W = window;
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    const toast = (m, t) => { try { if (typeof showNotification === 'function') showNotification(m, t || 'success'); } catch (e) {} };

    const LS = {
        get(k, d) { try { const v = localStorage.getItem('hx_mu_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem('hx_mu_' + k, JSON.stringify(v)); } catch (e) {} }
    };
    function contacts() { try { return (sessionList || []).filter(s => s.type !== 'group'); } catch (e) { return []; } }
    function nmOf(cid) { const c = (sessionList || []).filter(x => x.id === cid)[0]; return c ? (c.name || '梦角') : '梦角'; }
    function avOf(cid) { const c = (sessionList || []).filter(x => x.id === cid)[0]; return c && c.avatar ? c.avatar : ''; }
    function distOf(cid) { try { return (W.HomeExt && W.HomeExt.Distance && W.HomeExt.Distance.current(cid)) || ''; } catch (e) { return ''; } }
    function avHTML(cid, name) {
        const a = avOf(cid);
        return a ? '<img src="' + esc(a) + '" alt="">' : esc(String(name || '?').slice(0, 1));
    }

    /* ============================================================
       1. 全屏化：组件级弹层铺满全屏 + 左上角 ← 返回
       ============================================================ */
    const FULL_IDS = ['settings-modal', 'love-panel-modal', 'session-modal', 'group-chat-modal',
        'mood-modal', 'anniversary-modal', 'envelope-modal', 'envelope-view-modal',
        'custom-replies-modal', 'theme-editor-modal', 'stats-modal', 'person-modal', 'hub-modal'];

    function ensureBack(m) {
        if (m.id === 'love-panel-modal') return;   /* 内部每个页面已有 ← */
        if (m.querySelector('.v22-fullback')) return;
        const b = document.createElement('button');
        b.className = 'v22-fullback';
        b.type = 'button';
        b.title = '返回上一层';
        b.innerHTML = '<i class="fas fa-arrow-left"></i>';
        b.onclick = ev => {
            ev.stopPropagation();
            try { if (typeof hideModal === 'function') hideModal(m); else m.style.display = 'none'; } catch (e) { m.style.display = 'none'; }
        };
        m.appendChild(b);
    }

    function applyFull(m) {
        if (!m || !m.id || FULL_IDS.indexOf(m.id) < 0) return;
        const on = m.style.display === 'flex' || m.classList.contains('active');
        if (on) { m.classList.add('hx-full'); ensureBack(m); }
        else { m.classList.remove('hx-full'); }
    }

    function watchFull() {
        /* 用轻量轮询代替全站 MutationObserver：只扫 .modal，开销固定且不会拖死主线程 */
        document.querySelectorAll('.modal').forEach(applyFull);
        setInterval(() => { document.querySelectorAll('.modal').forEach(applyFull); }, 300);
    }

    /* ============================================================
       2. 朋友圈：去掉「关闭」，只在朋友圈页隐藏
       ============================================================ */
    function hookLPPick() {
        const LP = W.LoveExt && W.LoveExt.LP;
        if (!LP || LP.__v22pick) return;
        LP.__v22pick = true;
        const _pick = LP.pick.bind(LP);
        LP.pick = function (key) {
            const lc = $('love-panel-close');
            if (lc) lc.style.display = (key === 'moments') ? 'none' : '';
            return _pick(key);
        };
        if (LP.renderGrid) {
            const _grid = LP.renderGrid.bind(LP);
            LP.renderGrid = function () {
                const lc = $('love-panel-close');
                if (lc) lc.style.display = '';
                return _grid();
            };
        }
    }

    /* ============================================================
       3. 音乐：全屏版（歌单 / 链接 / 历史 / 联系人歌单 / 邀请 / 迷你）
       ============================================================ */
    function openMusic() {
        const m = $('love-panel-modal');
        if (m && typeof showModal === 'function') showModal(m);
        setTimeout(() => {
            try { W.LoveExt.LP.pick('listen'); }
            catch (e) { try { W.GX.Player.view(); } catch (e2) {} }
        }, 70);
    }
    W.__v22OpenMusic = openMusic;

    function seedCpl(ps) {
        const out = {};
        const names = [['深夜循环', '通勤路上'], ['安静一点', '睡前歌单']];
        const T = (W.GX && W.GX.TRACKS) || [];
        ps.forEach((c, ci) => {
            const pool = names[ci % names.length];
            out[c.id] = [
                { name: pool[0], tracks: T.slice(0, 2).map(t => ({ name: t.name, url: '' })) },
                { name: pool[1], tracks: T.slice(1, 3).map(t => ({ name: t.name, url: '' })) }
            ];
        });
        return out;
    }

    function setupPlayer() {
        const G = W.GX;
        if (!G || !G.Player) return false;
        const P = G.Player;
        if (P.__v22) return true;
        P.__v22 = true;

        P.history = LS.get('history', []);
        P.playlists = LS.get('playlists', []);
        P.invited = LS.get('invited', []);
        P.cpl = LS.get('cpl', null);
        P.listenStart = 0;
        P.listenTimer = null;

        P.addHistory = function (name, url) {
            if (!name) return;
            const h = this.history.filter(x => x.name !== name);
            h.unshift({ name: name, url: url || '', ts: Date.now() });
            this.history = h.slice(0, 60);
            LS.set('history', this.history);
        };
        P.trackName = function () { return ((G.TRACKS || [])[this.idx] || {}).name || ''; };

        P.playUrl = function (url, name) {
            const a = $('pl-audio');
            if (!a) return;
            try { this.pause(); } catch (e) {}
            a.style.display = '';
            a.src = url;
            a.play().catch(() => toast('这个链接播不了，换一个直链', 'warning'));
            const t = $('pl-title');
            if (t && name) t.textContent = name;
            this.addHistory(name || (url.split('/').pop() || '链接音乐'), url);
        };

        P.playItem = function (tr) {
            if (!tr) return;
            if (tr.url) { this.playUrl(tr.url, tr.name); return; }
            const i = (G.TRACKS || []).findIndex(x => x.name === tr.name);
            if (i >= 0) { this.switchTo(i); this.addHistory(tr.name, ''); }
            else toast('这首没有音频源');
        };

        P.startListenTimer = function () {
            clearInterval(this.listenTimer);
            this.listenTimer = setInterval(() => {
                const sec = (this.playing && this.listenStart) ? Math.floor((Date.now() - this.listenStart) / 1000) : 0;
                const mm = Math.floor(sec / 60), ss = sec % 60;
                const txt = mm ? (mm + ':' + String(ss).padStart(2, '0')) : ('0:' + String(ss).padStart(2, '0'));
                const el = $('v22-listen-time');
                if (el) el.textContent = txt;
                document.querySelectorAll('.v22-tg-time').forEach(x => { x.textContent = txt; });
            }, 1000);
        };

        P.stopAll = function () {
            try { this.pause(); } catch (e) {}
            const a = $('pl-audio');
            if (a) { try { a.pause(); } catch (e) {} }
            this.listenStart = 0;
            const el = $('hx-mini');
            if (el) el.remove();
        };

        P.mini = function () {
            if (!this.playing) {
                const a = $('pl-audio');
                if (!a || a.paused) { const e0 = $('hx-mini'); if (e0) e0.remove(); return; }
            }
            let el = $('hx-mini');
            if (!el) { el = document.createElement('div'); el.id = 'hx-mini'; document.body.appendChild(el); }
            el.innerHTML = '<button class="hx-mini-main" id="hx-mini-main"><i class="fas fa-music"></i>'
                + '<span>' + esc(this.trackName() || '音乐') + '</span></button>'
                + '<button class="hx-mini-btn" id="hx-mini-toggle"><i class="fas ' + (this.playing ? 'fa-pause' : 'fa-play') + '"></i></button>'
                + '<button class="hx-mini-btn" id="hx-mini-x"><i class="fas fa-times"></i></button>';
            el.style.display = '';
            const self = this;
            $('hx-mini-main').onclick = () => openMusic();
            $('hx-mini-toggle').onclick = () => { self.toggle(); setTimeout(() => self.mini(), 80); };
            $('hx-mini-x').onclick = () => { self.stopAll(); };
        };

        P.view = function () {
            const body = $('lp-body');
            if (!body) return Promise.resolve();
            this.renderBuffer(this.idx).catch(() => {});
            const ps = contacts();
            if (!this.cpl) { this.cpl = seedCpl(ps); LS.set('cpl', this.cpl); }
            body.innerHTML = musicTpl(this, ps);
            bindMusic(this, body, ps);
            this.paint();
            this.startListenTimer();
            return Promise.resolve();
        };

        return true;
    }

    function musicTpl(P, ps) {
        const G = W.GX;
        const cur = P.trackName() || '选一首歌';
        const histRows = (P.history || []).map((h, i) =>
            '<div class="v22-mu-row"><i class="fas fa-music"></i><span class="v22-mu-rname">' + esc(h.name) + '</span>'
            + '<button class="v22-mu-mini" data-v22-addhist="' + i + '">加入歌单</button></div>').join('')
            || '<div class="hx-empty">还没有听过，播放后会自动留在这里</div>';

        const plRows = (P.playlists || []).map((p, i) =>
            '<div class="v22-pl"><div class="v22-pl-head"><b>' + esc(p.name) + '</b><span>' + p.tracks.length + ' 首</span>'
            + '<button class="v22-mu-mini" data-v22-delpl="' + i + '"><i class="fas fa-trash"></i></button></div>'
            + '<div class="v22-pl-tracks">' + (p.tracks.length ? p.tracks.map((t, j) =>
                '<button class="v22-pl-track" data-v22-plplay="' + i + '|' + j + '"><i class="fas fa-play"></i>' + esc(t.name) + '</button>').join('')
                : '<span class="v22-mu-empty">空歌单</span>') + '</div></div>').join('')
            || '<div class="hx-empty">还没有歌单，点右上角「新建歌单」</div>';

        const cplRows = ps.map(c => {
            const list = (P.cpl && P.cpl[c.id]) || [];
            if (!list.length) return '';
            return '<div class="v22-cpl"><div class="v22-cpl-head"><span class="v22-av">' + avHTML(c.id, c.name) + '</span>'
                + '<b>' + esc(c.name || '梦角') + '</b><small>' + esc(distOf(c.id) || '') + '</small></div>'
                + list.map((pl, pi) => '<div class="v22-cpl-pl"><span class="v22-cpl-nm">' + esc(pl.name) + '</span>'
                    + '<div class="v22-pl-tracks">' + pl.tracks.map((t, ti) =>
                        '<button class="v22-pl-track" data-v22-cplplay="' + esc(c.id) + '|' + pi + '|' + ti + '"><i class="fas fa-play"></i>' + esc(t.name) + '</button>').join('')
                    + '</div></div>').join('') + '</div>';
        }).join('') || '<div class="hx-empty">联系人还没有歌单</div>';

        const invBtns = ps.map(c =>
            '<button class="v22-inv-item ' + (P.invited.indexOf(c.id) >= 0 ? 'on' : '') + '" data-v22-inv="' + esc(c.id) + '">'
            + '<span class="v22-av">' + avHTML(c.id, c.name) + '</span>'
            + '<span class="v22-inv-nm">' + esc(c.name || '梦角') + '</span>'
            + '<small>' + esc(distOf(c.id) || '') + '</small></button>').join('')
            || '<div class="hx-empty">还没有联系人</div>';

        return ''
            + '<div class="v22-mu-head"><button class="v22-mu-back" data-v22-mu-back><i class="fas fa-arrow-left"></i></button><span>音乐</span></div>'
            + '<div class="v22-mu-player">'
            + '<div class="pl-cover" id="pl-cover"><i class="fas fa-music"></i></div>'
            + '<div class="v22-mu-name" id="pl-title">' + esc(cur) + '</div>'
            + '<div class="v22-mu-sub"><span class="pl-dot"></span> 一起听 · <span id="v22-listen-time">0:00</span></div>'
            + '<div class="pl-bar"><div class="pl-prog" id="pl-prog"></div></div>'
            + '<div class="pl-times"><span id="pl-cur">0:00</span><span>0:16</span></div>'
            + '<div class="pl-ctrl">'
            + '<button class="pl-small" id="pl-prev"><i class="fas fa-backward-step"></i></button>'
            + '<button class="pl-big" id="pl-toggle"><i class="fas fa-' + (P.playing ? 'pause' : 'play') + '"></i></button>'
            + '<button class="pl-small" id="pl-next"><i class="fas fa-forward-step"></i></button>'
            + '</div>'
            + '<div class="pl-vol"><i class="fas fa-volume-low"></i><input type="range" id="pl-vol" min="0" max="1" step="0.01" value="0.6"></div>'
            + '</div>'
            + '<div class="v22-mu-sec"><div class="v22-mu-title"><i class="fas fa-link"></i>粘贴链接获取音乐'
            + '<button class="v22-mu-new" id="v22-newpl"><i class="fas fa-plus"></i> 新建歌单</button></div>'
            + '<div class="v22-mu-url"><input type="url" id="pl-urlin" placeholder="https://…/song.mp3"><button id="pl-urlgo">获取</button></div>'
            + '<audio id="pl-audio" controls style="display:none;width:100%;margin-top:8px;"></audio></div>'
            + '<div class="v22-mu-sec"><div class="v22-mu-title"><i class="fas fa-list"></i>我的歌单</div>' + plRows + '</div>'
            + '<div class="v22-mu-sec"><div class="v22-mu-title"><i class="fas fa-clock-rotate-left"></i>听过的（可加入歌单）</div>' + histRows + '</div>'
            + '<div class="v22-mu-sec"><div class="v22-mu-title"><i class="fas fa-users"></i>联系人的歌单（他们自己建的）</div>' + cplRows + '</div>'
            + '<div class="v22-mu-sec"><div class="v22-mu-title"><i class="fas fa-headphones"></i>邀请一起听</div>'
            + '<div class="v22-inv-list">' + invBtns + '</div>'
            + '<div class="v22-tg-list" id="v22-together"></div></div>';
    }

    function renderInvited(P) {
        const box = $('v22-together');
        if (!box) return;
        const cur = P.trackName() || '未播放';
        box.innerHTML = P.invited.map(cid =>
            '<div class="v22-tg"><span class="v22-av">' + avHTML(cid, nmOf(cid)) + '</span>'
            + '<div class="v22-tg-main"><b>' + esc(nmOf(cid)) + '</b>'
            + '<span>' + esc(cur) + ' · 一起听 <em class="v22-tg-time">0:00</em></span>'
            + '<small>' + esc(distOf(cid) || '') + '</small></div></div>').join('')
            || '<div class="hx-empty">还没有邀请谁</div>';
    }

    function addToPlaylist(P, name, url) {
        if (!P.playlists.length) {
            const nm = prompt('先新建一个歌单，给它起个名字', '我的歌单');
            if (!nm) return;
            P.playlists.push({ name: nm, tracks: [] });
        }
        const opts = P.playlists.map((p, i) => (i + 1) + '. ' + p.name).join('\n');
        const pick = prompt('加入哪个歌单？填序号\n' + opts, '1');
        if (pick == null) return;
        const i = Math.max(0, (parseInt(pick, 10) || 1) - 1);
        const pl = P.playlists[i];
        if (!pl) { toast('没有这个歌单', 'warning'); return; }
        if (pl.tracks.some(t => t.name === name)) { toast('已经在歌单里了'); return; }
        pl.tracks.push({ name: name, url: url || '' });
        LS.set('playlists', P.playlists);
        toast('已加入「' + pl.name + '」');
        P.view();
    }

    function bindMusic(P, body, ps) {
        const G = W.GX;
        const back = body.querySelector('[data-v22-mu-back]');
        if (back) back.onclick = () => { try { W.LoveExt.LP.back(); } catch (e) { if (typeof closeModal === 'function') closeModal('love-panel-modal'); } };

        const tg = body.querySelector('#pl-toggle'); if (tg) tg.onclick = () => { P.toggle(); if (P.playing && !P.listenStart) P.listenStart = Date.now(); setTimeout(() => { P.paint(); const b = body.querySelector('#pl-toggle'); if (b) b.innerHTML = '<i class="fas ' + (P.playing ? 'fa-pause' : 'fa-play') + '"></i>'; }, 40); };
        const pv = body.querySelector('#pl-prev'); if (pv) pv.onclick = () => { P.switchTo((P.idx + G.TRACKS.length - 1) % G.TRACKS.length); P.addHistory(P.trackName(), ''); };
        const nx = body.querySelector('#pl-next'); if (nx) nx.onclick = () => { P.switchTo((P.idx + 1) % G.TRACKS.length); P.addHistory(P.trackName(), ''); };
        const vol = body.querySelector('#pl-vol'); if (vol) vol.oninput = e => P.vol(e.target.value);

        const urlgo = body.querySelector('#pl-urlgo');
        if (urlgo) urlgo.onclick = () => {
            const u = (body.querySelector('#pl-urlin').value || '').trim();
            if (!/^https?:\/\//i.test(u)) { toast('链接要以 http 开头', 'warning'); return; }
            const name = (u.split('/').pop() || '链接音乐').split('?')[0];
            if (!/\.(mp3|ogg|m4a|wav|aac|flac)(\?|$)/i.test(u)) toast('已记入听过的（部分平台需音频直链才能播放）');
            P.playUrl(u, name);
            P.view();
        };

        const newpl = body.querySelector('#v22-newpl');
        if (newpl) newpl.onclick = () => {
            const nm = prompt('新歌单名字', '歌单 ' + (P.playlists.length + 1));
            if (!nm) return;
            P.playlists.push({ name: nm, tracks: [] });
            LS.set('playlists', P.playlists);
            P.view();
        };

        body.querySelectorAll('[data-v22-delpl]').forEach(b => b.onclick = () => {
            const i = Number(b.dataset.v22Delpl);
            const pl = P.playlists[i]; if (!pl) return;
            if (!confirm('删除歌单「' + pl.name + '」？')) return;
            P.playlists.splice(i, 1);
            LS.set('playlists', P.playlists);
            P.view();
        });

        body.querySelectorAll('[data-v22-plplay]').forEach(b => b.onclick = () => {
            const p = b.dataset.v22Plplay.split('|');
            const pl = P.playlists[Number(p[0])]; if (!pl) return;
            P.playItem(pl.tracks[Number(p[1])]);
        });

        body.querySelectorAll('[data-v22-cplplay]').forEach(b => b.onclick = () => {
            const p = b.dataset.v22Cplplay.split('|');
            const list = (P.cpl && P.cpl[p[0]]) || [];
            const pl = list[Number(p[1])]; if (!pl) return;
            P.playItem(pl.tracks[Number(p[2])]);
        });

        body.querySelectorAll('[data-v22-addhist]').forEach(b => b.onclick = () => {
            const h = P.history[Number(b.dataset.v22Addhist)]; if (!h) return;
            addToPlaylist(P, h.name, h.url);
        });

        body.querySelectorAll('[data-v22-inv]').forEach(b => b.onclick = () => {
            const cid = b.dataset.v22Inv;
            const i = P.invited.indexOf(cid);
            if (i >= 0) P.invited.splice(i, 1); else P.invited.push(cid);
            LS.set('invited', P.invited);
            b.classList.toggle('on', P.invited.indexOf(cid) >= 0);
            renderInvited(P);
            if (P.invited.indexOf(cid) >= 0 && !P.playing) { P.play(); P.listenStart = P.listenStart || Date.now(); }
        });

        renderInvited(P);
    }

    function watchPanelClose() {
        const m = $('love-panel-modal');
        if (!m || m.__v22w) return;
        m.__v22w = true;
        let was = m.style.display === 'flex' || m.classList.contains('active');
        setInterval(() => {
            const on = m.style.display === 'flex' || m.classList.contains('active');
            if (was && !on && W.GX && W.GX.Player && W.GX.Player.playing) W.GX.Player.mini();
            if (on) { const el = $('hx-mini'); if (el) el.remove(); }
            was = on;
        }, 350);
    }

    /* ============================================================
       4. 主页消息提示条：v24 按需求删掉白色提示条，只保留原站黑色提醒框
       ============================================================ */

    /* ============================================================
       5. 启动（等待原站模块就绪）
       ============================================================ */
    let booted = false;
    function boot() {
        if (booted) return;
        if (!W.GX || !W.HomeExt || !W.LoveExt) return;
        booted = true;
        setupPlayer();
        watchFull();
        hookLPPick();
        watchPanelClose();
        /* v24-2：白色主页提示条已删除，这里不再初始化 */

        /* 主页「音乐」块：点空白处进全屏音乐（三个控制键已 stopPropagation） */
        document.addEventListener('click', e => {
            const mu = e.target.closest && e.target.closest('.hg-music');
            if (mu && !e.target.closest('[data-hx-music]')) openMusic();
        }, true);

        /* 兜底：如果 LoveExt 后到，再挂一次 */
        setTimeout(() => { hookLPPick(); }, 1200);
    }
    const t = setInterval(() => { boot(); if (booted) clearInterval(t); }, 200);
    setTimeout(() => { boot(); }, 1500);
    if (document.readyState === 'complete') setTimeout(boot, 300);
})();
