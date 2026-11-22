(function () {
    'use strict';
    (function blockDm6CSS() {
        if (document.getElementById('dm6-style')) return; 
        var s = document.createElement('style');
        s.id = 'dm6-style'; 
        s.textContent = '/* dm6-style blocked by data-modal v9 */';
        document.head.appendChild(s);
    })();

    var INNER_HTML =
        '<div class="dm-topbar">'
        +   '<div class="dm-topbar-left">'
        +     '<button class="dm-topbar-back" id="back-data"><i class="fas fa-arrow-left"></i></button>'
        +     '<span class="dm-topbar-title">数据管理</span>'
        +   '</div>'
        +   '<button class="dm-topbar-close" id="close-data"><i class="fas fa-xmark"></i></button>'
        + '</div>'

        + '<div class="dm-body">'

        +   '<div class="dm-storage-card">'
        +     '<div class="dm-storage-header">'
        +       '<span class="dm-storage-title"><i class="fas fa-database" style="margin-right:5px;opacity:0.55"></i>存储用量</span>'
        +       '<span class="dm-storage-label" id="dm-storage-total">计算中…</span>'
        +     '</div>'
        +     '<div class="dm-stats-grid">'
        +       '<div class="dm-stat-block"><div class="dm-stat-block-icon" style="color:var(--accent-color)"><i class="fas fa-comments"></i></div><div class="dm-stat-pill-val" id="dm-stat-msgs">—</div><div class="dm-stat-pill-key">聊天记录</div></div>'
        +       '<div class="dm-stat-block"><div class="dm-stat-block-icon" style="color:#9C6FD4"><i class="fas fa-sliders"></i></div><div class="dm-stat-pill-val" id="dm-stat-settings">—</div><div class="dm-stat-pill-key">设置数据</div></div>'
        +       '<div class="dm-stat-block"><div class="dm-stat-block-icon" style="color:#3BC8A4"><i class="fas fa-images"></i></div><div class="dm-stat-pill-val" id="dm-stat-media">—</div><div class="dm-stat-pill-key">图片媒体</div></div>'
        +     '</div>'
        +     '<div class="dm-progress-track"><div class="dm-progress-fill" id="dm-storage-bar" style="width:0%"></div></div>'
        +   '</div>'

        +   '<div class="dm-section-label"><i class="fas fa-cloud-upload-alt"></i> 备份与恢复</div>'
        +   '<div class="dm-grid">'
        +     '<div class="dm-tile" id="dm-tile-full-backup">'
        +       '<div class="dm-tile-icon blue"><i class="fas fa-layer-group"></i></div>'
        +       '<div class="dm-tile-info"><div class="dm-tile-title">全量备份</div><div class="dm-tile-desc">所有设置与数据</div></div>'
        +       '<i class="fas fa-chevron-right dm-tile-arrow"></i>'
        +     '</div>'
        +     '<div class="dm-tile" id="dm-tile-chat-backup">'
        +       '<div class="dm-tile-icon teal"><i class="fas fa-comments"></i></div>'
        +       '<div class="dm-tile-info"><div class="dm-tile-title">聊天记录</div><div class="dm-tile-desc">消息内容单独备份</div></div>'
        +       '<i class="fas fa-chevron-right dm-tile-arrow"></i>'
        +     '</div>'
        +   '</div>'

        +   '<div style="display:none">'
        +     '<button id="export-all-settings"></button>'
        +     '<button id="import-all-settings"></button>'
        +     '<button id="export-chat-btn"></button>'
        +     '<button id="import-chat-btn"></button>'
        +   '</div>'

        +   '<div class="dm-section-label"><i class="fas fa-bell"></i> 通知</div>'
        +   '<div class="dm-row-card">'
        +     '<div class="dm-row-item">'
        +       '<div class="dm-row-icon amber"><i class="fas fa-bell"></i></div>'
        +       '<div class="dm-row-info"><div class="dm-row-title">后台消息推送</div><div class="dm-row-desc" id="notif-status-text">收到新消息时弹出提醒</div></div>'
        +       '<label class="dm-toggle-pill"><input type="checkbox" id="notif-permission-toggle" onchange="handleNotifToggle(this)"><span class="dm-toggle-slider"></span></label>'
        +     '</div>'
        +   '</div>'

        +   '<div class="dm-section-label"><i class="fas fa-mobile-screen"></i> 后台 / 锁屏说明</div>'
        +   '<div class="dm-row-card">'
        +     '<div class="dm-row-item" id="push-faq-toggle" style="cursor:pointer;">'
        +       '<div class="dm-row-icon amber"><i class="fas fa-question-circle"></i></div>'
        +       '<div class="dm-row-info"><div class="dm-row-title">退出 APP / 锁屏后收不到主动消息？</div><div class="dm-row-desc">点开看原因与可行做法</div></div>'
        +       '<i class="fas fa-chevron-right" style="color:var(--text-secondary);font-size:12px;flex-shrink:0;"></i>'
        +     '</div>'
        +     '<div id="push-faq-body" class="push-faq-body" style="display:none;padding:12px 14px 14px;border-top:1px solid var(--border-color);">'
        +       '<p><b>为什么会这样</b></p>'
        +       '<ul>'
        +         '<li>这是一个<b>纯静态网页</b>：没有服务器、没有账号，也没有云端推送服务。</li>'
        +         '<li>toapp 这类工具只是把网页装进一个「浏览器壳（WebView）」，并不会额外添加原生后台服务或系统推送通道。</li>'
        +         '<li>「主动发消息」靠的是网页里的定时器：<b>只有 APP 在前台、页面正在运行时</b>才会到点生成消息。</li>'
        +         '<li>退出 APP 或切到后台后，系统会冻结 / 结束这个壳，网页里的定时器全部停止，自然不会有任何消息产生。</li>'
        +         '<li>锁屏通知需要<b>系统级推送</b>（厂商推送 / FCM + 服务端下发）。静态网页套壳的 APK 没有这些，网页通知也只能在页面还活着时弹出。</li>'
        +         '<li>聊天记录和设置都存在本机，没有云端同步，也没有「服务器记得给你发消息」这回事。</li>'
        +       '</ul>'
        +       '<p><b>能改善到什么程度</b></p>'
        +       '<ul>'
        +         '<li>保持 APP 在前台、不要被系统一键清理，主动消息与提醒才会按间隔出现。</li>'
        +         '<li>打开上面的「后台消息推送」并允许通知权限；页面在后台但进程未被杀死时，会尽量弹出系统通知。</li>'
        +         '<li>已开启下面的「回来时补发」：重新打开 APP 时，会把不在期间本该有的那条主动消息补进聊天里。</li>'
        +         '<li>想做到「退出也收、锁屏也弹」，必须有服务端 + 原生推送（真正的原生 App），这超出了纯静态网页能做到的范围。</li>'
        +       '</ul>'
        +       '<label class="push-faq-switch"><input type="checkbox" id="catch-up-toggle" checked><span>回来时补发一条主动消息（默认开）</span></label>'
        +     '</div>'
        +   '</div>'

        +   '<div class="dm-section-label danger-label"><i class="fas fa-triangle-exclamation"></i> 危险操作</div>'
        +   '<div class="dm-danger-cards dm-danger-cards-row">'
        +     '<button class="dm-danger-card dm-danger-card-orange dm-danger-card-half" id="clear-chat-only">'
        +       '<div class="dm-danger-card-icon"><i class="fas fa-eraser"></i></div>'
        +       '<div class="dm-danger-card-body">'
        +         '<div class="dm-danger-card-title">清除会话</div>'
        +         '<div class="dm-danger-card-desc">删除本会话消息</div>'
        +       '</div>'
        +     '</button>'
        +     '<button class="dm-danger-card dm-danger-card-red dm-danger-card-half" id="clear-storage">'
        +       '<div class="dm-danger-card-icon"><i class="fas fa-skull-crossbones"></i></div>'
        +       '<div class="dm-danger-card-body">'
        +         '<div class="dm-danger-card-title">重置数据</div>'
        +         '<div class="dm-danger-card-desc">清空所有，不可撤销</div>'
        +       '</div>'
        +     '</button>'
        +   '</div>'

        + '</div>'
        ;

    var DRAWER_FULL_HTML =
        '<div class="dm-action-drawer" id="dm-drawer-full">'
        +   '<div class="dm-drawer-backdrop" id="dm-drawer-full-backdrop"></div>'
        +   '<div class="dm-drawer-sheet">'
        +     '<div class="dm-drawer-handle"></div>'
        +     '<div class="dm-drawer-title">'
        +       '<div class="dm-drawer-title-icon blue" style="background:linear-gradient(135deg,#4A90E2,#3576C8);color:#fff"><i class="fas fa-layer-group"></i></div>'
        +       '<div><div class="dm-drawer-title-text">全量备份</div><div class="dm-drawer-subtitle">包含所有设置、外观、字卡等数据</div></div>'
        +     '</div>'
        +     '<div class="dm-drawer-actions">'
        +       '<button class="dm-drawer-action-btn primary" id="export-all-settings-real">'
        +         '<div class="dm-drawer-btn-icon"><i class="fas fa-download"></i></div>'
        +         '<div class="dm-drawer-btn-text"><div class="dm-drawer-btn-title">导出备份</div><div class="dm-drawer-btn-desc">将数据保存为文件</div></div>'
        +       '</button>'
        +       '<button class="dm-drawer-action-btn" id="import-all-settings-real">'
        +         '<div class="dm-drawer-btn-icon"><i class="fas fa-upload"></i></div>'
        +         '<div class="dm-drawer-btn-text"><div class="dm-drawer-btn-title">从文件恢复</div><div class="dm-drawer-btn-desc">选择之前导出的备份文件</div></div>'
        +       '</button>'
        +     '</div>'
        +     '<button class="dm-drawer-cancel" id="dm-drawer-full-cancel">取消</button>'
        +   '</div>'
        + '</div>';

    var DRAWER_CHAT_HTML =
        '<div class="dm-action-drawer" id="dm-drawer-chat">'
        +   '<div class="dm-drawer-backdrop" id="dm-drawer-chat-backdrop"></div>'
        +   '<div class="dm-drawer-sheet">'
        +     '<div class="dm-drawer-handle"></div>'
        +     '<div class="dm-drawer-title">'
        +       '<div class="dm-drawer-title-icon" style="background:linear-gradient(135deg,#3BC8A4,#20A882);color:#fff"><i class="fas fa-comments"></i></div>'
        +       '<div><div class="dm-drawer-title-text">聊天记录</div><div class="dm-drawer-subtitle">仅包含消息内容</div></div>'
        +     '</div>'
        +     '<div class="dm-drawer-actions">'
        +       '<button class="dm-drawer-action-btn primary" id="export-chat-btn-real" style="background:linear-gradient(135deg,#3BC8A4,#20A882);border-color:#3BC8A4">'
        +         '<div class="dm-drawer-btn-icon"><i class="fas fa-download"></i></div>'
        +         '<div class="dm-drawer-btn-text"><div class="dm-drawer-btn-title">导出聊天</div><div class="dm-drawer-btn-desc">将消息记录保存为文件</div></div>'
        +       '</button>'
        +       '<button class="dm-drawer-action-btn" id="import-chat-btn-real">'
        +         '<div class="dm-drawer-btn-icon"><i class="fas fa-upload"></i></div>'
        +         '<div class="dm-drawer-btn-text"><div class="dm-drawer-btn-title">导入聊天</div><div class="dm-drawer-btn-desc">从文件恢复历史消息</div></div>'
        +       '</button>'
        +     '</div>'
        +     '<button class="dm-drawer-cancel" id="dm-drawer-chat-cancel">取消</button>'
        +   '</div>'
        + '</div>';

    function isCorrect(mc) {
        return mc.querySelector('.dm-topbar') !== null
            && mc.querySelector('.dm-storage-card') !== null
            && mc.querySelector('.dm6') === null
            && mc.querySelector('.dm6-tabs') === null;
    }

    function ensureDrawersOnBody() {
        var DRAWER_IDS = ['dm-drawer-full', 'dm-drawer-chat'];
        DRAWER_IDS.forEach(function(id) {
            var existing = document.getElementById(id);
            if (existing && existing.parentElement === document.body) return;
            if (existing) {
                document.body.appendChild(existing);
                return;
            }
            var dummy = document.createElement('div');
            if (id === 'dm-drawer-full') dummy.innerHTML = DRAWER_FULL_HTML;
            else dummy.innerHTML = DRAWER_CHAT_HTML;
            document.body.appendChild(dummy.firstElementChild);
        });
    }

    function writeHTML(mc) {
        mc.innerHTML = INNER_HTML;
        mc.dataset.dm6Built = 'v9'; 
        ensureDrawersOnBody();
        bindAll(mc);
    }

    function ensureHTML(mc) {
        if (!mc) return;
        mc.dataset.dm6Built = 'v9'; 
        if (!isCorrect(mc)) writeHTML(mc);
        else ensureDrawersOnBody(); 
    }

    function fmt(b) {
        if (b < 1024) return b + ' B';
        if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
        return (b / 1048576).toFixed(2) + ' MB';
    }

    function applyStats(total, msgs, cfg, media) {
        var pct = Math.min(100, total / (2 * 1024 * 1024 * 1024) * 100);
        var g = function (id) { return document.getElementById(id); };
        var bar = g('dm-storage-bar');
        if (bar) {
            bar.style.width = pct.toFixed(1) + '%';
            bar.style.background = pct > 80
                ? 'linear-gradient(90deg,#FF3B30,#CC0000)'
                : pct > 50
                ? 'linear-gradient(90deg,#FF9F0A,#E07000)'
                : 'linear-gradient(90deg,var(--accent-color),rgba(var(--accent-color-rgb),0.6))';
        }
        if (g('dm-storage-total')) g('dm-storage-total').textContent = fmt(total) + ' / ~5 MB';
        if (g('dm-stat-msgs'))     g('dm-stat-msgs').textContent     = fmt(msgs);
        if (g('dm-stat-settings')) g('dm-stat-settings').textContent = fmt(cfg);
        if (g('dm-stat-media'))    g('dm-stat-media').textContent    = fmt(media);
    }

    function updateStats() {
        var total = 0, msgs = 0, cfg = 0, media = 0;
        var processLS = function () {
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i) || '';
                var v = localStorage.getItem(k) || '';
                var bytes = (k.length + v.length) * 2;
                total += bytes;
                if (/messages|msgs|session/i.test(k)) msgs += bytes;
                else if (v.startsWith('data:image') || v.startsWith('data:video')) media += bytes;
                else cfg += bytes;
            }
            applyStats(total, msgs, cfg, media);
        };
        try {
            if (window.localforage) {
                localforage.keys().then(function (keys) {
                    var promises = keys.map(function (k) {
                        return localforage.getItem(k).then(function (raw) {
                            if (raw == null) return { k: k, b: 0 };
                            var str = typeof raw === 'string' ? raw : JSON.stringify(raw);
                            return { k: k, b: (k.length + str.length) * 2 };
                        });
                    });
                    Promise.all(promises).then(function (results) {
                        results.forEach(function (r) {
                            total += r.b;
                            if (/messages|msgs|session/i.test(r.k)) msgs += r.b;
                            else if (/avatar|image|photo|bg|background|wallpaper/i.test(r.k)) media += r.b;
                            else cfg += r.b;
                        });
                        applyStats(total, msgs, cfg, media);
                    }).catch(processLS);
                }).catch(processLS);
            } else { processLS(); }
        } catch (e) { processLS(); }
    }

    function syncToggles() {
        var n = document.getElementById('notif-permission-toggle');
        if (n) n.checked = localStorage.getItem('notifEnabled') === '1';
        updateNotifStatus();
    }

    function openDrawer(drawerId) {
        var drawer = document.getElementById(drawerId);
        if (!drawer) return;
        drawer.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
    function closeDrawer(drawerId) {
        var drawer = document.getElementById(drawerId);
        if (!drawer) return;
        drawer.classList.remove('open');
        document.body.style.overflow = '';
    }

    function bindAll(mc) {
        var closeBtn = mc.querySelector('#close-data');
        if (closeBtn) closeBtn.addEventListener('click', function () {
            var modal = document.getElementById('data-modal');
            if (modal && typeof hideModal === 'function') hideModal(modal);
        });

        var backBtn = mc.querySelector('#back-data');
        if (backBtn) backBtn.addEventListener('click', function () {
            var dataModal = document.getElementById('data-modal');
            if (dataModal && typeof hideModal === 'function') hideModal(dataModal);
            var settingsModal = document.getElementById('settings-modal');
            if (settingsModal && typeof showModal === 'function') showModal(settingsModal);
        });

        var tileFullBackup = mc.querySelector('#dm-tile-full-backup');
        if (tileFullBackup) tileFullBackup.addEventListener('click', function () { openDrawer('dm-drawer-full'); });

        var tileChatBackup = mc.querySelector('#dm-tile-chat-backup');
        if (tileChatBackup) tileChatBackup.addEventListener('click', function () { openDrawer('dm-drawer-chat'); });

        var fullDrawer = document.getElementById('dm-drawer-full');
        if (fullDrawer) {
            var backdrop1 = fullDrawer.querySelector('#dm-drawer-full-backdrop');
            if (backdrop1) backdrop1.addEventListener('click', function () { closeDrawer('dm-drawer-full'); });
            var cancelBtn1 = fullDrawer.querySelector('#dm-drawer-full-cancel');
            if (cancelBtn1) cancelBtn1.addEventListener('click', function () { closeDrawer('dm-drawer-full'); });
            var exportAllReal = fullDrawer.querySelector('#export-all-settings-real');
            if (exportAllReal) exportAllReal.addEventListener('click', function () {
                closeDrawer('dm-drawer-full');
                if (typeof exportAllData === 'function') exportAllData();
            });
            var importAllReal = fullDrawer.querySelector('#import-all-settings-real');
            if (importAllReal) importAllReal.addEventListener('click', function () {
                closeDrawer('dm-drawer-full');
                var inp = document.createElement('input');
                inp.type = 'file'; inp.accept = '.json,.zip,application/json,application/zip';
                inp.onchange = function (e) {
                    var f = e.target.files && e.target.files[0];
                    if (f && typeof importAllData === 'function') importAllData(f);
                };
                inp.click();
            });
        }

        var chatDrawer = document.getElementById('dm-drawer-chat');
        if (chatDrawer) {
            var backdrop2 = chatDrawer.querySelector('#dm-drawer-chat-backdrop');
            if (backdrop2) backdrop2.addEventListener('click', function () { closeDrawer('dm-drawer-chat'); });
            var cancelBtn2 = chatDrawer.querySelector('#dm-drawer-chat-cancel');
            if (cancelBtn2) cancelBtn2.addEventListener('click', function () { closeDrawer('dm-drawer-chat'); });
            var exportChatReal = chatDrawer.querySelector('#export-chat-btn-real');
            if (exportChatReal) exportChatReal.addEventListener('click', function () {
                closeDrawer('dm-drawer-chat');
                if (typeof exportChatHistory === 'function') exportChatHistory();
            });
            var importChatReal = chatDrawer.querySelector('#import-chat-btn-real');
            if (importChatReal) importChatReal.addEventListener('click', function () {
                closeDrawer('dm-drawer-chat');
                var inp = document.createElement('input');
                inp.type = 'file'; inp.accept = '.json';
                inp.onchange = function (e) {
                    var f = e.target.files && e.target.files[0];
                    if (f && typeof importChatHistory === 'function') importChatHistory(f);
                };
                inp.click();
            });
        }

        var clearChatBtn = mc.querySelector('#clear-chat-only');
        if (clearChatBtn) clearChatBtn.addEventListener('click', function () {
            if (!confirm('确定要清除当前会话的所有消息吗？\n\n所有设置、头像、字卡等数据将保留，仅聊天记录会被删除。\n\n此操作无法恢复！')) return;
            // 修复：直接赋值 let messages（window.messages 赋值不影响 let 绑定）
            messages = [];
            displayedMessageCount = typeof HISTORY_BATCH_SIZE !== 'undefined' ? HISTORY_BATCH_SIZE : 20;
            try { localStorage.removeItem('BACKUP_V1_critical'); } catch(e) {}
            try { localStorage.removeItem('BACKUP_V1_timestamp'); } catch(e) {}
            if (window.localforage && typeof getStorageKey === 'function') {
                localforage.setItem(getStorageKey('chatMessages'), []).catch(function() {});
            }
            if (typeof renderMessages === 'function') renderMessages();
            if (typeof showNotification === 'function') showNotification('聊天记录已清除', 'success');
        });

        var clearBtn = mc.querySelector('#clear-storage');
        if (clearBtn) clearBtn.addEventListener('click', function () {
            if (!confirm('⚠️ 确定要清空全部数据吗？\n\n所有消息、设置、字卡、头像等将被永久删除，不可恢复！')) return;
            if (!confirm('最后确认：清空后页面将自动刷新，无法撤销，继续吗？')) return;
            window._skipBackup = true;
            var doReset = function () {
                localStorage.clear();
                if (typeof showNotification === 'function') showNotification('所有数据已清空，即将刷新…', 'info', 2000);
                setTimeout(function () { window.location.href = window.location.pathname + '?reset=' + Date.now(); }, 2000);
            };
            window.localforage ? localforage.clear().then(doReset).catch(doReset) : doReset();
        });

        var exportAll = mc.querySelector('#export-all-settings');
        if (exportAll) exportAll.addEventListener('click', function () {
            if (typeof exportAllData === 'function') exportAllData();
        });

        var importAll = mc.querySelector('#import-all-settings');
        if (importAll) importAll.addEventListener('click', function () {
            var inp = document.createElement('input');
            inp.type = 'file'; inp.accept = '.json,.zip,application/json,application/zip';
            inp.onchange = function (e) {
                var f = e.target.files && e.target.files[0];
                if (f && typeof importAllData === 'function') importAllData(f);
            };
            inp.click();
        });

        var exportChat = mc.querySelector('#export-chat-btn');
        if (exportChat) exportChat.addEventListener('click', function () {
            if (typeof exportChatHistory === 'function') exportChatHistory();
        });

        var importChat = mc.querySelector('#import-chat-btn');
        if (importChat) importChat.addEventListener('click', function () {
            var inp = document.createElement('input');
            inp.type = 'file'; inp.accept = '.json';
            inp.onchange = function (e) {
                var f = e.target.files && e.target.files[0];
                if (f && typeof importChatHistory === 'function') importChatHistory(f);
            };
            inp.click();
        });

        var creditsBtn = mc.querySelector('#open-credits-btn');
        if (creditsBtn) creditsBtn.addEventListener('click', function () {
            var dataModal = document.getElementById('data-modal');
            if (dataModal && typeof hideModal === 'function') hideModal(dataModal);
            var disc = document.getElementById('disclaimer-modal');
            if (disc && typeof showModal === 'function') showModal(disc);
        });

        var tutorialBtn = mc.querySelector('#replay-tutorial-btn');
        if (tutorialBtn) tutorialBtn.addEventListener('click', function () {
            var dataModal = document.getElementById('data-modal');
            if (dataModal && typeof hideModal === 'function') hideModal(dataModal);
            if (typeof startTour === 'function') {
                if (window.localforage && window.APP_PREFIX) {
                    localforage.removeItem(APP_PREFIX + 'tour_seen').then(startTour).catch(startTour);
                } else { startTour(); }
            }
        });
    }

    function onModalOpen(modal) {
        var mc = modal.querySelector('.modal-content');
        if (!mc) return;
        ensureHTML(mc);
        requestAnimationFrame(function () {
            mc.style.opacity = '1';
            mc.style.transform = 'none';
        });
        setTimeout(function () {
            updateStats();
            syncToggles();
        }, 60);
    }

    var _styleObserver = null;
    var _contentObserver = null;

    function init() {
        var modal = document.getElementById('data-modal');
        if (!modal) return;

        var mc = modal.querySelector('.modal-content');
        if (mc) mc.dataset.dm6Built = 'v9';

        if (_styleObserver) { _styleObserver.disconnect(); _styleObserver = null; }
        if (_contentObserver) { _contentObserver.disconnect(); _contentObserver = null; }

        _styleObserver = new MutationObserver(function () {
            var d = modal.style.display;
            if (d === 'flex' || d === 'block') onModalOpen(modal);
        });
        _styleObserver.observe(modal, { attributes: true, attributeFilter: ['style'] });

        if (mc) {
            _contentObserver = new MutationObserver(function () {
                var mc2 = modal.querySelector('.modal-content');
                if (mc2 && !isCorrect(mc2)) {
                    mc2.dataset.dm6Built = 'v9';
                    writeHTML(mc2);
                }
            });
            _contentObserver.observe(mc, { childList: true, subtree: false });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); });
    } else {
        init();
    }

})();

