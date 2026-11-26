/* ============================================================
   final-ext.js —— 最终版四项改造
   1) 决定：问题 + 选项（可增删）/ 多题 / 不给选项直接回答 / 双向（梦角也能出题给我）
   2) 分享：微信式可点击卡片，按链接识别歌曲 / 小红书 / 视频 / 文章
   3) 一起听：听过的保留（历史可重听）+ 梦角也能点歌发给我
   4) 后台消息推送：见 data.js / app.js 的修复
   原则：主界面布局、其余面板与功能一律不变；所有内容仍在原有弹层与聊天卡片内。
   ============================================================ */
(function () {
    'use strict';

    const W = window;
    const P = () => { try { return APP_PREFIX || 'CHAT_APP_V3_'; } catch (e) { return 'CHAT_APP_V3_'; } };
    const sid = () => { try { return SESSION_ID || null; } catch (e) { return null; } };
    const K = b => P() + (sid() || '0') + '_' + b;
    const lf = (k, d) => localforage.getItem(k).then(v => (v === null || v === undefined) ? d : v).catch(() => d);
    const ls = (k, v) => localforage.setItem(k, v).catch(() => {});
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, t) => { try { if (typeof showNotification === 'function') showNotification(m, t || 'success'); } catch (e) {} };
    const save = () => { try { if (typeof throttledSaveData === 'function') throttledSaveData(); else if (typeof saveData === 'function') saveData(); } catch (e) {} };
    const partnerName = () => { try { return (settings && settings.partnerName) || '梦角'; } catch (e) { return '梦角'; } };
    const myName = () => { try { return (settings && settings.myName) || '我'; } catch (e) { return '我'; } };
    const now = () => Date.now();
    const rand = (a, b) => a + Math.random() * (b - a);
    const delay = () => rand(3000, 7000);
    const openModal = id => { const el = document.getElementById(id); if (!el) return; try { showModal(el); } catch (e) { el.classList.add('active'); } };
    const closeModal = id => { const el = document.getElementById(id); if (!el) return; try { hideModal(el); } catch (e) { el.classList.remove('active'); } };
    const bodyEl = () => document.getElementById('lp-body');

    /* ---------- 收件人（沿用原有「群聊可选收件人」逻辑） ---------- */
    function recipients() {
        const out = [];
        try {
            const inGroup = (sessionList || []).some(s => s.id === SESSION_ID && s.type === 'group');
            if (inGroup && typeof groupChatSettings !== 'undefined' && groupChatSettings.members) {
                groupChatSettings.members.forEach(m => out.push({ id: m.id, name: m.name }));
            }
        } catch (e) {}
        if (!out.length) {
            try { (sessionList || []).filter(s => s.type !== 'group').forEach(s => out.push({ id: s.id, name: s.name })); } catch (e) {}
        }
        return out;
    }
    function whoRow(title) {
        const list = recipients();
        if (list.length <= 1) return '';
        return '<label>' + esc(title || '发给谁') + '</label><select id="lp-to" class="lp-select">'
            + list.map((r, i) => '<option value="' + i + '">' + esc(r.name) + '</option>').join('') + '</select>';
    }
    function whoPicked() {
        const sel = document.getElementById('lp-to');
        const list = recipients();
        if (!sel || !list.length) return { name: partnerName(), id: null };
        return list[Number(sel.value)] || list[0];
    }

    /* ---------- 聊天卡片：写入 / 更新 / 标记系统消息容器 ---------- */
    function addCardMsg(html, sender) {
        const id = 'fx-' + now() + '-' + Math.floor(Math.random() * 1000);
        try {
            addMessage({ id: id, sender: sender || 'me', type: 'system', text: html, timestamp: new Date() });
            save();
        } catch (e) {}
        setTimeout(tagSysCards, 0);
        setTimeout(tagSysCards, 120);
        return id;
    }
    function updateCardMsg(id, html) {
        let ok = false;
        try {
            const m = (messages || []).filter(x => String(x.id) === String(id))[0];
            if (m) {
                m.text = html;
                if (typeof renderMessages === 'function') renderMessages(true);
                save();
                ok = true;
            }
        } catch (e) {}
        setTimeout(tagSysCards, 0);
        setTimeout(tagSysCards, 120);
        return ok;
    }
    function tagSysCards() {
        try {
            document.querySelectorAll('.system-message').forEach(el => {
                if (el.querySelector('.fx-card, .fx-share-card, .fx-listen-card')) el.classList.add('fx-sys');
            });
        } catch (e) {}
    }
    function partnerSays(text) {
        try {
            addMessage({ id: 'fxr-' + now() + '-' + Math.floor(Math.random() * 1000), sender: partnerName(), type: 'normal', text: text, timestamp: new Date() });
            save();
        } catch (e) {}
    }

    /* ============================================================
       一、决定
       ============================================================ */
    const OPEN_ANSWERS = [
        '我想了想，都听你的。',
        '就按你心里的那个答案来吧。',
        '其实我没什么偏好，你开心就好。',
        '我选第一个冒出来的念头：好呀。',
        '这个问题我想多留一会儿再答，先这样？',
        '都可以，只要是你。'
    ];
    const INCOMING_BANK = [
        { q: '今晚吃什么？', options: ['火锅', '煮面', '点外卖'] },
        { q: '周末想怎么过？', options: ['出去走走', '窝着看剧', '一起做饭'] },
        { q: '下次见面，先做什么？', options: ['抱一下', '去吃东西', '散个步'] },
        { q: '我今天的头像好看吗？', options: ['好看', '换一个吧', '都行'] },
        { q: '如果只能选一句，你现在最想听我说什么？', options: [] },
        { q: '跟我说说今天最开心的一件小事？', options: [] },
        { q: '你猜我现在在想什么？', options: [] },
        { q: '下一首一起听哪首？', options: ['晚风 · 八音盒', '晴天 · 小调', '月光 · 慢板'] }
    ];

    const Decide = {
        cards: {},
        async load() {
            const d = await lf(K('decideCards'), null);
            this.cards = (d && typeof d === 'object') ? d : {};
            // 只保留最近 60 张，避免无限膨胀
            const keys = Object.keys(this.cards);
            if (keys.length > 60) {
                keys.sort((a, b) => (this.cards[a].ts || 0) - (this.cards[b].ts || 0));
                keys.slice(0, keys.length - 60).forEach(k => delete this.cards[k]);
                this.persist();
            }
        },
        persist() { ls(K('decideCards'), this.cards); },

        /* ---------- 面板 ---------- */
        view() {
            const body = bodyEl();
            if (!body) return;
            body.innerHTML =
                '<div class="lp-head"><button class="lp-back" data-lp-back><i class="fas fa-arrow-left"></i></button><span>决定</span></div>'
                + '<div class="fx-tabs">'
                +   '<button class="fx-tab on" data-fx-dtab="ask">我出题 · 让 TA 决定</button>'
                +   '<button class="fx-tab" data-fx-dtab="invite">让 TA 出题 · 我来答</button>'
                + '</div>'
                + '<div class="fx-pane" id="fx-pane-ask">'
                +   '<div class="fx-hint">写「问题」，给「选项 1、2…」（都能新增、删减）；也可以一个选项都不给，让 TA 直接回答。一次可以出好几道题。</div>'
                +   '<div id="fx-qs"></div>'
                +   '<button class="fx-ghost" id="fx-addq"><i class="fas fa-plus"></i> 新增问题</button>'
                +   whoRow('让谁决定')
                +   '<button class="modal-btn modal-btn-primary fx-send" id="fx-send"><i class="fas fa-dice"></i> 交给 TA 决定</button>'
                + '</div>'
                + '<div class="fx-pane" id="fx-pane-invite" style="display:none;">'
                +   '<div class="fx-hint">点一下，TA 过几秒就会把题发到聊天里，你来选选项，或者直接写下回答。TA 偶尔也会自己主动出题给你。</div>'
                +   '<button class="modal-btn modal-btn-primary fx-send" id="fx-askme"><i class="fas fa-wand-magic-sparkles"></i> 让 TA 出一道题给我</button>'
                +   '<div class="fx-inbox-title">最近收到的题</div>'
                +   '<div id="fx-inbox"></div>'
                + '</div>';
            this.addQuestion();
            this.renderInbox();
        },
        qBlock(i) {
            return '<div class="fx-q" data-q="' + i + '">'
                + '<div class="fx-qhead"><b>问题 ' + (i + 1) + '</b><button class="fx-mini" data-fx-delq title="删掉这道题">删除</button></div>'
                + '<input class="fx-qtext fx-input" placeholder="问题，比如：今晚吃什么？" maxlength="60">'
                + '<div class="fx-opts">'
                +   this.optRow('选项 1')
                +   this.optRow('选项 2')
                + '</div>'
                + '<div class="fx-qbar">'
                +   '<button class="fx-mini" data-fx-addopt><i class="fas fa-plus"></i> 加选项</button>'
                +   '<label class="fx-open"><input type="checkbox" class="fx-openbox"> 不给选项，让 TA 直接回答</label>'
                + '</div>'
                + '</div>';
        },
        optRow(ph) {
            return '<div class="fx-opt"><span class="fx-onum"></span>'
                + '<input class="fx-opttext fx-input" placeholder="' + esc(ph) + '" maxlength="40">'
                + '<button class="fx-mini fx-opt-del" data-fx-delopt title="删掉这个选项">×</button></div>';
        },
        addQuestion() {
            const box = document.getElementById('fx-qs');
            if (!box) return;
            box.insertAdjacentHTML('beforeend', this.qBlock(box.children.length));
            this.renumber();
        },
        renumber() {
            const box = document.getElementById('fx-qs');
            if (!box) return;
            Array.prototype.forEach.call(box.children, (q, qi) => {
                q.dataset.q = qi;
                const h = q.querySelector('.fx-qhead b');
                if (h) h.textContent = '问题 ' + (qi + 1);
                q.querySelectorAll('.fx-opt').forEach((o, oi) => {
                    const n = o.querySelector('.fx-onum');
                    if (n) n.textContent = String(oi + 1);
                });
            });
        },
        collect() {
            const box = document.getElementById('fx-qs');
            if (!box) return [];
            const qs = [];
            Array.prototype.forEach.call(box.children, q => {
                const text = (q.querySelector('.fx-qtext').value || '').trim();
                const open = !!q.querySelector('.fx-openbox').checked;
                const opts = open ? [] : Array.prototype.map.call(q.querySelectorAll('.fx-opttext'), i => (i.value || '').trim()).filter(Boolean);
                if (text) qs.push({ q: text, options: opts, open: open || opts.length === 0 });
            });
            return qs;
        },
        send() {
            const qs = this.collect();
            if (!qs.length) { toast('先写一道题吧', 'warning'); return; }
            const to = whoPicked().name;
            const c = {
                id: 'dc' + now() + Math.floor(Math.random() * 1000),
                from: 'me', to: to, questions: qs, answers: [],
                state: 'waiting', ts: now()
            };
            this.cards[c.id] = c;
            this.persist();
            const mid = addCardMsg(this.html(c), 'me');
            c.mid = mid;
            this.persist();
            closeModal('love-panel-modal');
            toast('已交给 ' + to + '，等 TA 决定');
            setTimeout(() => this.autoAnswer(c.id), delay());
        },
        incoming() {
            // 梦角出题给我：1~2 道，可能带选项也可能开放式
            const shuffled = INCOMING_BANK.slice().sort(() => Math.random() - 0.5);
            const qs = shuffled.slice(0, Math.random() < 0.4 ? 2 : 1).map(x => ({ q: x.q, options: x.options.slice(), open: x.options.length === 0 }));
            const c = {
                id: 'dc' + now() + Math.floor(Math.random() * 1000),
                from: 'partner', to: myName(), questions: qs, answers: [],
                state: 'waiting', ts: now()
            };
            this.cards[c.id] = c;
            const mid = addCardMsg(this.html(c), 'partner');
            c.mid = mid;
            this.persist();
            tagSysCards();
            return c;
        },
        renderInbox() {
            const box = document.getElementById('fx-inbox');
            if (!box) return;
            const list = Object.values(this.cards).filter(c => c.from === 'partner').sort((a, b) => b.ts - a.ts).slice(0, 5);
            if (!list.length) { box.innerHTML = '<div class="fx-empty">还没有收到题</div>'; return; }
            box.innerHTML = list.map(c =>
                '<div class="fx-inbox-row" data-fx-jump="' + esc(c.id) + '"><i class="fas fa-dice"></i><span>' + esc(c.questions[0].q) + '</span><small>' + (c.state === 'answered' ? '已答' : '等你答') + '</small></div>'
            ).join('');
        },
        html(c) {
            let h = '<div class="fx-card fx-decide" data-fx-card="' + esc(c.id) + '">';
            h += '<div class="fx-chead"><i class="fas fa-dice"></i> ' + (c.from === 'me' ? '我出了一道题' : esc(partnerName()) + ' 出了一道题')
                + '<small>' + (c.from === 'me' ? '给 ' + esc(c.to) : '给 ' + esc(c.to)) + '</small></div>';
            c.questions.forEach((q, qi) => {
                const ans = (c.answers || []).filter(a => a.qi === qi)[0];
                h += '<div class="fx-qitem"><div class="fx-qt">' + (qi + 1) + '. ' + esc(q.q) + '</div>';
                if (ans) {
                    h += '<div class="fx-ans"><i class="fas fa-check"></i> ' + esc(ans.by) + '：' + esc(ans.value) + '</div>';
                } else if (c.from === 'partner') {
                    if (q.options && q.options.length) {
                        h += '<div class="fx-optbtn">' + q.options.map((o, oi) =>
                            '<button data-fx-pick="' + qi + ':' + oi + '" data-fx-cid="' + esc(c.id) + '">' + esc(o) + '</button>'
                        ).join('') + '</div>';
                        h += '<div class="fx-or">或者直接回答</div>';
                    }
                    h += '<div class="fx-answerbox">'
                        + '<input class="fx-input" data-fx-answer="' + qi + '" data-fx-cid="' + esc(c.id) + '" placeholder="写下你的回答…" maxlength="80">'
                        + '<button data-fx-answersend="' + qi + '" data-fx-cid="' + esc(c.id) + '">发送</button></div>';
                } else {
                    // 我出的题：把我给的选项也列出来（只读），否则发出后看不到问了什么
                    if (q.options && q.options.length) {
                        h += '<div class="fx-opts-read">' + q.options.map(o => '<span>' + esc(o) + '</span>').join('') + '</div>';
                    }
                    h += '<div class="fx-wait"><i class="fas fa-clock"></i> 等 ' + esc(c.to) + ' 决定…</div>';
                }
                h += '</div>';
            });
            h += '<div class="fx-cfoot">' + (c.state === 'answered' ? '✓ 已答完 · 共 ' + c.questions.length + ' 题' : '共 ' + c.questions.length + ' 题 · 等待中') + '</div>';
            h += '</div>';
            return h;
        },
        answer(cid, qi, value) {
            const c = this.cards[cid];
            if (!c || c.from !== 'partner' || c.state === 'answered') return;
            c.answers = (c.answers || []).filter(a => a.qi !== qi);
            c.answers.push({ qi: qi, by: myName(), value: value });
            if (c.answers.length >= c.questions.length) c.state = 'answered';
            this.persist();
            if (c.mid) updateCardMsg(c.mid, this.html(c));
            else tagSysCards();
            if (c.state === 'answered') {
                const words = ['好，就按你说的。', '我记住了。', '嗯，这个答案我喜欢。', '那就这么定了。'];
                setTimeout(() => partnerSays(words[Math.floor(Math.random() * words.length)]), delay());
            }
            toast('已回答');
            this.renderInbox();
        },
        autoAnswer(cid) {
            const c = this.cards[cid];
            if (!c || c.from !== 'me' || c.state === 'answered') return;
            c.questions.forEach((q, qi) => {
                let v;
                if (q.options && q.options.length) v = q.options[Math.floor(Math.random() * q.options.length)];
                else v = OPEN_ANSWERS[Math.floor(Math.random() * OPEN_ANSWERS.length)];
                c.answers.push({ qi: qi, by: c.to || partnerName(), value: v });
            });
            c.state = 'answered';
            this.persist();
            if (c.mid) updateCardMsg(c.mid, this.html(c));
            setTimeout(() => partnerSays(Math.random() < 0.5 ? '我选好啦，你看看。' : '答完了，听你的。'), 500);
        }
    };

    /* ============================================================
       二、分享：微信式可点击卡片
       ============================================================ */
    const PLATFORMS = {
        netease: { label: '网易云音乐 · 歌曲', short: '歌曲', icon: 'fa-music', cls: 'fx-sh-netease' },
        song: { label: '音乐 · 歌曲', short: '歌曲', icon: 'fa-music', cls: 'fx-sh-song' },
        xhs: { label: '小红书 · 笔记', short: '小红书', icon: 'fa-book-open', cls: 'fx-sh-xhs' },
        video: { label: '视频', short: '视频', icon: 'fa-play', cls: 'fx-sh-video' },
        bili: { label: '哔哩哔哩 · 视频', short: 'B站', icon: 'fa-play', cls: 'fx-sh-bili' },
        douyin: { label: '抖音 · 视频', short: '抖音', icon: 'fa-play', cls: 'fx-sh-douyin' },
        article: { label: '文章', short: '文章', icon: 'fa-newspaper', cls: 'fx-sh-article' },
        wechat: { label: '微信公众号 · 文章', short: '公众号', icon: 'fa-newspaper', cls: 'fx-sh-wechat' },
        link: { label: '网页链接', short: '链接', icon: 'fa-link', cls: 'fx-sh-link' }
    };
    function detect(url) {
        const u = String(url || '').toLowerCase();
        let host = '';
        try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {}
        if (/mp\.weixin\.qq\.com/.test(host)) return { key: 'wechat', host: host };
        if (/music\.163\.com|163\.cn/.test(host)) return { key: 'netease', host: host };
        if (/y\.qq\.com|music\.qq\.com|kugou|kuwo|music\.apple|xiami|spotify/.test(host)) return { key: 'song', host: host };
        if (/xiaohongshu|xhslink|xhs\.link/.test(host)) return { key: 'xhs', host: host };
        if (/bilibili|b23\.tv/.test(host)) return { key: 'bili', host: host };
        if (/douyin|iesdouyin/.test(host)) return { key: 'douyin', host: host };
        if (/zhihu|weibo|toutiao|juejin|medium|sspai/.test(host)) return { key: 'article', host: host };
        if (/\.(mp3|m4a|ogg|wav|flac)(\?|$)/.test(u)) return { key: 'song', host: host };
        if (/\.mp4|video|youtube|v\.qq/.test(u)) return { key: 'video', host: host };
        return { key: 'link', host: host || '网页' };
    }
    const Share = {
        view() {
            const body = bodyEl();
            if (!body) return;
            body.innerHTML =
                '<div class="lp-head"><button class="lp-back" data-lp-back><i class="fas fa-arrow-left"></i></button><span>分享</span></div>'
                + '<div class="lp-form">'
                +   whoRow('分享给谁')
                +   '<label>链接</label>'
                +   '<input class="fx-input" type="url" id="fx-sh-url" placeholder="贴歌曲 / 小红书 / 视频 / 文章链接">'
                +   '<label>标题</label>'
                +   '<input class="fx-input" type="text" id="fx-sh-title" placeholder="留空会自动用平台名" maxlength="50">'
                +   '<label>识别为</label>'
                +   '<select id="fx-sh-type" class="lp-select">'
                +     Object.keys(PLATFORMS).map(k => '<option value="' + k + '">' + esc(PLATFORMS[k].label) + '</option>').join('')
                +   '</select>'
                +   '<div class="fx-preview-label">发出去长这样（发出后可点击打开）</div>'
                +   '<div id="fx-sh-preview" class="fx-preview"></div>'
                +   '<button class="modal-btn modal-btn-primary fx-send" id="fx-sh-send"><i class="fas fa-paper-plane"></i> 分享给 TA</button>'
                + '</div>';
            this.preview(true);
        },
        data(allowAuto) {
            const urlEl = document.getElementById('fx-sh-url');
            const titleEl = document.getElementById('fx-sh-title');
            const typeEl = document.getElementById('fx-sh-type');
            if (!urlEl || !typeEl) return null;
            const url = (urlEl.value || '').trim();
            const det = detect(url);
            if (allowAuto && url && typeEl.dataset.auto !== 'off') typeEl.value = det.key;
            const key = PLATFORMS[typeEl.value] ? typeEl.value : det.key;
            const pf = PLATFORMS[key];
            const title = (titleEl.value || '').trim() || (key === 'xhs' ? '一篇小红书笔记' : key === 'netease' || key === 'song' ? '一首歌' : key === 'bili' || key === 'douyin' || key === 'video' ? '一个视频' : '这个想给你看');
            return { url: url, title: title, key: key, host: det.host, pf: pf };
        },
        cardHtml(d) {
            if (!d.url) return '<div class="fx-preview-empty">贴上链接，这里会出现卡片预览</div>';
            return '<a class="fx-share-card" href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">'
                + '<div class="fx-sh-main">'
                +   '<div class="fx-sh-title">' + esc(d.title) + '</div>'
                +   '<div class="fx-sh-desc">' + esc(d.pf.label) + ' · ' + esc(d.host) + '</div>'
                +   '<div class="fx-sh-cta"><i class="fas fa-arrow-up-right-from-square"></i> 点击打开</div>'
                + '</div>'
                + '<div class="fx-sh-cover ' + d.pf.cls + '"><i class="fas ' + d.pf.icon + '"></i><span>' + esc(d.pf.short) + '</span></div>'
                + '</a>';
        },
        preview(auto) {
            const box = document.getElementById('fx-sh-preview');
            if (!box) return;
            const d = this.data(auto);
            box.innerHTML = d ? this.cardHtml(d) : '';
        },
        send() {
            const d = this.data(false);
            if (!d) return;
            if (!/^https?:\/\//i.test(d.url)) { toast('链接要以 http 开头', 'warning'); return; }
            const to = whoPicked().name;
            const html = '<div class="fx-share-wrap"><div class="fx-share-by">' + esc(myName()) + ' 分享给 ' + esc(to) + '</div>' + this.cardHtml(d) + '</div>';
            addCardMsg(html, 'me');
            closeModal('love-panel-modal');
            toast('已分享');
            setTimeout(() => {
                const words = ['我看完了，挺有意思的。', '收到啦，我点进去看看。', '这个我喜欢，谢谢你。', '刚好也想给你看这个。'];
                partnerSays(words[Math.floor(Math.random() * words.length)]);
            }, delay());
        }
    };

    /* ============================================================
       三、一起听：历史 + 梦角点歌
       ============================================================ */
    const TRACK_NAMES = ['晚风 · 八音盒', '晴天 · 小调', '月光 · 慢板'];
    const Listen = {
        hist: [],
        async load() {
            const d = await lf(K('listenHistory'), null);
            this.hist = Array.isArray(d) ? d : [];
        },
        persist() { ls(K('listenHistory'), this.hist); },
        add(item) {
            const key = item.type + '|' + (item.name || '') + '|' + (item.url || '');
            this.hist = this.hist.filter(h => (h.type + '|' + (h.name || '') + '|' + (h.url || '')) !== key);
            this.hist.unshift(Object.assign({ ts: now() }, item));
            this.hist = this.hist.slice(0, 20);
            this.persist();
            this.renderHist();
        },
        renderHist() {
            const box = document.getElementById('fx-lh-list');
            if (!box) return;
            if (!this.hist.length) { box.innerHTML = '<div class="fx-empty">还没有一起听过，播放后会自动留在这里</div>'; return; }
            box.innerHTML = this.hist.map((h, i) =>
                '<div class="fx-lh-row" data-fx-lhist="' + i + '">'
                + '<i class="fas ' + (h.type === 'url' ? 'fa-link' : 'fa-music') + '"></i>'
                + '<span>' + esc(h.name || '未命名') + '</span>'
                + '<small>' + esc(h.type === 'url' ? '直链' : '内置') + '</small>'
                + '<i class="fas fa-play fx-lh-play"></i></div>'
            ).join('');
        },
        extraHtml() {
            return '<div class="fx-lh-invite"><button class="fx-ghost fx-askbtn" id="fx-lh-askme"><i class="fas fa-compact-disc"></i> 让 TA 点一首送给我</button></div>'
                + '<div class="fx-lh"><div class="fx-lh-title"><i class="fas fa-clock-rotate-left"></i> 最近一起听 <small>听过的都留着，点一下就能再听</small></div>'
                + '<div id="fx-lh-list"></div></div>';
        },
        async view() {
            const body = bodyEl();
            if (!body) return;
            // 原播放器（布局与播放能力完全保留）
            try {
                const P = W.GX && W.GX.Player;
                if (P && typeof P.view === 'function') await P.view();
                else throw new Error('no player');
            } catch (e) {
                body.innerHTML = '<div class="lp-head"><button class="lp-back" data-lp-back><i class="fas fa-arrow-left"></i></button><span>一起听</span></div>'
                    + '<div class="fx-hint">播放器暂时没准备好，关掉面板再打开一次就好。</div>';
            }
            const b = bodyEl();
            if (!b) return;
            b.insertAdjacentHTML('beforeend', this.extraHtml());
            this.renderHist();
            this.bindPlayerExtras();
            const ask = document.getElementById('fx-lh-askme');
            if (ask) ask.onclick = () => { this.incoming(); toast('等 TA 点一首给你'); };
        },
        bindPlayerExtras() {
            const b = bodyEl();
            if (!b) return;
            const P = W.GX && W.GX.Player;
            const recordBuiltin = (idx) => {
                const i = (typeof idx === 'number') ? idx : (P ? P.idx : 0);
                this.add({ type: 'builtin', idx: i, name: TRACK_NAMES[i] || TRACK_NAMES[0] });
            };
            ['pl-toggle', 'pl-invite'].forEach(id => {
                const el = b.querySelector('#' + id);
                if (el) el.addEventListener('click', () => setTimeout(() => recordBuiltin(), 60));
            });
            ['pl-prev', 'pl-next'].forEach(id => {
                const el = b.querySelector('#' + id);
                if (el) el.addEventListener('click', () => setTimeout(() => recordBuiltin(), 120));
            });
            b.querySelectorAll('.pl-row').forEach(r => r.addEventListener('click', () => setTimeout(() => recordBuiltin(Number(r.dataset.plTrack)), 60)));
            const ug = b.querySelector('#pl-urlgo');
            if (ug) ug.addEventListener('click', () => {
                const u = (b.querySelector('#pl-urlin').value || '').trim();
                if (u) this.add({ type: 'url', name: u.split('/').pop().split('?')[0] || '音频直链', url: u });
            });
        },
        playHistory(i) {
            const h = this.hist[i];
            if (!h) return;
            const P = W.GX && W.GX.Player;
            if (!P) return;
            if (h.type === 'builtin') {
                const b = bodyEl();
                // 面板若没打开，先打开
                if (!b || !b.querySelector('#pl-toggle')) { openModal('love-panel-modal'); const LP = W.LoveExt && W.LoveExt.LP; if (LP && LP.pick) LP.pick('listen'); }
                setTimeout(() => {
                    try { P.switchTo(h.idx || 0); P.play(); } catch (e) {}
                    this.add({ type: 'builtin', idx: h.idx || 0, name: h.name });
                }, 260);
            } else {
                if (!bodyEl() || !document.getElementById('pl-urlin')) { openModal('love-panel-modal'); const LP = W.LoveExt && W.LoveExt.LP; if (LP && LP.pick) LP.pick('listen'); }
                setTimeout(() => {
                    const inp = document.getElementById('pl-urlin');
                    const go = document.getElementById('pl-urlgo');
                    if (inp && go) { inp.value = h.url; go.click(); }
                }, 280);
            }
            toast('一起听 · ' + (h.name || ''));
        },
        incoming() {
            const idx = Math.floor(Math.random() * TRACK_NAMES.length);
            const name = TRACK_NAMES[idx];
            const html = '<div class="fx-card fx-listen-card">'
                + '<div class="fx-chead"><i class="fas fa-headphones"></i> ' + esc(partnerName()) + ' 点了一首歌给你<small>一起听</small></div>'
                + '<div class="fx-listen-body"><div class="fx-listen-cover"><i class="fas fa-compact-disc"></i></div>'
                + '<div><div class="fx-listen-name">' + esc(name) + '</div><div class="fx-listen-sub">戴上耳机，一起听这一首</div></div></div>'
                + '<button class="fx-listen-btn" data-fx-listenopen="' + idx + '"><i class="fas fa-play"></i> 一起听</button>'
                + '</div>';
            addCardMsg(html, 'partner');
            tagSysCards();
            // 记入历史（他点给我的也算一起听过）
            this.add({ type: 'builtin', idx: idx, name: name });
            setTimeout(() => partnerSays(Math.random() < 0.5 ? '这首想和你一起听。' : '戴上耳机了吗？'), delay());
            return idx;
        },
        openFromCard(idx) {
            const i = Number(idx) || 0;
            openModal('love-panel-modal');
            const LP = W.LoveExt && W.LoveExt.LP;
            if (LP && LP.pick) LP.pick('listen');
            setTimeout(() => {
                const P = W.GX && W.GX.Player;
                if (P) { try { P.switchTo(i); P.play(); } catch (e) {} }
                this.add({ type: 'builtin', idx: i, name: TRACK_NAMES[i] || TRACK_NAMES[0] });
            }, 500);
        }
    };

    /* ============================================================
       四、事件委托（表单 + 聊天卡片）
       ============================================================ */
    function bind() {
        document.addEventListener('click', e => {
            const t = e.target;
            if (!t || !t.closest) return;

            /* --- 决定：面板 tab --- */
            const tab = t.closest('[data-fx-dtab]');
            if (tab) {
                const v = tab.dataset.fxDtab;
                document.querySelectorAll('[data-fx-dtab]').forEach(x => x.classList.toggle('on', x === tab));
                const a = document.getElementById('fx-pane-ask');
                const b = document.getElementById('fx-pane-invite');
                if (a) a.style.display = v === 'ask' ? '' : 'none';
                if (b) b.style.display = v === 'invite' ? '' : 'none';
                Decide.renderInbox();
                return;
            }
            const aq = t.closest('#fx-addq');
            if (aq) { Decide.addQuestion(); return; }
            const dq = t.closest('[data-fx-delq]');
            if (dq) {
                const box = document.getElementById('fx-qs');
                const q = dq.closest('.fx-q');
                if (box && q) {
                    if (box.children.length <= 1) { toast('至少留一道题', 'warning'); return; }
                    q.remove(); Decide.renumber();
                }
                return;
            }
            const ao = t.closest('[data-fx-addopt]');
            if (ao) {
                const q = ao.closest('.fx-q');
                if (q) { q.querySelector('.fx-opts').insertAdjacentHTML('beforeend', Decide.optRow('选项')); Decide.renumber(); }
                return;
            }
            const do_ = t.closest('[data-fx-delopt]');
            if (do_) {
                const opt = do_.closest('.fx-opt');
                const q = do_.closest('.fx-q');
                if (opt && q) { opt.remove(); Decide.renumber(); }
                return;
            }
            const sd = t.closest('#fx-send');
            if (sd) { Decide.send(); return; }
            const am = t.closest('#fx-askme');
            if (am) { Decide.incoming(); toast('TA 马上出题给你'); return; }
            const jump = t.closest('[data-fx-jump]');
            if (jump) {
                const c = Decide.cards[jump.dataset.fxJump];
                if (c && c.mid) {
                    closeModal('love-panel-modal');
                    setTimeout(() => {
                        const el = document.querySelector('[data-fx-card="' + c.id + '"]');
                        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 180);
                }
                return;
            }

            /* --- 决定：卡片作答 --- */
            const pick = t.closest('[data-fx-pick]');
            if (pick) {
                const cid = pick.dataset.fxCid;
                const parts = pick.dataset.fxPick.split(':');
                const qi = Number(parts[0]), oi = Number(parts[1]);
                const c = Decide.cards[cid];
                if (c && c.questions[qi] && c.questions[qi].options[oi]) Decide.answer(cid, qi, c.questions[qi].options[oi]);
                return;
            }
            const asend = t.closest('[data-fx-answersend]');
            if (asend) {
                const cid = asend.dataset.fxCid;
                const qi = Number(asend.dataset.fxAnswersend);
                const inp = document.querySelector('[data-fx-answer="' + qi + '"][data-fx-cid="' + cid + '"]');
                const v = inp ? (inp.value || '').trim() : '';
                if (!v) { toast('先写下回答', 'warning'); return; }
                Decide.answer(cid, qi, v);
                return;
            }

            /* --- 分享 --- */
            const ss = t.closest('#fx-sh-send');
            if (ss) { Share.send(); return; }

            /* --- 一起听 --- */
            const lh = t.closest('[data-fx-lhist]');
            if (lh) { Listen.playHistory(Number(lh.dataset.fxLhist)); return; }
            const lo = t.closest('[data-fx-listenopen]');
            if (lo) { Listen.openFromCard(lo.dataset.fxListenopen); return; }
        });

        /* --- change：开放式勾选 / 分享类型 --- */
        document.addEventListener('change', e => {
            const t = e.target;
            if (!t) return;
            if (t.classList && t.classList.contains('fx-openbox')) {
                const q = t.closest('.fx-q');
                if (q) q.querySelector('.fx-opts').style.display = t.checked ? 'none' : '';
                return;
            }
            if (t.id === 'fx-sh-type') {
                if (t.dataset.auto !== 'off') t.dataset.auto = 'off';
                Share.preview(false);
            }
        });

        /* --- input：分享实时预览 --- */
        document.addEventListener('input', e => {
            const t = e.target;
            if (!t) return;
            if (t.id === 'fx-sh-url' || t.id === 'fx-sh-title') {
                const sel = document.getElementById('fx-sh-type');
                if (sel && t.id === 'fx-sh-url') sel.dataset.auto = 'on';
                Share.preview(true);
            }
        });

        /* --- 回车提交回答 --- */
        document.addEventListener('keydown', e => {
            if (e.key !== 'Enter') return;
            const t = e.target;
            if (t && t.matches && t.matches('[data-fx-answer]')) {
                e.preventDefault();
                const qi = Number(t.dataset.fxAnswer);
                const cid = t.dataset.fxCid;
                const btn = document.querySelector('[data-fx-answersend="' + qi + '"][data-fx-cid="' + cid + '"]');
                if (btn) btn.click();
            }
        });
    }

    /* ---------- 梦角偶尔主动出题 / 点歌（低频，不刷屏） ---------- */
    function startAutoEvents() {
        let lastLen = -1, lastFire = 0;
        let nDecide = 0, nListen = 0;
        setInterval(() => {
            try {
                const arr = (typeof messages !== 'undefined' && messages) ? messages : [];
                const len = arr.length;
                if (lastLen === -1) { lastLen = len; return; }
                if (len <= lastLen) { lastLen = len; return; }
                lastLen = len;
                const last = arr[len - 1];
                if (!last || last.sender !== 'user') return;
                if (now() - lastFire < 4 * 60 * 1000) return;
                if (Math.random() > 0.16) return;
                lastFire = now();
                const doDecide = Math.random() < 0.5;
                if (doDecide && nDecide < 2) { nDecide++; setTimeout(() => Decide.incoming(), delay()); }
                else if (!doDecide && nListen < 2) { nListen++; setTimeout(() => Listen.incoming(), delay()); }
            } catch (e) {}
        }, 12000);
    }

    /* ---------- 接管三个面板入口（在 social-ext 之后） ---------- */
    function takeover() {
        const LP = W.LoveExt && W.LoveExt.LP;
        if (!LP) return false;
        LP.decide = function () { Decide.view(); };
        LP.share = function () { Share.view(); };
        LP.listen = async function () { await Listen.view(); };
        return true;
    }
    async function boot() {
        bind();
        tagSysCards();
        try { await Decide.load(); } catch (e) {}
        try { await Listen.load(); } catch (e) {}
        // 等 social-ext 的 Player 就绪，避免被它的 takeoverLP 覆盖
        let ok = false;
        for (let i = 0; i < 25 && !ok; i++) {
            ok = (W.GX && W.GX.Player) ? takeover() : false;
            if (!ok) await new Promise(r => setTimeout(r, 200));
        }
        if (!ok) takeover();
        // 系统消息容器重新渲染后补标记
        try {
            const cc = document.getElementById('chat-container');
            if (cc && W.MutationObserver) {
                let tid = null;
                new MutationObserver(() => {
                    clearTimeout(tid);
                    tid = setTimeout(tagSysCards, 60);
                }).observe(cc, { childList: true, subtree: true });
            }
        } catch (e) {}
        startAutoEvents();
        W.FinalExt = { Decide: Decide, Share: Share, Listen: Listen, detect: detect, tag: tagSysCards, addCardMsg: addCardMsg, partnerSays: partnerSays };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 700));
    else setTimeout(boot, 700);
})();
