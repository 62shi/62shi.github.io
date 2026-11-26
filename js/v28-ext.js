/* ============================================================
   v28-ext.js · 功能补强 & 流畅度优化层
   只做增量增强，不修改原有视觉与交互逻辑：
   1. 消息搜索（会话内全文检索 + 定位高亮）
   2. 回到最新（离开底部时的悬浮按钮 + 新消息计数）
   3. 输入草稿自动保存 / 恢复
   4. 长按消息复制
   5. 离线状态提示
   6. 流畅模式（关闭装饰性动效，按机型自动开启）
   7. 渲染优化：懒加载图片、渲染条数上限、滚动节流
   ============================================================ */
(function () {
    'use strict';

    var LS = {
        lite: 'v28_lite_mode',
        seen: 'v28_welcome_seen'
    };
    var MAX_RENDER = 300;      // 单次最多渲染的消息条数上限
    var renderHooked = false;

    function q(sel, root) { return (root || document).querySelector(sel); }
    function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
    function toast(msg, type, dur) {
        try {
            if (typeof showNotification === 'function') return showNotification(msg, type || 'success', dur || 2000);
        } catch (e) { }
    }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function currentSessionId() {
        try { return (typeof SESSION_ID !== 'undefined' && SESSION_ID) ? SESSION_ID : 'default'; }
        catch (e) { return 'default'; }
    }

    /* ============================================================
       0. 流畅模式
       ============================================================ */
    function applyLite() {
        var saved = null;
        try { saved = localStorage.getItem(LS.lite); } catch (e) { }
        var on;
        if (saved === '1') on = true;
        else if (saved === '0') on = false;
        else {
            // 首次：低性能设备自动开启
            var cores = navigator.hardwareConcurrency || 4;
            var mem = navigator.deviceMemory || 4;
            on = (cores <= 4 || mem <= 4);
        }
        document.documentElement.classList.toggle('v28-lite', !!on);
        return on;
    }

    function setLite(on) {
        document.documentElement.classList.toggle('v28-lite', !!on);
        try { localStorage.setItem(LS.lite, on ? '1' : '0'); } catch (e) { }
        syncLiteLabel();
    }

    function syncLiteLabel() {
        var el = q('#v28-lite-state');
        if (!el) return;
        var on = document.documentElement.classList.contains('v28-lite');
        el.textContent = on ? '已开启' : '已关闭';
        el.style.color = on ? 'var(--accent-color)' : 'var(--text-secondary)';
    }

    /* ============================================================
       1. 开屏加速（第二次进入不再等满 3.5 秒）
       ============================================================ */
    function fastWelcome() {
        var seen = false;
        try { seen = localStorage.getItem(LS.seen) === '1'; } catch (e) { }
        try { localStorage.setItem(LS.seen, '1'); } catch (e) { }

        var welcome = q('#welcome-animation');
        if (!welcome) return;

        var forceHide = function () {
            if (!welcome || welcome.dataset.v28Hidden) return;
            welcome.dataset.v28Hidden = '1';
            welcome.classList.add('hidden');
            setTimeout(function () { welcome.style.display = 'none'; }, 720);
        };

        welcome.addEventListener('click', forceHide);

        if (seen) {
            setTimeout(forceHide, 700);
        }
    }

    /* ============================================================
       2. 渲染优化：图片懒加载 + 条数上限
       ============================================================ */
    function postRender() {
        var c = q('#chat-container');
        if (!c) return;

        // 图片懒加载（聊天内图片可能是 base64，懒加载仍能减少一次性解码压力）
        var imgs = c.querySelectorAll('img.message-image:not([data-v28])');
        for (var i = 0; i < imgs.length; i++) {
            imgs[i].setAttribute('data-v28', '1');
            imgs[i].setAttribute('loading', 'lazy');
            imgs[i].setAttribute('decoding', 'async');
        }
        updateJumpBtn();
    }

    function hookRender() {
        if (renderHooked || typeof window.renderMessages !== 'function') return;
        var orig = window.renderMessages;
        if (orig.__v28) { renderHooked = true; return; }

        var wrapped = function (preserveScroll) {
            try {
                if (typeof displayedMessageCount === 'number' && displayedMessageCount > MAX_RENDER) {
                    displayedMessageCount = MAX_RENDER;
                }
            } catch (e) { }
            var r = orig.call(this, preserveScroll);
            postRender();
            return r;
        };
        wrapped.__v28 = true;
        window.renderMessages = wrapped;
        renderHooked = true;
    }

    /* ============================================================
       3. 回到最新
       ============================================================ */
    var unread = 0;
    var jumpBtn = null;

    function buildJumpBtn() {
        if (jumpBtn) return jumpBtn;
        var dock = q('#v28-dock');
        if (!dock) return null;
        jumpBtn = document.createElement('button');
        jumpBtn.type = 'button';
        jumpBtn.className = 'v28-fab v28-jump';
        jumpBtn.id = 'v28-jump-btn';
        jumpBtn.title = '回到最新';
        jumpBtn.innerHTML = '<i class="fas fa-arrow-down"></i><span class="v28-fab-badge" id="v28-jump-badge" hidden>0</span>';
        jumpBtn.addEventListener('click', function () {
            var c = q('#chat-container');
            if (c) {
                try { c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' }); }
                catch (e) { c.scrollTop = c.scrollHeight; }
            }
            unread = 0;
            updateJumpBtn();
        });
        dock.insertBefore(jumpBtn, dock.firstChild);
        return jumpBtn;
    }

    function updateJumpBtn() {
        if (!jumpBtn) return;
        var c = q('#chat-container');
        if (!c || !c.offsetParent) { jumpBtn.classList.remove('show'); return; }
        var gap = c.scrollHeight - c.scrollTop - c.clientHeight;
        var show = gap > 260;
        jumpBtn.classList.toggle('show', show);
        var badge = q('#v28-jump-badge');
        if (badge) {
            if (unread > 0) {
                badge.hidden = false;
                badge.textContent = unread > 99 ? '99+' : String(unread);
            } else {
                badge.hidden = true;
            }
        }
    }

    function isAwayFromBottom() {
        var c = q('#chat-container');
        if (!c) return false;
        return (c.scrollHeight - c.scrollTop - c.clientHeight) > 260;
    }

    function watchNewMessages() {
        var c = q('#chat-container');
        if (!c) return;
        var obs = new MutationObserver(function (records) {
            for (var i = 0; i < records.length; i++) {
                var added = records[i].addedNodes;
                for (var j = 0; j < added.length; j++) {
                    var n = added[j];
                    if (n.nodeType !== 1) continue;
                    var isMsg = (n.classList && n.classList.contains('message-wrapper')) ||
                        (n.querySelector && n.querySelector('.message-wrapper'));
                    if (isMsg && isAwayFromBottom()) {
                        unread++;
                        updateJumpBtn();
                    }
                }
            }
        });
        obs.observe(c, { childList: true, subtree: false });
    }

    function bindScroll() {
        var c = q('#chat-container');
        if (!c) return;
        var raf = 0;
        c.addEventListener('scroll', function () {
            if (raf) return;
            raf = requestAnimationFrame(function () {
                raf = 0;
                updateJumpBtn();
            });
        }, { passive: true });
    }

    /* ============================================================
       4. 消息搜索
       ============================================================ */
    var searchMask = null;

    function buildSearchPanel() {
        if (searchMask) return searchMask;
        searchMask = document.createElement('div');
        searchMask.className = 'v28-search-mask';
        searchMask.id = 'v28-search-mask';
        searchMask.innerHTML = ''
            + '<div class="v28-search-sheet" id="v28-search-sheet">'
            + '  <div class="v28-search-handle"></div>'
            + '  <div class="v28-search-head">'
            + '    <div class="v28-search-input-wrap">'
            + '      <i class="fas fa-magnifying-glass"></i>'
            + '      <input class="v28-search-input" id="v28-search-input" type="search" placeholder="搜索聊天记录…" autocomplete="off">'
            + '    </div>'
            + '    <button class="v28-search-close" id="v28-search-close" type="button"><i class="fas fa-xmark"></i></button>'
            + '  </div>'
            + '  <div class="v28-search-meta" id="v28-search-meta"></div>'
            + '  <div class="v28-search-list" id="v28-search-list"></div>'
            + '</div>';
        document.body.appendChild(searchMask);

        searchMask.addEventListener('click', function (e) {
            if (e.target === searchMask) closeSearch();
        });
        q('#v28-search-close', searchMask).addEventListener('click', closeSearch);

        var input = q('#v28-search-input', searchMask);
        var timer = 0;
        input.addEventListener('input', function () {
            clearTimeout(timer);
            timer = setTimeout(function () { runSearch(input.value); }, 180);
        });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { clearTimeout(timer); runSearch(input.value); }
        });
        return searchMask;
    }

    function fmtTime(ts) {
        try {
            var d = new Date(ts);
            var today = new Date().toDateString();
            var hm = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
            if (d.toDateString() === today) return hm;
            return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
        } catch (e) { return ''; }
    }

    function openSearch() {
        var m = buildSearchPanel();
        m.classList.add('show');
        setTimeout(function () {
            var input = q('#v28-search-input');
            if (input) { input.value = ''; input.focus(); }
            var list = q('#v28-search-list');
            if (list) list.innerHTML = '<div class="v28-search-empty">输入关键词，检索本会话的聊天记录<br><span style="opacity:.7">支持文字内容搜索</span></div>';
            var meta = q('#v28-search-meta');
            if (meta) meta.textContent = '';
        }, 60);
    }

    function closeSearch() {
        if (searchMask) searchMask.classList.remove('show');
    }

    function runSearch(kw) {
        var list = q('#v28-search-list');
        var meta = q('#v28-search-meta');
        if (!list) return;
        kw = String(kw || '').trim();
        if (!kw) {
            list.innerHTML = '<div class="v28-search-empty">输入关键词，检索本会话的聊天记录</div>';
            if (meta) meta.textContent = '';
            return;
        }

        var arr = [];
        try { arr = (typeof messages !== 'undefined' && messages) ? messages : []; } catch (e) { arr = []; }
        var low = kw.toLowerCase();
        var hits = [];
        for (var i = 0; i < arr.length; i++) {
            var m = arr[i];
            if (!m) continue;
            var t = m.text ? String(m.text) : '';
            if (!t && m.image) t = '';
            if (t && t.toLowerCase().indexOf(low) > -1) hits.push({ msg: m, index: i, text: t });
        }

        if (meta) meta.textContent = hits.length ? ('找到 ' + hits.length + ' 条相关记录') : '';

        if (!hits.length) {
            list.innerHTML = '<div class="v28-search-empty">没有找到含「' + esc(kw) + '」的消息<br><span style="opacity:.7">试试更短的关键词</span></div>';
            return;
        }

        // 由新到旧
        hits.reverse();
        var frag = document.createDocumentFragment();
        for (var k = 0; k < hits.length; k++) {
            frag.appendChild(searchRow(hits[k], low));
        }
        list.innerHTML = '';
        list.appendChild(frag);
    }

    function searchRow(hit, low) {
        var m = hit.msg;
        var isMe = (m.sender === 'user');
        var name = isMe ? ((settings && settings.myName) || '我') : ((settings && settings.partnerName) || m.sender || '对方');

        // 截取命中位置附近的片段
        var text = hit.text;
        var pos = text.toLowerCase().indexOf(low);
        var start = Math.max(0, pos - 14);
        var end = Math.min(text.length, pos + low.length + 26);
        var pre = (start > 0 ? '…' : '') + text.slice(start, pos);
        var mid = text.slice(pos, pos + low.length);
        var post = text.slice(pos + low.length, end) + (end < text.length ? '…' : '');

        var row = document.createElement('div');
        row.className = 'v28-sr';
        row.innerHTML = ''
            + '<div class="v28-sr-av">' + (isMe ? '<i class="fas fa-user"></i>' : '<i class="fas fa-heart"></i>') + '</div>'
            + '<div class="v28-sr-main">'
            + '  <div class="v28-sr-top"><span class="v28-sr-name">' + esc(name) + '</span><span class="v28-sr-time">' + esc(fmtTime(m.timestamp)) + '</span></div>'
            + '  <div class="v28-sr-text">' + esc(pre) + '<em>' + esc(mid) + '</em>' + esc(post) + '</div>'
            + '</div>';
        row.addEventListener('click', function () {
            jumpToMessage(hit.index, m.id);
        });
        return row;
    }

    function jumpToMessage(index, id) {
        closeSearch();
        try {
            var total = (typeof messages !== 'undefined' && messages.length) ? messages.length : 0;
            var need = total - index;
            var shown = (typeof displayedMessageCount === 'number') ? displayedMessageCount : 20;
            if (need > shown) {
                displayedMessageCount = Math.min(total, need + 30);
                if (typeof renderMessages === 'function') renderMessages(true);
            }
        } catch (e) { }

        requestAnimationFrame(function () {
            var el = q('#chat-container [data-msg-id="' + id + '"]') || q('#chat-container [data-id="' + id + '"]');
            if (!el) { toast('这条消息已被删除或在更早的记录里', 'warning'); return; }
            try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
            catch (e) { el.scrollIntoView(); }
            el.classList.add('v28-hit');
            setTimeout(function () { el.classList.remove('v28-hit'); }, 1500);
        });
    }

    /* ============================================================
       5. 草稿自动保存
       ============================================================ */
    var draftTimer = 0;

    function draftKey(sid) { return 'v28_draft_' + (sid || currentSessionId()); }

    function saveDraft() {
        var input = q('#message-input');
        if (!input) return;
        var v = input.value || '';
        try {
            if (v.trim()) localStorage.setItem(draftKey(), v);
            else localStorage.removeItem(draftKey());
        } catch (e) { }
    }

    function clearDraft(sid) {
        try { localStorage.removeItem(draftKey(sid)); } catch (e) { }
    }

    function restoreDraft(sid) {
        var input = q('#message-input');
        if (!input) return;
        if (input.value && input.value.trim()) return;   // 已有内容不覆盖
        var v = null;
        try { v = localStorage.getItem(draftKey(sid)); } catch (e) { }
        if (!v) return;
        input.value = v;
        try {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        } catch (e) { }
        var wrap = input.closest('.input-area');
        if (wrap) wrap.classList.add('has-draft');
    }

    function bindDraft() {
        var input = q('#message-input');
        if (!input) return;
        input.addEventListener('input', function () {
            clearTimeout(draftTimer);
            draftTimer = setTimeout(saveDraft, 350);
        });

        var send = q('#send-btn');
        if (send) send.addEventListener('click', function () { setTimeout(saveDraft, 120); }, true);

        window.addEventListener('pagehide', saveDraft);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') saveDraft();
        });

        // 切换会话后恢复对应草稿
        var lastSid = currentSessionId();
        restoreDraft(lastSid);
        setInterval(function () {
            var sid = currentSessionId();
            if (sid !== lastSid) {
                saveDraft();
                lastSid = sid;
                setTimeout(function () { restoreDraft(sid); }, 220);
            }
        }, 900);
    }

    /* ============================================================
       6. 长按复制
       ============================================================ */
    var copiedTip = null;

    function showCopied() {
        if (!copiedTip) {
            copiedTip = document.createElement('div');
            copiedTip.className = 'v28-copied';
            document.body.appendChild(copiedTip);
        }
        copiedTip.textContent = '已复制到剪贴板';
        copiedTip.classList.add('show');
        clearTimeout(copiedTip._t);
        copiedTip._t = setTimeout(function () { copiedTip.classList.remove('show'); }, 1400);
    }

    function copyText(text) {
        if (!text) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(showCopied).catch(function () { fallbackCopy(text); });
        } else {
            fallbackCopy(text);
        }
    }

    function fallbackCopy(text) {
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showCopied();
        } catch (e) { toast('复制失败', 'error'); }
    }

    function bindLongPressCopy() {
        var pressTimer = 0;
        var startX = 0, startY = 0;
        var targetMsg = null;

        function cancel() {
            clearTimeout(pressTimer);
            pressTimer = 0;
            targetMsg = null;
        }

        document.addEventListener('pointerdown', function (e) {
            var msg = e.target.closest ? e.target.closest('.message') : null;
            if (!msg) return;
            if (e.target.closest('.message-image')) return;   // 图片点击保留原查看逻辑
            if (e.target.closest('a,button')) return;

            startX = e.clientX; startY = e.clientY;
            targetMsg = msg;
            clearTimeout(pressTimer);
            pressTimer = setTimeout(function () {
                var txt = (targetMsg && targetMsg.innerText) ? targetMsg.innerText.trim() : '';
                if (txt) {
                    copyText(txt);
                    try { if (navigator.vibrate) navigator.vibrate(12); } catch (err) { }
                }
                targetMsg = null;
            }, 520);
        }, { passive: true });

        document.addEventListener('pointermove', function (e) {
            if (!pressTimer && !targetMsg) return;
            if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) cancel();
        }, { passive: true });

        document.addEventListener('pointerup', cancel, { passive: true });
        document.addEventListener('pointercancel', cancel, { passive: true });
        document.addEventListener('contextmenu', function (e) {
            if (e.target.closest && e.target.closest('.message')) {
                e.preventDefault();
                var txt = e.target.closest('.message').innerText.trim();
                if (txt) copyText(txt);
            }
        });
    }

    /* ============================================================
       7. 离线提示
       ============================================================ */
    function bindOffline() {
        var tip = document.createElement('div');
        tip.className = 'v28-offline';
        tip.id = 'v28-offline';
        document.body.appendChild(tip);

        var hideTimer = 0;
        function show(text, ms) {
            tip.textContent = text;
            tip.classList.add('show');
            clearTimeout(hideTimer);
            if (ms) hideTimer = setTimeout(function () { tip.classList.remove('show'); }, ms);
        }
        function hide() { tip.classList.remove('show'); }

        window.addEventListener('offline', function () { show('已离线 · 内容仍保存在本机', 0); });
        window.addEventListener('online', function () { show('网络已恢复', 1800); setTimeout(hide, 1900); });
        if (!navigator.onLine) show('已离线 · 内容仍保存在本机', 0);
    }

    /* ============================================================
       8. 工具坞
       ============================================================ */
    function buildDock() {
        var dock = document.createElement('div');
        dock.className = 'v28-dock';
        dock.id = 'v28-dock';

        var searchBtn = document.createElement('button');
        searchBtn.type = 'button';
        searchBtn.className = 'v28-fab';
        searchBtn.id = 'v28-search-btn';
        searchBtn.title = '搜索聊天记录';
        searchBtn.innerHTML = '<i class="fas fa-magnifying-glass"></i>';
        searchBtn.addEventListener('click', openSearch);
        dock.appendChild(searchBtn);

        document.body.appendChild(dock);
        buildJumpBtn();
    }

    /* ============================================================
       9. 高级功能里挂两个入口
       ============================================================ */
    function injectAdvancedEntries() {
        var list = q('#advanced-modal .settings-item-list');
        if (!list || list.dataset.v28) return;
        list.dataset.v28 = '1';

        var searchItem = document.createElement('div');
        searchItem.className = 'settings-item';
        searchItem.innerHTML = '<i class="fas fa-magnifying-glass"></i><span>搜索聊天记录</span>';
        searchItem.addEventListener('click', function () {
            try { hideModal(document.getElementById('advanced-modal')); } catch (e) { }
            setTimeout(openSearch, 240);
        });
        list.appendChild(searchItem);

        var liteItem = document.createElement('div');
        liteItem.className = 'settings-item';
        liteItem.innerHTML = '<i class="fas fa-bolt"></i><span>流畅模式</span>'
            + '<em id="v28-lite-state" style="font-style:normal;font-size:11.5px;margin-left:auto;color:var(--text-secondary);"></em>';
        liteItem.addEventListener('click', function () {
            var on = !document.documentElement.classList.contains('v28-lite');
            setLite(on);
            toast(on ? '流畅模式已开启：已关闭装饰动效' : '流畅模式已关闭：恢复全部动效', 'success', 1800);
        });
        list.appendChild(liteItem);

        syncLiteLabel();
    }

    /* ============================================================
       启动
       ============================================================ */
    function boot() {
        applyLite();
        fastWelcome();
        buildDock();
        bindScroll();
        watchNewMessages();
        bindDraft();
        bindLongPressCopy();
        bindOffline();
        injectAdvancedEntries();

        // 等主程序初始化完成后再挂渲染钩子（避免拿到未定义的函数）
        setTimeout(function () {
            hookRender();
            postRender();
        }, 400);

        // 弹窗每次打开时检查一次（防止高级功能弹窗被重建）
        document.addEventListener('click', function (e) {
            if (e.target.closest && e.target.closest('#advanced-settings')) {
                setTimeout(injectAdvancedEntries, 60);
            }
        }, true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