function updateStorageUsageBar() {
    var bar   = document.getElementById('dm-storage-bar')   || document.getElementById('storage-usage-fill');
    var text  = document.getElementById('dm-storage-total') || document.getElementById('storage-usage-text');
    if (!bar && !text) return;

    try {
        if (window.localforage && window.APP_PREFIX) {
            localforage.keys().then(function(keys) {
                var promises = keys.map(function(k) {
                    return localforage.getItem(k).then(function(v) {
                        if (v === null || v === undefined) return 0;
                        var str = typeof v === 'string' ? v : JSON.stringify(v);
                        return (k.length + str.length) * 2;
                    });
                });
                Promise.all(promises).then(function(sizes) {
                    var total   = sizes.reduce(function(a,b){return a+b;},0);
                    var usedKB  = (total / 1024).toFixed(1);
                    var maxBytes = 2 * 1024 * 1024 * 1024;
                    var pct     = Math.min(total / maxBytes * 100, 100).toFixed(1);
                    var fmt     = function(b) { return b<1024 ? b+' B' : b<1048576 ? (b/1024).toFixed(1)+' KB' : (b/1048576).toFixed(2)+' MB'; };

                    if (bar) {
                        bar.style.width = Math.max(parseFloat(pct), 0.8) + '%';
                        if (parseFloat(pct) > 80)
                            bar.style.background = 'linear-gradient(90deg,#FF3B30,#CC0000)';
                        else if (parseFloat(pct) > 50)
                            bar.style.background = 'linear-gradient(90deg,#FF9F0A,#E07000)';
                        else
                            bar.style.background = 'linear-gradient(90deg,var(--accent-color),rgba(var(--accent-color-rgb),0.6))';
                    }
                    if (text) text.textContent = fmt(total) + ' / 2 GB (' + pct + '%)';
                });
            }).catch(function() {
                var ls = 0;
                for (var i = 0; i < localStorage.length; i++) {
                    var k = localStorage.key(i) || '';
                    var v = localStorage.getItem(k) || '';
                    ls += (k.length + v.length) * 2;
                }
                var pct = Math.min(ls / (5*1024*1024) * 100, 100).toFixed(1);
                if (bar) bar.style.width = pct + '%';
                if (text) text.textContent = (ls/1024).toFixed(1) + ' KB (localStorage)';
            });
        } else {
            if (text) text.textContent = '暂无数据';
            if (bar)  bar.style.width  = '0%';
        }
    } catch(e) {
        if (text) text.textContent = '无法读取';
    }
}

