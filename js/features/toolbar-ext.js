/* ============================================================
   toolbar-ext.js —— 本次新增交互
   1) 底部间距滑块（设置 → 聊天设置 → 显示）
   2) 🫧 联系人 · 群聊 聚合入口
   3) 后台 / 锁屏说明（数据管理）与「回来时补发」开关
   4) Service Worker 通知 + 回到应用时补发一条主动消息
   原则：不改动任何原有功能逻辑，只做转发 / 增量设置。
   ============================================================ */
(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const GAP = 'chatBottomGap';
    const SEEN = 'appLastSeenAt';
    const CATCH = 'catchUpEnabled';

    /* ---------- 1. 底部间距 ---------- */
    function applyGap(px) {
        let v = Number(px);
        if (isNaN(v)) v = 10;
        v = Math.max(0, Math.min(60, v));
        document.documentElement.style.setProperty('--chat-bottom-gap', v + 'px');
        try { localStorage.setItem(GAP, String(v)); } catch (e) {}
        const lab = $('bottom-gap-value'); if (lab) lab.textContent = v + 'px';
        const sl = $('bottom-gap-slider'); if (sl && Number(sl.value) !== v) sl.value = v;
    }
    function initGap() {
        let v = 10;
        try {
            const s = localStorage.getItem(GAP);
            if (s !== null && !isNaN(Number(s))) v = Number(s);
        } catch (e) {}
        applyGap(v);
        const sl = $('bottom-gap-slider');
        if (sl) {
            sl.value = v;
            sl.addEventListener('input', e => applyGap(e.target.value));
            sl.addEventListener('change', e => applyGap(e.target.value));
        }
    }

    /* ---------- 2. 🫧 聚合入口 ---------- */
    function closeHub() {
        const m = $('hub-modal');
        if (!m) return;
        try {
            if (typeof hideModal === 'function') hideModal(m);
            else m.style.display = 'none';
        } catch (e) { m.style.display = 'none'; }
    }
    function forward(id) {
        closeHub();
        const b = $(id);
        if (b) setTimeout(() => b.click(), 60);
    }
    function initHub() {
        const hb = $('hub-btn');
        if (hb) hb.addEventListener('click', () => {
            const m = $('hub-modal');
            if (!m) return;
            if (typeof showModal === 'function') showModal(m);
            else m.style.display = 'flex';
        });
        const hp = $('hub-people'); if (hp) hp.addEventListener('click', () => { closeHub(); setTimeout(() => { if (window.People && window.People.open) window.People.open(); }, 60); });
        const hg = $('hub-groups'); if (hg) hg.addEventListener('click', () => forward('group-chat-btn'));
        const hx = $('hub-close'); if (hx) hx.addEventListener('click', closeHub);
    }

    /* ---------- 3. 后台 / 锁屏说明（数据管理弹层动态生成，用事件委托） ---------- */
    function syncFaq() {
        const cb = $('catch-up-toggle');
        if (!cb) return;
        let off = false;
        try { off = localStorage.getItem(CATCH) === '0'; } catch (e) {}
        cb.checked = !off;
    }
    document.addEventListener('click', function (e) {
        const t = e.target && e.target.closest ? e.target.closest('#push-faq-toggle') : null;
        if (!t) return;
        const b = $('push-faq-body');
        if (b) { b.style.display = b.style.display === 'none' ? '' : 'none'; syncFaq(); }
    });
    document.addEventListener('change', function (e) {
        if (e.target && e.target.id === 'catch-up-toggle') {
            try { localStorage.setItem(CATCH, e.target.checked ? '1' : '0'); } catch (err) {}
        }
    });

    /* ---------- 4. 后台 / 锁屏通知增强 ---------- */
    function markSeen() { try { localStorage.setItem(SEEN, String(Date.now())); } catch (e) {} }
    document.addEventListener('visibilitychange', () => { if (document.hidden) markSeen(); });
    window.addEventListener('pagehide', markSeen);
    window.addEventListener('beforeunload', markSeen);
    setInterval(markSeen, 30000);

    function initServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        if (!/^https?:$/.test(location.protocol)) return;   // file:// 下不可用
        window.addEventListener('load', function () {
            try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) {}
        });
    }

    // 纯静态网页没有后台服务：退出期间不会真的产生消息。
    // 这里在「重新打开」时补一条，让不在期间的主动消息不落空（可在数据管理里关掉）。
    function initCatchUp() {
        setTimeout(function () {
            try {
                if (localStorage.getItem(CATCH) === '0') { markSeen(); return; }
                let st = null;
                try { st = (typeof settings !== 'undefined') ? settings : null; } catch (e) {}
                if (!st || !st.autoSendEnabled) { markSeen(); return; }
                const last = Number(localStorage.getItem(SEEN) || 0);
                const intervalMs = (st.autoSendInterval || 5) * 60000;
                if (last && Date.now() - last >= intervalMs) {
                    markSeen();
                    setTimeout(function () {
                        if (typeof window.simulateReply === 'function') window.simulateReply();
                    }, 2200 + Math.random() * 2500);
                } else {
                    markSeen();
                }
            } catch (e) {}
        }, 5000);
    }

    function boot() {
        initGap();
        initHub();
        syncFaq();
        initServiceWorker();
        initCatchUp();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