(function() {
    var orig = window.showModal;
    if (typeof orig === 'function') {
        window.showModal = function(el) {
            orig.apply(this, arguments);
            if (el && el.id === 'data-modal') {
                setTimeout(updateStorageUsageBar, 250);
            }
            if (el && el.id === 'custom-replies-modal') {
                try { currentMajorTab = 'reply'; currentSubTab = 'custom'; } catch (e) {}
                setTimeout(function () { if (typeof renderReplyLibrary === 'function') renderReplyLibrary(); }, 40);
            }
            if (el && el.id === 'mood-modal') {
                setTimeout(function () { try { if (window.V8 && window.V8.MoodJournal) window.V8.MoodJournal.paint(); } catch (e) {} }, 40);
            }
        };
    }
})();

document.addEventListener('DOMContentLoaded', function() {
    var btn = document.getElementById('data-settings');
    if (btn) {
        btn.addEventListener('click', function() { setTimeout(updateStorageUsageBar, 350); });
    }
});

/* ------------------------------------------------------------
   后台消息推送：系统通知不可用时自动降级为「站内提醒」
   （标题闪烁 + 站内横幅），保证开关一定能打开 / 关闭
   ------------------------------------------------------------ */
var _notifOrigTitle = null, _notifBlink = null;
function restoreNotifTitle() {
    try {
        if (_notifBlink) { clearInterval(_notifBlink); _notifBlink = null; }
        if (_notifOrigTitle !== null) { document.title = _notifOrigTitle; _notifOrigTitle = null; }
    } catch (e) {}
}
document.addEventListener('visibilitychange', function () { if (!document.hidden) restoreNotifTitle(); });

function inPageNotify(title, body) {
    try {
        var t = title || '传讯', b = body || '对方发来了消息';
        if (!document.hidden) {
            if (typeof showNotification === 'function') showNotification(t + '：' + b, 'info', 4500);
            return;
        }
        if (_notifOrigTitle === null) _notifOrigTitle = document.title;
        if (_notifBlink) clearInterval(_notifBlink);
        var flip = false;
        _notifBlink = setInterval(function () {
            document.title = (flip = !flip) ? '【新消息】' + t : _notifOrigTitle;
        }, 900);
    } catch (e) {}
}

window._sendPartnerNotification = function (title, body) {
    try {
        if (localStorage.getItem('notifEnabled') !== '1') return;
        var mode = localStorage.getItem('notifMode') || 'inpage';
        if (mode === 'system' && ('Notification' in window) && Notification.permission === 'granted' && document.hidden) {
            var opts = {
                body: body || '对方发来了消息',
                icon: (document.querySelector('#partner-avatar img') || {}).src,
                tag: 'partner-msg',
                renotify: true
            };
            var t = title || '传讯';
            var timer = null, done = false;
            var fallback = function () {
                if (done) return;
                done = true;
                if (timer) clearTimeout(timer);
                try { new Notification(t, opts); } catch (e) {}
            };
            // 优先走 Service Worker：通知更可能进入系统通知栏 / 锁屏；不可用时回退网页通知
            try {
                if (navigator.serviceWorker && navigator.serviceWorker.ready) {
                    timer = setTimeout(fallback, 1200);
                    navigator.serviceWorker.ready.then(function (reg) {
                        return reg.showNotification(t, opts);
                    }).then(function () {
                        if (!done) { done = true; if (timer) clearTimeout(timer); }
                    }).catch(fallback);
                } else {
                    fallback();
                }
            } catch (e) { fallback(); }
        }
        inPageNotify(title, body);   // 站内兜底，任何浏览器都生效
    } catch (e) {}
};

function updateNotifStatus() {
    var statusEl = document.getElementById('notif-status-text');
    if (!statusEl) return;
    if (localStorage.getItem('notifEnabled') !== '1') {
        statusEl.textContent = '关闭状态 — 开启后可在后台接收消息提醒';
        return;
    }
    var mode = localStorage.getItem('notifMode') || 'inpage';
    var granted = ('Notification' in window) && Notification.permission === 'granted';
    if (mode === 'system' && granted) {
        statusEl.textContent = '✅ 已开启 — 后台会弹出系统通知';
    } else {
        statusEl.textContent = '✅ 已开启 — 站内提醒（横幅 + 标签页标题闪烁）';
    }
}

var _notifReqToken = 0;

window.handleNotifToggle = function (checkbox) {
    var enabled = !!checkbox.checked;
    _notifReqToken++;
    var token = _notifReqToken;

    if (!enabled) {
        localStorage.setItem('notifEnabled', '0');
        restoreNotifTitle();
        updateNotifStatus();
        return;
    }

    // 先让它立刻生效：点一下就算开启，系统权限只决定「用哪种方式提醒」
    localStorage.setItem('notifEnabled', '1');
    if (!localStorage.getItem('notifMode')) localStorage.setItem('notifMode', 'inpage');
    updateNotifStatus();

    // 关键：无论系统权限结果如何，开关都保持打开；拿不到权限就走站内提醒
    function finish(granted) {
        if (token !== _notifReqToken) return;   // 期间被关掉或重开，本次回调作废
        localStorage.setItem('notifEnabled', '1');
        localStorage.setItem('notifMode', granted ? 'system' : 'inpage');
        if (granted) {
            try { new Notification('传讯通知已开启 ✨', { body: '你现在可以在后台收到消息提醒了', tag: 'notif-test' }); } catch (e) {}
        }
        checkbox.checked = true;
        updateNotifStatus();
        if (typeof showNotification === 'function') {
            showNotification(granted ? '已开启后台系统通知' : '已开启站内提醒（此浏览器不支持系统通知）', 'success', 3000);
        }
    }

    if (!('Notification' in window)) { finish(false); return; }
    if (Notification.permission === 'granted') { finish(true); return; }
    if (Notification.permission === 'denied') { finish(false); return; }

    // 只在用户点击开关的这个手势里申请权限（兼容 Promise / 老式回调 / 无返回三种实现）
    var done = false;
    function once(perm) {
        if (done) return;
        done = true;
        finish(perm === 'granted');
    }
    try {
        var r = Notification.requestPermission();
        if (r && typeof r.then === 'function') { r.then(once, function () { once('denied'); }); }
    } catch (e) {
        try { Notification.requestPermission(once); } catch (e2) { once('denied'); }
    }
    // 某些内核既不回调也不返回 Promise：超时后按权限现状收尾，绝不把开关弹回去
    setTimeout(function () {
        if (done) return;
        try { once(Notification.permission === 'granted' ? 'granted' : 'default'); }
        catch (e) { once('default'); }
    }, 2500);
};

document.addEventListener('DOMContentLoaded', function () {
    var toggle = document.getElementById('notif-permission-toggle');
    if (toggle) toggle.checked = localStorage.getItem('notifEnabled') === '1';
    updateNotifStatus();
});
