/* ============================================================
   social-ext.js —— 第二阶段补齐
   1) 群治理：踢人需同意 / 禁言(<=3h·可申请解除·梦角互禁) / 梦角建群邀请我需我同意
   2) 朋友圈：我 + 梦角A + 梦角B 三方互通，可互赞互评；我不能替梦角发
   3) 一起听：真实可播放的播放器（Web Audio 合成 + 可粘贴音频直链）
   原则：主界面布局零改动，所有界面都在原有弹层内；每条世界线数据独立。
   ============================================================ */
(function () {
    'use strict';

    const P  = () => { try { return APP_PREFIX || 'CHAT_APP_V3_'; } catch (e) { return 'CHAT_APP_V3_'; } };
    const sid = () => { try { return SESSION_ID || null; } catch (e) { return null; } };
    const K  = b => P() + (sid() || '0') + '_' + b;      // 按世界线隔离
    const GK = b => P() + b;                              // 全局（朋友圈广场）
    const lf = (k, d) => localforage.getItem(k).then(v => (v === null || v === undefined) ? d : v).catch(() => d);
    const ls = (k, v) => localforage.setItem(k, v).catch(() => {});
    const now = () => Date.now();
    const toast = (m, t) => { try { if (typeof showNotification === 'function') showNotification(m, t || 'success'); } catch (e) {} };
    const save = () => { try { if (typeof throttledSaveData === 'function') throttledSaveData(); } catch (e) {} };
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const myName = () => { try { return (settings && settings.myName) || '我'; } catch (e) { return '我'; } };
    const partnerName = () => { try { return (settings && settings.partnerName) || '梦角'; } catch (e) { return '梦角'; } };
    const hash = s => { let h = 0, t = String(s || ''); for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0; return h; };

    function contacts() {
        try { return (sessionList || []).filter(s => s.type !== 'group'); } catch (e) { return []; }
    }
    function curGroup() {
        try { return (sessionList || []).filter(s => s.id === SESSION_ID && s.type === 'group')[0] || null; } catch (e) { return null; }
    }
    function members() {
        try {
            if (typeof groupChatSettings !== 'undefined' && groupChatSettings.members) return groupChatSettings.members;
        } catch (e) {}
        return [];
    }
    function memberKey(m) { return m ? (m.id || m.name) : ''; }
    function memberName(m) { return m ? (m.name || '成员') : '成员'; }
    function fmtLeft(ms) {
        if (ms <= 0) return '已到期';
        const m = Math.ceil(ms / 60000);
        if (m < 60) return m + ' 分钟';
        const h = Math.floor(m / 60), r = m % 60;
        return h + ' 小时' + (r ? ' ' + r + ' 分' : '');
    }
    function defaultGroupSession() {
        try {
            const g = (sessionList || []).filter(s => s.id === SESSION_ID && s.type === 'group')[0];
            return g ? g.id : null;
        } catch (e) { return null; }
    }
    function sysCard(html, session) {
        try {
            const text = '<div class="gx-sys">' + html + '</div>';
            const id = 'gx-' + now() + '-' + Math.floor(Math.random() * 1000);
            if (window.V12 && window.V12.route) {
                window.V12.route(session === undefined ? defaultGroupSession() : session, text, id);
                save();
            } else if (typeof addMessage === 'function') {
                addMessage({ id: id, sender: null, type: 'system', text: text, timestamp: new Date() });
                save();
            }
        } catch (e) {}
    }
    function openModal(id) {
        const el = document.getElementById(id);
        if (!el) return;
        try { if (typeof showModal === 'function') showModal(el); else el.classList.add('active'); } catch (e) { el.classList.add('active'); }
    }

    /* ============================================================
       开箱可用：首次进入某条世界线时，补一份默认回复库
       （原站默认是空库，发消息没人回，会被误认为"坏了"）
       ============================================================ */
    const DEFAULT_REPLIES = [
        '嗯，我在。',
        '你说，我听着。',
        '刚刚也想跟你说这个。',
        '好呀。',
        '怎么了？慢慢说。',
        '我在呢，别急。',
        '今天过得怎么样？',
        '看到你消息就笑了。',
        '好，听你的。',
        '嗯嗯。',
        '这个我记得。',
        '要不要说说细节？',
        '我在想你说的那句话。',
        '有点想你。',
        '早点休息，别熬太晚。',
        '刚忙完，回你晚了。',
        '那就这样定了。',
        '你说的我都信。',
        '抱一下。',
        '我在，不走。'
    ];
    async function ensureReplyPool() {
        try {
            const key = P() + 'GLOBAL_customReplies';   // 与 core.js 的全局素材库一致
            const cur = await lf(key, null);
            if (Array.isArray(cur) && cur.length) return;
            await ls(key, DEFAULT_REPLIES.slice());
            try { if (typeof customReplies !== 'undefined' && Array.isArray(customReplies)) customReplies = DEFAULT_REPLIES.slice(); } catch (e) {}
        } catch (e) {}
    }

    /* ============================================================
       一、群治理数据
       ============================================================ */
    let gov = { mutes: {}, pending: [] };
    const govKey = () => K('groupGov');
    async function loadGov() {
        const d = await lf(govKey(), null);
        gov = (d && typeof d === 'object') ? d : { mutes: {}, pending: [] };
        if (!gov.mutes || typeof gov.mutes !== 'object') gov.mutes = {};
        if (!Array.isArray(gov.pending)) gov.pending = [];
        sweep();
    }
    function saveGov() { ls(govKey(), gov); }
    function sweep() {
        let changed = false;
        Object.keys(gov.mutes).forEach(k => { if (!gov.mutes[k] || gov.mutes[k].until <= now()) { delete gov.mutes[k]; changed = true; } });
        const before = gov.pending.length;
        gov.pending = gov.pending.filter(p => p && p.state === 'waiting' && (now() - (p.createdAt || 0) < 6 * 3600 * 1000));
        if (gov.pending.length !== before) changed = true;
        if (changed) saveGov();
    }
    function isMuted(key) { const m = gov.mutes[key]; return !!(m && m.until > now()); }
    function muteInfo(key) { return gov.mutes[key] || null; }
    function setMute(key, name, minutes, by) {
        const mins = Math.max(1, Math.min(180, Number(minutes) || 10));   // 最长 3 小时
        gov.mutes[key] = { name: name, until: now() + mins * 60000, by: by || myName(), minutes: mins };
        saveGov();
        return mins;
    }
    function unMute(key) { delete gov.mutes[key]; saveGov(); }
    function addPending(type, payload) {
        const p = Object.assign({ id: 'q' + now() + Math.floor(Math.random() * 1000), type: type, state: 'waiting', createdAt: now() }, payload || {});
        gov.pending.push(p);
        saveGov();
        return p;
    }
    function resolvePending(id, agree) {
        const p = gov.pending.filter(x => x.id === id)[0];
        if (!p) return null;
        p.state = agree ? 'agreed' : 'rejected';
        gov.pending = gov.pending.filter(x => x.id !== id);
        saveGov();
        return p;
    }

    /* --- 让禁言真正生效：过滤群发言人；全员禁言时抑制接话 --- */
    function installMuteHooks() {
        try {
            if (typeof window.getGroupMemberForMessage === 'function' && !window.__gxGMM) {
                const orig = window.getGroupMemberForMessage;
                window.__gxGMM = true;
                window.getGroupMemberForMessage = function (msgId) {
                    const base = orig(msgId);
                    const ms = members();
                    if (!ms.length) return base;
                    const active = ms.filter(m => !isMuted(memberKey(m)));
                    if (!active.length) return null;
                    if (base && isMuted(memberKey(base))) return active[hash(msgId) % active.length];
                    return base;
                };
            }
        } catch (e) {}
        try {
            if (typeof window.simulateReply === 'function' && !window.__gxReply) {
                const orig = window.simulateReply;
                window.__gxReply = true;
                window.simulateReply = function () {
                    try {
                        if (curGroup()) {
                            sweep();
                            const ms = members();
                            if (ms.length && !ms.some(m => !isMuted(memberKey(m)))) {
                                toast('群里大家都还在禁言中，暂时没人接话', 'info');
                                return;
                            }
                        }
                    } catch (e) {}
                    return orig.apply(this, arguments);
                };
            }
        } catch (e) {}
    }

    /* --- 移出成员：需本人同意 --- */
    function requestKick(m) {
        const key = memberKey(m), name = memberName(m);
        const p = addPending('kick', { targetId: key, targetName: name, by: myName() });
        sysCard('<b>移出群聊</b>：已向 ' + esc(name) + ' 发出移出请求，等 TA 点头才会生效。<span class="gx-tip">需本人同意</span>');
        toast('已发出移出请求，等待 ' + name + ' 同意');
        // 对方几秒后答复
        setTimeout(async () => {
            const q = gov.pending.filter(x => x.id === p.id)[0];
            if (!q) return;
            const agree = Math.random() < 0.85;
            resolvePending(p.id, agree);
            if (agree) {
                try {
                    groupChatSettings.members = members().filter(x => memberKey(x) !== key);
                    if (typeof saveGroupChatSettings === 'function') saveGroupChatSettings();
                    if (typeof renderGroupMembersList === 'function') renderGroupMembersList();
                    const g = curGroup();
                    if (g && Array.isArray(g.members)) g.members = g.members.filter(id => id !== key);
                    try { save(); } catch (e) {}
                } catch (e) {}
                sysCard(esc(name) + ' 同意了，已退出群聊。');
                toast(name + ' 已退出群聊');
            } else {
                sysCard(esc(name) + ' 没同意移出，还留在群里。');
                toast(name + ' 暂时不想退群', 'warning');
            }
            renderManage();
        }, 3000 + Math.random() * 4000);
        renderManage();
    }

    /* --- 禁言 --- */
    function showMuteSheet(m) {
        const key = memberKey(m), name = memberName(m);
        let box = document.getElementById('gx-mute-sheet');
        if (!box) {
            box = document.createElement('div');
            box.id = 'gx-mute-sheet';
            box.className = 'gx-sheet';
            document.body.appendChild(box);
        }
        box.innerHTML = '<div class="gx-sheet-mask" data-gx-cancel></div><div class="gx-sheet-body">'
            + '<div class="gx-sheet-title">禁言 ' + esc(name) + '</div>'
            + '<div class="gx-sheet-tip">最长 3 小时。被禁言的人可以「申请解除」，由你决定是否提前放出来。</div>'
            + '<div class="gx-dur">'
            + [[10, '10 分钟'], [30, '30 分钟'], [60, '1 小时'], [180, '3 小时']].map((d, i) =>
                '<button class="gx-dur-btn ' + (i === 0 ? 'on' : '') + '" data-gx-dur="' + d[0] + '">' + d[1] + '</button>').join('')
            + '</div>'
            + '<div class="gx-sheet-btns"><button class="modal-btn modal-btn-secondary" data-gx-cancel>取消</button>'
            + '<button class="modal-btn modal-btn-primary" id="gx-mute-ok">确定禁言</button></div></div>';
        box.classList.add('active');
        let dur = 10;
        box.querySelectorAll('[data-gx-dur]').forEach(b => b.onclick = () => {
            dur = Number(b.dataset.gxDur);
            box.querySelectorAll('[data-gx-dur]').forEach(x => x.classList.remove('on'));
            b.classList.add('on');
        });
        box.querySelectorAll('[data-gx-cancel]').forEach(b => b.onclick = () => box.classList.remove('active'));
        const ok = box.querySelector('#gx-mute-ok');
        if (ok) ok.onclick = () => {
            const mins = setMute(key, name, dur, myName());
            box.classList.remove('active');
            sysCard('<b>禁言</b>：' + esc(name) + ' 被禁言 ' + mins + ' 分钟（由 ' + esc(myName()) + ' 设置）。<span class="gx-tip">最长 3 小时</span>');
            toast(name + ' 已禁言 ' + mins + ' 分钟');
            // 被禁言者过一会儿来申请解除
            setTimeout(() => {
                if (!isMuted(key)) return;
                addPending('unmute', { targetId: key, targetName: name, by: name });
                sysCard(esc(name) + ' 申请解除禁言，等你决定。<div class="gx-acts">'
                    + '<button class="gx-pbtn" data-gx-ok="' + esc(name) + '" data-gx-key="' + esc(key) + '">同意解除</button>'
                    + '<button class="gx-pbtn ghost" data-gx-no="' + esc(key) + '">先驳回</button></div>');
                renderManage();
            }, 5000 + Math.random() * 4000);
            renderManage();
        };
    }

    /* v20-5：他们禁言了某人，我申请解除，得由当初禁言他的人同意；
       申请与「同意/拒绝了禁言申请」都按标准文案显示在群聊里。 */
    function requestUnmute(key) {
        const mi = muteInfo(key);
        if (!mi) { toast('这条禁言已经到期了', 'warning'); return; }
        const name = mi.name || '这位成员';
        const by = mi.by || '禁言 TA 的人';
        const gid = (curGroup() || {}).id || defaultGroupSession() || '';
        if (window.V8 && window.V8.Consent) {
            window.V8.Consent.ask({
                kind: 'groupUnmute', title: '申请解除 ' + name + ' 的禁言',
                detail: '需 ' + by + ' 同意', by: myName(), from: 'me',
                cid: gid, session: gid, replySession: gid,
                notice: myName() + ' 申请解除 ' + name + ' 的禁言，等待 ' + by + ' 同意',
                agreeText: by + ' 同意了禁言申请',
                denyText: by + ' 拒绝了禁言申请',
                payload: { kind: 'unmuteReq', scope: 'gx', key: key },
                apply: () => {
                    unMute(key);
                    sysCard('<b>解除禁言</b>：' + esc(name) + ' 的禁言已解除。', gid);
                    renderManage();
                }
            });
        } else {
            unMute(key);
            sysCard('禁言已解除。', gid);
        }
        toast('已发出解除禁言申请，等待 ' + by + ' 同意');
        renderManage();
    }

    /* --- 梦角之间的自动事件：互禁 / 踢我 / 邀请我建群 --- */
    function randomGroupEvent(force) {
        const inG = curGroup();
        const g = inG || (function () { try { return (sessionList || []).filter(s => s.type === 'group')[0] || null; } catch (e) { return null; } })();
        if (!g && !force) return;
        const ms = members();
        const r = Math.random();
        /* v12：群里的消息只进群聊；邀请我进群要分清是私发还是在群里说 */
        const channel = inG ? '群里说的' : '私聊里发给我';
        const session = inG ? inG.id : (typeof SESSION_ID !== 'undefined' ? SESSION_ID : null);
        if (r < 0.4 && ms.length >= 2 && inG) {
            // 梦角互禁（只发生在群聊里，只写群聊）
            const a = ms[Math.floor(Math.random() * ms.length)];
            const pool = ms.filter(x => memberKey(x) !== memberKey(a));
            const b = pool[Math.floor(Math.random() * pool.length)];
            const mins = [10, 30, 60][Math.floor(Math.random() * 3)];
            setMute(memberKey(b), memberName(b), mins, memberName(a));
            sysCard('<b>群里</b>：' + esc(memberName(a)) + ' 把 ' + esc(memberName(b)) + ' 禁言了 ' + mins + ' 分钟。<span class="gx-tip">梦角之间也可互禁</span>', inG.id);
            toast(memberName(a) + ' 禁言了 ' + memberName(b));
        } else if (r < 0.7 && inG) {
            // 他要把我踢出群 —— 需我确认（群聊里）
            const by = ms.length ? memberName(ms[Math.floor(Math.random() * ms.length)]) : partnerName();
            const p = addPending('kickMe', { by: by, groupName: inG.name });
            sysCard('<b>' + esc(by) + '</b> 想把你移出群「' + esc(inG.name) + '」，需要你本人同意。<div class="gx-acts">'
                + '<button class="gx-pbtn" data-gx-agree="' + p.id + '">同意</button>'
                + '<button class="gx-pbtn ghost" data-gx-reject="' + p.id + '">不同意</button></div>', inG.id);
            toast(by + ' 发起移出你的请求');
        } else {
            /* v20-4/12：邀请进群一律只私发，落在某个私聊会话里，不在群里发 */
            const cs = contacts();
            const by = cs.length ? cs[Math.floor(Math.random() * cs.length)].name : partnerName();
            const gname = ['三人的小屋', '一起碎碎念', '今晚聊点什么', '我们的小群'][Math.floor(Math.random() * 4)];
            const inviteSession = (cs.length ? cs[0].id : null) || sid() || '';
            if (window.V8 && window.V8.Consent) {
                const newId = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                window.V8.Consent.ask({
                    kind: 'groupInviteMe', title: by + ' 邀请我加入群「' + gname + '」',
                    detail: '来自私聊邀请',
                    by: by, from: 'them', cid: inviteSession,
                    session: inviteSession, replySession: inviteSession,
                    payload: { gid: newId, gname: gname, members: cs.slice(0, 3).map(x => x.id) },
                    apply: () => {
                        try {
                            const has = (sessionList || []).some(x => x.id === newId);
                            if (!has) {
                                sessionList.push({ id: newId, name: gname, type: 'group', members: cs.slice(0, 3).map(x => x.id), owner: 'them', createdAt: now() });
                                localforage.setItem(P() + 'sessionList', sessionList);
                            }
                            /* v20-10：同意后只加入群，不自动跳转，不会串到别的群的消息 */
                            if (window.HomeExt && window.HomeExt.refreshGroupList) window.HomeExt.refreshGroupList();
                        } catch (e) {}
                    }
                });
            } else {
                const p = addPending('inviteMe', { by: by, groupName: gname, session: inviteSession, channel: '私聊里发给我' });
                sysCard('<b>' + esc(by) + '</b> 建了群「' + esc(gname) + '」并邀请你加入（私聊里发给我），等你点头。<div class="gx-acts">'
                    + '<button class="gx-pbtn" data-gx-agree="' + p.id + '">同意加入</button>'
                    + '<button class="gx-pbtn ghost" data-gx-reject="' + p.id + '">先不了</button></div>', inviteSession);
            }
            toast(by + ' 私聊邀请你进群');
        }
        renderManage();
    }

    function handlePending(p, agree) {
        resolvePending(p.id, agree);
        try {
            document.querySelectorAll('[data-gx-agree="' + p.id + '"], [data-gx-reject="' + p.id + '"]').forEach(btn => {
                const box = btn.closest('.gx-acts');
                if (box) box.innerHTML = '<span class="gx-pdone">' + (agree ? '已同意' : '已拒绝') + '</span>';
            });
        } catch (e) {}
        if (p.type === 'unmute') { /* 由单独按钮处理 */ }
        /* v21-3：邀请 / 结果卡片一律写回它自己那个会话，不落到当前其它聊天 */
        const pSess = p.session || defaultGroupSession() || (typeof SESSION_ID !== 'undefined' ? SESSION_ID : null);
        if (p.type === 'kickMe') {
            if (agree) {
                sysCard('你同意了，已退出群「' + esc(p.groupName || '') + '」。', pSess);
                toast('已退出群聊');
                const c = contacts()[0];
                if (c) setTimeout(() => { try { location.hash = c.id; location.reload(); } catch (e) {} }, 700);
            } else {
                sysCard('你没同意，还留在群里。', pSess);
                toast('已保留在群里');
            }
        } else if (p.type === 'inviteMe') {
            if (agree) {
                const cs = contacts();
                const picked = cs.slice(0, 3).map(x => x.id);
                const newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
                try {
                    sessionList.push({ id: newId, name: p.groupName || '新群', type: 'group', members: picked, owner: 'them', createdAt: now() });
                    localforage.setItem(P() + 'sessionList', sessionList);
                } catch (e) {}
                sysCard('你同意了，已加入群「' + esc(p.groupName || '') + '」。', pSess);
                toast('已加入群聊');
                /* v20-10：同意后不自动跳到新群，留在刚才的会话 */
                try { if (window.HomeExt && window.HomeExt.refreshGroupList) window.HomeExt.refreshGroupList(); } catch (e) {}
            } else {
                sysCard('你婉拒了 ' + esc(p.by) + ' 的邀请。', pSess);
                toast('已婉拒邀请');
            }
        } else if (p.type === 'kick') {
            sysCard(agree ? '移出生效。' : '移出被撤销。', pSess);
        }
        renderManage();
    }

    /* --- 本群管理视图 --- */
    function renderManage() {
        const view = document.getElementById('gm-view-manage');
        if (!view) return;
        sweep();
        const g = curGroup();
        const ms = members();
        const waiting = gov.pending.slice();

        let h = '';

        h += '<div class="gm-label"><i class="fas fa-users"></i> 群成员 <span>' + (ms.length + 1) + ' 人</span></div>';
        h += '<div class="gm-members">';
        h += '<div class="gm-member"><div class="gm-mav me">' + esc(myName().slice(0, 1)) + '</div>'
            + '<div class="gm-minfo"><div class="gm-mname">' + esc(myName()) + ' <span class="gm-tag me">我</span></div>'
            + '<div class="gm-msub">群主</div></div></div>';
        ms.forEach(m => {
            const key = memberKey(m), name = memberName(m);
            const mi = isMuted(key) ? muteInfo(key) : null;
            const av = m.avatar ? '<img src="' + esc(m.avatar) + '" alt="">' : esc(name.slice(0, 1));
            h += '<div class="gm-member">'
                + '<div class="gm-mav ' + (mi ? 'muted' : '') + '">' + av + '</div>'
                + '<div class="gm-minfo"><div class="gm-mname">' + esc(name) + (mi ? ' <span class="gm-tag mute">禁言 ' + esc(fmtLeft(mi.until - now())) + '</span>' : '') + '</div>'
                + '<div class="gm-msub">' + (mi ? '由 ' + esc(mi.by) + ' 设置 · ' + mi.minutes + ' 分钟' : '可以发言') + '</div></div>'
                + '<div class="gm-mbtns">'
                + (mi ? '<button class="gm-mini" data-gx-unmute="' + esc(key) + '">申请解除</button>' : '<button class="gm-mini" data-gx-mute="' + esc(key) + '">禁言</button>')
                + '<button class="gm-mini danger" data-gx-kick="' + esc(key) + '">移出</button>'
                + '</div></div>';
        });
        h += '</div>';

        h += '<div class="gm-label"><i class="fas fa-user-plus"></i> 邀请谁</div>';
        h += '<div class="gm-invite" id="gm-invite">'
            + '<select class="modal-input" id="gm-invite-who" style="flex:1;min-width:0;">'
            + (function () {
                try {
                    const cs = (sessionList || []).filter(x => x.type !== 'group');
                    return cs.map(c => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('');
                } catch (e) { return ''; }
            })()
            + '</select><button class="modal-btn modal-btn-primary" id="gm-invite-btn" style="padding:7px 12px;font-size:12px;">邀请</button></div>';

        h += '<div class="gm-label"><i class="fas fa-inbox"></i> 待处理 <span>' + waiting.length + ' 条</span></div>';
        if (!waiting.length) {
            h += '<div class="gm-empty">暂时没有需要处理的请求。</div>';
        } else {
            waiting.forEach(p => {
                let desc = '';
                if (p.type === 'unmute') desc = esc(p.targetName) + ' 申请解除禁言';
                else if (p.type === 'kick') desc = '等待 ' + esc(p.targetName) + ' 同意移出';
                else if (p.type === 'kickMe') desc = esc(p.by) + ' 想把你移出群「' + esc(p.groupName) + '」';
                else if (p.type === 'inviteMe') desc = esc(p.by) + ' 邀请你加入「' + esc(p.groupName) + '」';
                const canMe = (p.type === 'kickMe' || p.type === 'inviteMe' || p.type === 'unmute');
                h += '<div class="gm-pending"><span>' + desc + '</span><div class="gm-pbtns">'
                    + (canMe
                        ? '<button class="gm-pbtn" data-gx-agree="' + p.id + '">同意</button><button class="gm-pbtn ghost" data-gx-reject="' + p.id + '">拒绝</button>'
                        : '<span class="gm-wait">等对方答复…</span>')
                    + '</div></div>';
            });
        }
        view.innerHTML = h;
        const invBtn = view.querySelector('#gm-invite-btn');
        if (invBtn) invBtn.onclick = () => {
            const sel = view.querySelector('#gm-invite-who');
            const id = sel && sel.value;
            if (!id) { toast('先在联系人里加一位', 'warning'); return; }
            const c = (sessionList || []).filter(x => x.id === id)[0] || { name: 'TA' };
            const g = curGroup();
            if (window.V8 && window.V8.Consent) {
                window.V8.Consent.ask({
                    kind: 'groupInvite', title: '邀请「' + c.name + '」进群「' + ((g && g.name) || '群聊') + '」',
                    detail: '来自本群管理', by: myName(), from: 'me',
                    apply: () => {
                        try {
                            const gg = curGroup();
                            if (gg && Array.isArray(gg.members) && gg.members.indexOf(id) < 0) gg.members.push(id);
                            if (typeof groupChatSettings !== 'undefined' && groupChatSettings.members) {
                                groupChatSettings.members.push({ name: c.name, id: id, avatar: c.avatar || null });
                                if (typeof saveGroupChatSettings === 'function') saveGroupChatSettings();
                            }
                            if (typeof save === 'function') save();
                        } catch (e) {}
                    }
                });
            }
            toast('已发出邀请，等对方同意');
        };
        const sim = view.querySelector('#gx-simulate');
        if (sim) sim.onclick = () => randomGroupEvent(true);
    }

    function switchTab(which) {
        const createV = document.getElementById('gm-view-create');
        const manageV = document.getElementById('gm-view-manage');
        const createBtn = document.getElementById('create-group-btn');
        document.querySelectorAll('.gm-tab').forEach(t => t.classList.toggle('active', t.dataset.gmtab === which));
        if (createV) createV.style.display = which === 'create' ? '' : 'none';
        if (manageV) manageV.style.display = which === 'manage' ? '' : 'none';
        if (createBtn) createBtn.style.display = which === 'create' ? '' : 'none';
        if (which === 'manage') renderManage();
    }

    /* ============================================================
       二、朋友圈：三方互通
       ============================================================ */
    /* ============================================================
       二、朋友圈：我的 / 每位梦角各自的主页 + 全部动态
       规则：
       - 名字一律用联系人里的真实备注名，不写死「梦角1 / 梦角2」
       - 封面：我只能更换「我的」；TA 的封面由 TA 自己设置，我无法替 TA 设置
       - 动态只在「他们自己发了」时才新增；点刷新不会凭空冒出新内容
       ============================================================ */
    const COVERS = [
        'vendor/covers/c1.jpg', 'vendor/covers/c2.jpg', 'vendor/covers/c3.jpg',
        'vendor/covers/c4.jpg', 'vendor/covers/c5.jpg', 'vendor/covers/c6.jpg'
    ];
    const POST_WORDS = [
        '晚霞很好看，拍下来了。', '刚泡了茶，坐一会儿。', '今天听到一首很喜欢的歌。',
        '把房间收拾了一下。', '窗外的风今天很轻。', '路过那家店，突然想起你。',
        '云像被谁揉过一样。', '今天想早点睡。'
    ];
    const fmtTime = ts => new Date(ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const pickOne = a => a[Math.floor(Math.random() * a.length)];
    const cssUrl = u => String(u == null ? '' : u).replace(/['"()\\\s]/g, m => encodeURIComponent(m));

    // 本地图片 -> 压缩后的 dataURL（与头像库同一套做法，不依赖外网）
    function shrinkImage(file, maxW) {
        return new Promise((resolve, reject) => {
            if (!/^image\//.test(file.type)) { reject(new Error('not image')); return; }
            const fr = new FileReader();
            fr.onerror = () => reject(new Error('read fail'));
            fr.onload = () => {
                const img = new Image();
                img.onerror = () => reject(new Error('decode fail'));
                img.onload = () => {
                    const scale = Math.min(1, maxW / img.width);
                    const c = document.createElement('canvas');
                    c.width = Math.max(1, Math.round(img.width * scale));
                    c.height = Math.max(1, Math.round(img.height * scale));
                    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                    resolve(c.toDataURL('image/jpeg', 0.82));
                };
                img.src = fr.result;
            };
            fr.readAsDataURL(file);
        });
    }

    const MF = {
        feed: [],
        covers: {},      // { id: url }  各人自己的封面
        coverBy: {},     // { id: 'me' | 'them' }  封面是谁设置的
        outbox: [],      // [{ due, author, text }] 梦角自己排好的「待发布」
        seeded: false,
        view: 'all',     // 'all' | 某个人的 id

        async load() {
            const d = await lf(GK('moments_v2'), null);
            if (d && typeof d === 'object' && Array.isArray(d.feed)) {
                this.feed = d.feed;
                this.covers = d.covers || {};
                this.coverBy = d.coverBy || {};
                this.outbox = Array.isArray(d.outbox) ? d.outbox : [];
                this.seeded = !!d.seeded;
            } else {
                // 兼容旧数据：老 feed 直接迁移，算「他们以前发的」，不重新生成
                const old = await lf(GK('moments_feed'), null);
                this.feed = Array.isArray(old) ? old : [];
                this.covers = {}; this.coverBy = {}; this.outbox = [];
                this.seeded = this.feed.length > 0;
                if (!this.seeded) this.seed();
            }
            this.ensureCovers();
            this.deliverDue();
            await this.persist();
        },
        persist() {
            ls(GK('moments_v2'), {
                feed: this.feed, covers: this.covers, coverBy: this.coverBy,
                outbox: this.outbox, seeded: this.seeded
            });
        },

        /* --- 人：名字一律取真实备注 --- */
        people() {
            const list = [{ id: '__me__', name: myName() || '我', avatar: this.myAvatar(), me: true }];
            contacts().forEach(c => {
                list.push({
                    id: c.id,
                    name: (c.name && String(c.name).trim()) || (c.partnerName && String(c.partnerName).trim()) || 'TA',
                    avatar: c.avatar || '', me: false
                });
            });
            return list;
        },
        myAvatar() {
            const el = document.querySelector('#my-avatar img');
            return el ? el.src : '';
        },
        person(id) {
            return this.people().filter(p => p.id === id)[0]
                || { id: id, name: 'TA', avatar: '', me: false };
        },

        /* --- 封面：只补缺失，不在刷新时改动已有封面 --- */
        ensureCovers() {
            /* v20-9：「全部」页单独一张背景图，只有我能换，梦角不会动它 */
            if (!this.covers['__all__']) {
                this.covers['__all__'] = COVERS[hash('__all__') % COVERS.length];
                this.coverBy['__all__'] = 'me';
            }
            const taken = {};
            Object.keys(this.covers).forEach(k => { if (this.covers[k]) taken[this.covers[k]] = true; });
            this.people().forEach((p, i) => {
                if (this.covers[p.id]) return;
                const start = (hash(p.id) + i) % COVERS.length;
                let url = '';
                for (let j = 0; j < COVERS.length; j++) {
                    const u = COVERS[(start + j) % COVERS.length];
                    if (!taken[u]) { url = u; break; }
                }
                if (!url) url = COVERS[start];
                this.covers[p.id] = url;
                this.coverBy[p.id] = p.me ? 'me' : 'them';
                taken[url] = true;
            });
        },
        setMyCover(url) {
            if (!url) return;
            this.covers['__me__'] = url;
            this.coverBy['__me__'] = 'me';
            this.persist();
            this.render();
            toast('「我的」封面已更换');
        },
        /* v20-9：只有我在「全部」页能换这张背景 */
        setAllCover(url) {
            if (!url) return;
            this.covers['__all__'] = url;
            this.coverBy['__all__'] = 'me';
            this.persist();
            this.render();
            toast('「全部」背景已更换');
        },
        setCoverFor(id, url, by) {
            if (!id || !url) return;
            this.covers[id] = url;
            this.coverBy[id] = by || 'me';
            this.persist();
            try { this.render(); } catch (e) {}
        },
        // 梦角自己换封面（后台行为，我无法触发、也无法替 TA 设置）
        themChangeCover() {
            const others = this.people().filter(p => !p.me);
            if (!others.length) return;
            const p = pickOne(others);
            const pool = COVERS.filter(c => c !== this.covers[p.id]);
            if (!pool.length) return;
            this.covers[p.id] = pickOne(pool);
            this.coverBy[p.id] = 'them';
        },

        /* --- 历史动态：仅全新用户初始化一次 --- */
        seed() {
            const ps = this.people().filter(p => !p.me);
            const t = now();
            let n = 0;
            ps.slice(0, 4).forEach(p => {
                for (let i = 0; i < 2; i++) {
                    this.feed.push({
                        id: 'mf' + (t + n), author: p.id, text: POST_WORDS[n % POST_WORDS.length],
                        time: fmtTime(t - (6 - n) * 3600e3),
                        likes: [], comments: [], ts: t - (6 - n) * 3600e3
                    });
                    n++;
                }
            });
            this.feed.forEach((f, i) => {
                const others = this.people().filter(p => !p.me && p.id !== f.author);
                others.slice(0, 2).forEach(o => { if (!f.likes.some(l => l.id === o.id)) f.likes.push({ id: o.id, name: o.name }); });
                const o = others[0] || this.people()[0];
                if (o) f.comments.push({ byId: o.id, byName: o.name, text: ['嗯嗯，我也是。', '拍得真好。', '下次带我一个。'][i % 3] });
            });
            this.seeded = true;
        },

        /* --- 他们自己发：先排计划，到点才真正出现 --- */
        othersReact(f) {
            const others = this.people().filter(p => !p.me && p.id !== f.author);
            others.slice(0, 2).forEach(o => {
                if (!f.likes.some(l => l.id === o.id)) f.likes.push({ id: o.id, name: o.name });
            });
            const o = others[0];
            if (o) f.comments.push({ byId: o.id, byName: o.name, text: pickOne(['看到啦。', '我在。', '这个好。', '记下了。']) });
        },
        schedule(authorId, delayMs) {
            if (!authorId) return;
            this.outbox.push({
                due: now() + (delayMs || (45000 + Math.random() * 150000)),
                author: authorId,
                text: pickOne(POST_WORDS)
            });
        },
        // 后台：他们自己决定发一条 / 自己换封面（与「刷新」完全无关）
        planSomething() {
            const others = this.people().filter(p => !p.me);
            if (!others.length) return;
            const p = pickOne(others);
            const hasPlan = this.outbox.some(o => o.author === p.id);
            const hasPost = this.feed.some(f => f.author === p.id);
            if (!hasPlan && (!hasPost || Math.random() < 0.6)) this.schedule(p.id);
            if (Math.random() < 0.25) this.themChangeCover();
            this.persist();
        },
        // 把「到期的、他们自己发的」投递成动态；没有到期就什么都不做
        deliverDue() {
            const t = now();
            const remain = [];
            let got = false;
            this.outbox.forEach(o => {
                if (o.due > t) { remain.push(o); return; }
                const f = {
                    id: 'mf' + o.due + Math.floor(Math.random() * 1000),
                    author: o.author, text: o.text, time: fmtTime(o.due),
                    likes: [], comments: [], ts: o.due
                };
                this.feed.push(f);
                this.othersReact(f);
                got = true;
            });
            this.outbox = remain;
            if (got) this.persist();
            return got;
        },
        // 刷新按钮：只看看他们有没有发；没有就完全不动界面
        refresh() {
            const got = this.deliverDue();
            if (got) { this.render(); toast('有新的动态'); }
            else toast('暂时没有新动态，等他们发了才会有');
        },

        /* --- 我发 / 赞 / 评（我不能替 TA 发） --- */
        postMine(text, img) {
            const f = {
                id: 'mf' + now() + Math.floor(Math.random() * 1000), author: '__me__', text: text,
                img: img || '', time: fmtTime(now()), likes: [], comments: [], ts: now()
            };
            this.feed.push(f);
            this.persist();
            setTimeout(() => {
                const cur = this.feed.filter(x => x.id === f.id)[0];
                if (!cur) return;
                this.othersReact(cur);
                this.persist();
                const modal = document.getElementById('love-panel-modal');
                if (modal && modal.classList.contains('active')) this.render();
            }, 3000 + Math.random() * 4000);
        },
        toggleLike(postId) {
            const f = this.feed.filter(x => x.id === postId)[0];
            if (!f) return;
            const i = f.likes.findIndex(l => l.id === '__me__');
            if (i >= 0) f.likes.splice(i, 1); else f.likes.push({ id: '__me__', name: myName() || '我' });
            this.persist();
        },
        comment(postId, text) {
            const f = this.feed.filter(x => x.id === postId)[0];
            if (!f || !text) return;
            f.comments.push({ byId: '__me__', byName: myName() || '我', text: text });
            this.persist();
            setTimeout(() => {
                const o = this.people().filter(p => !p.me && p.id !== f.author)[0];
                if (o) { f.comments.push({ byId: o.id, byName: o.name, text: '嗯嗯，同感。' }); this.persist(); this.render(); }
            }, 2500 + Math.random() * 3000);
        },

        /* --- 渲染：全部在 ❥ 弹层内，主界面零改动 --- */
        render() {
            const body = document.getElementById('lp-body');
            if (!body) return;
            const ps = this.people();
            const cur = this.view === 'all' ? null : this.person(this.view);
            let h = '<div class="lp-head"><span>朋友圈</span>'
                + '<button class="mf-refresh" id="mf-refresh" title="看看有没有新动态"><i class="fas fa-rotate-right"></i></button></div>';

            // 「我的」+ 每位梦角的主页入口，名字用真实备注
            h += '<div class="mf-tabs">';
            h += '<button class="mf-tab ' + (this.view === 'all' ? 'on' : '') + '" data-mf-view="all"><i class="fas fa-layer-group"></i><span>全部</span></button>';
            ps.forEach(p => {
                const av = p.avatar ? '<span class="mf-tab-av"><img src="' + esc(p.avatar) + '" alt=""></span>' : '';
                h += '<button class="mf-tab ' + (this.view === p.id ? 'on' : '') + '" data-mf-view="' + esc(p.id) + '">'
                    + av + '<span>' + esc(p.me ? '我的' : p.name) + '</span></button>';
            });
            h += '</div>';

            // 个人主页（封面 + 昵称 + 封面归属）
            if (cur) {
                const cover = this.covers[cur.id] || COVERS[0];
                h += '<div class="mf-cover" style="background-image:url(\'' + cssUrl(cover) + '\')">'
                    + '</div>';
                const av = cur.avatar ? '<img src="' + esc(cur.avatar) + '" alt="">' : esc(String(cur.name).slice(0, 1));
                h += '<div class="mf-profile"><div class="mf-av">' + av + '</div>'
                    + '<div class="mf-profile-txt"><div class="mf-name">' + esc(cur.name) + '</div></div>'
                    + (cur.me ? '<button class="mf-cover-btn" id="mf-cover-btn"><i class="fas fa-image"></i> 更换封面</button>' : '')
                    + '</div>';
                h += '<div class="mf-cover-picker" id="mf-cover-picker" style="display:none;">'
                    + '<div class="mf-cover-grid">' + COVERS.map(u => '<button class="mf-cover-thumb" data-mf-cover="' + esc(u) + '" style="background-image:url(\'' + cssUrl(u) + '\')"></button>').join('') + '</div>'
                    + '<div class="mf-cover-custom"><label class="mf-cover-up"><i class="fas fa-upload"></i> 上传本地图片<input type="file" id="mf-cover-file" accept="image/*" hidden></label>'
                    + '<div class="mf-cover-url"><input type="text" id="mf-cover-urlin" placeholder="或粘贴图片链接"><button id="mf-cover-urlbtn">使用</button></div></div>'
                    + '</div>';
            } else {
                /* v20-9：朋友圈「全部」多一张背景图，只有我能换 */
                const ac = this.covers['__all__'] || COVERS[0];
                h += '<div class="mf-cover mf-cover-all" style="background-image:url(\'' + cssUrl(ac) + '\')">'
                    + '<button class="mf-allcover-btn" id="mf-allcover-btn"><i class="fas fa-image"></i> 更换背景</button>'
                    + '</div>';
                h += '<div class="mf-cover-picker" id="mf-allcover-picker" style="display:none;">'
                    + '<div class="mf-cover-grid">' + COVERS.map(u => '<button class="mf-cover-thumb" data-mf-allcover="' + esc(u) + '" style="background-image:url(\'' + cssUrl(u) + '\')"></button>').join('') + '</div>'
                    + '<div class="mf-cover-custom"><label class="mf-cover-up"><i class="fas fa-upload"></i> 上传本地图片<input type="file" id="mf-allcover-file" accept="image/*" hidden></label>'
                    + '<div class="mf-cover-url"><input type="text" id="mf-allcover-urlin" placeholder="或粘贴图片链接"><button id="mf-allcover-urlbtn">使用</button></div></div>'
                    + '</div>';
            }

            // v22-3：发表框收进「可移动的 + 」，点开才出现，图片或纯文字都能发
            if (!cur || cur.me) {
                h += '<div class="mm-compose mm-compose-pop" id="mm-compose-pop" style="display:none;">'
                    + '<div class="v22-pop-head"><span>发表朋友圈</span><button class="v22-pop-x" id="mm-pop-x"><i class="fas fa-times"></i></button></div>'
                    + '<textarea id="mm-input" placeholder="这一刻想说的话…" maxlength="200"></textarea>'
                    + '<div class="mm-mat-picker" id="mm-mat-picker" style="display:none;"></div>'
                    + '<div class="mm-album-prev" id="mm-album-prev" style="display:none;"><img id="mm-album-img" alt=""><button id="mm-album-clear"><i class="fas fa-times"></i></button></div>'
                    + '<div class="mm-compose-bar">'
                    + '<button class="mm-mat-btn" id="mm-album-btn" title="从相册选图片"><i class="fas fa-image"></i></button>'
                    + '<button class="mm-mat-btn" id="mm-mat-btn" title="素材库"><i class="fas fa-layer-group"></i></button>'
                    + '<button class="modal-btn modal-btn-primary" id="mm-send" style="padding:6px 14px;font-size:12px;"><i class="fas fa-paper-plane"></i> 发表</button></div>'
                    + '<input type="file" id="mm-album-file" accept="image/*" style="display:none;"></div>';
            }

            const feed = this.feed.slice()
                .filter(f => !cur || f.author === cur.id)
                .sort((a, b) => (b.ts || 0) - (a.ts || 0));
            h += '<div class="mf-list" id="mf-list">';
            if (!feed.length) h += '<div class="mm-empty">还没有动态</div>';
            feed.forEach(f => {
                const au = this.person(f.author);
                const av = au.avatar ? '<img src="' + esc(au.avatar) + '" alt="">' : esc(String(au.name).slice(0, 1));
                const liked = f.likes.some(l => l.id === '__me__');
                h += '<div class="mf-post">'
                    + '<div class="mf-av">' + av + '</div>'
                    + '<div class="mf-main"><div class="mf-name">' + esc(au.name) + '</div>'
                    + '<div class="mf-text">' + esc(f.text) + '</div>'
                    + (f.img ? '<div class="mf-img"><img src="' + f.img + '" alt=""></div>' : '')
                    + '<div class="mf-time">' + esc(f.time) + '</div>'
                    + '<div class="mf-acts"><button class="mf-act ' + (liked ? 'on' : '') + '" data-mf-like="' + esc(f.id) + '"><i class="fas fa-heart"></i> ' + (f.likes.length || '') + '</button>'
                    + '<button class="mf-act" data-mf-cmt="' + esc(f.id) + '"><i class="fas fa-comment"></i> ' + (f.comments.length || '') + '</button></div>'
                    + (f.likes.length ? '<div class="mf-likes"><i class="fas fa-heart"></i> ' + f.likes.map(l => esc(l.name)).join('、') + '</div>' : '')
                    + (f.comments.length ? '<div class="mf-cmts">' + f.comments.map((c, ci) =>
                        '<div class="mf-cmt"><b>' + esc(c.byName) + '</b>'
                        + (c.replyTo ? '<span class="mf-rp"> 回复 ' + esc(c.replyTo.byName) + '</span>' : '')
                        + '：' + esc(c.text)
                        + '<button class="mf-cmt-reply" data-mf-rp="' + esc(f.id) + '|' + ci + '">回复</button></div>').join('') + '</div>' : '')
                    + '<div class="mf-cmtbox" data-box="' + esc(f.id) + '" style="display:none;"><input type="text" placeholder="说点什么…" maxlength="60"><button data-mf-sendcmt="' + esc(f.id) + '">发送</button></div>'
                    + '</div></div>';
            });
            h += '</div>';
            /* v22-3：可移动的「+」，点它发表朋友圈 */
            h += '<button class="mf-fab" id="mf-fab" title="发表朋友圈"><i class="fas fa-plus"></i></button>';
            body.innerHTML = h;
            /* v27-1：朋友圈固定 ← 已删除，改成跟 + 一样的可移动 ←（点击回主页1） */
            try { if (window.LoveExt && window.LoveExt.LP) window.LoveExt.LP.mountBackFab(body, 'moments'); } catch (e) {}

            // 事件（重渲染后重新绑定）
            body.querySelectorAll('[data-mf-view]').forEach(b => b.onclick = () => { this.view = b.dataset.mfView; this.render(); });
            const send = body.querySelector('#mm-send');
            if (send) send.onclick = () => {
                const ta = body.querySelector('#mm-input');
                const t = (ta.value || '').trim();
                if (!t && !this.pendingImg) { toast('先写点什么', 'warning'); return; }
                this.postMine(t, this.pendingImg);
                this.pendingImg = '';
                this.view = '__me__';
                this.render();
                toast('已发表');
            };
            const albumBtn = body.querySelector('#mm-album-btn');
            const albumFile = body.querySelector('#mm-album-file');
            const albumPrev = body.querySelector('#mm-album-prev');
            if (albumBtn && albumFile) {
                albumBtn.onclick = () => albumFile.click();
                albumFile.onchange = async e => {
                    const f = e.target.files && e.target.files[0];
                    if (!f) return;
                    try {
                        this.pendingImg = await shrinkImage(f, 1000);
                        if (albumPrev) {
                            const im = body.querySelector('#mm-album-img');
                            if (im) im.src = this.pendingImg;
                            albumPrev.style.display = '';
                        }
                        toast('已从相册选好图片');
                    } catch (err) { toast('这张图片读不了', 'warning'); }
                    e.target.value = '';
                };
            }
            const albumClear = body.querySelector('#mm-album-clear');
            if (albumClear) albumClear.onclick = () => {
                this.pendingImg = '';
                if (albumPrev) albumPrev.style.display = 'none';
            };
            const matBtn = body.querySelector('#mm-mat-btn');
            const matPick = body.querySelector('#mm-mat-picker');
            if (matBtn && matPick) matBtn.onclick = () => {
                if (matPick.style.display !== 'none') { matPick.style.display = 'none'; return; }
                const ms = (window.HomeExt && window.HomeExt.Materials) ? window.HomeExt.Materials.lib() : [];
                if (!ms.length) { toast('素材库还是空的', 'warning'); return; }
                matPick.innerHTML = ms.map((m, i) =>
                    (m.type === 'image' || m.type === 'shot')
                        ? '<button class="mm-mat-item" data-mm-mat="' + i + '" style="background-image:url(\'' + m.content + '\')"></button>'
                        : '<button class="mm-mat-item mm-mat-txt" data-mm-mat="' + i + '">' + esc(m.content).slice(0, 30) + '</button>').join('');
                matPick.style.display = 'flex';
                matPick.querySelectorAll('[data-mm-mat]').forEach(b => b.onclick = () => {
                    const m = ms[Number(b.dataset.mmMat)];
                    if (!m) return;
                    if (m.type === 'image' || m.type === 'shot') {
                        this.pendingImg = m.content;
                        toast('已选择图片素材');
                    } else {
                        const ta = body.querySelector('#mm-input');
                        ta.value = (ta.value + ' ' + m.content).trim();
                    }
                    matPick.style.display = 'none';
                });
            };
            /* v22-3：可移动的「+」——可拖到任意位置，点一下打开/关闭发表框 */
            const fab = body.querySelector('#mf-fab');
            const pop = body.querySelector('#mm-compose-pop');
            if (fab && pop) {
                try {
                    const pos = JSON.parse(localStorage.getItem('hx_fab_pos') || 'null');
                    if (pos && typeof pos.left === 'number') {
                        fab.style.left = pos.left + 'px'; fab.style.top = pos.top + 'px';
                        fab.style.right = 'auto'; fab.style.bottom = 'auto';
                    }
                } catch (e) {}
                let drag = null;
                fab.addEventListener('pointerdown', e => {
                    drag = { x: e.clientX, y: e.clientY, moved: false };
                    try { fab.setPointerCapture(e.pointerId); } catch (err) {}
                });
                fab.addEventListener('pointermove', e => {
                    if (!drag) return;
                    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
                    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
                    if (!drag.moved) return;
                    const r = fab.getBoundingClientRect();
                    const nl = Math.max(6, Math.min(window.innerWidth - r.width - 6, r.left + dx));
                    const nt = Math.max(6, Math.min(window.innerHeight - r.height - 6, r.top + dy));
                    fab.style.left = nl + 'px'; fab.style.top = nt + 'px';
                    fab.style.right = 'auto'; fab.style.bottom = 'auto';
                    drag.x = e.clientX; drag.y = e.clientY;
                });
                fab.addEventListener('pointerup', () => {
                    if (!drag) return;
                    const moved = drag.moved; drag = null;
                    if (moved) {
                        const r = fab.getBoundingClientRect();
                        try { localStorage.setItem('hx_fab_pos', JSON.stringify({ left: r.left, top: r.top })); } catch (err) {}
                    } else {
                        pop.style.display = pop.style.display === 'none' ? '' : 'none';
                        const ta = body.querySelector('#mm-input');
                        if (pop.style.display !== 'none' && ta) setTimeout(() => ta.focus(), 30);
                    }
                });
                const px = body.querySelector('#mm-pop-x');
                if (px) px.onclick = () => { pop.style.display = 'none'; };
            }
            const rf = body.querySelector('#mf-refresh');
            if (rf) rf.onclick = () => this.refresh();
            const cb = body.querySelector('#mf-cover-btn');
            const picker = body.querySelector('#mf-cover-picker');
            if (cb && picker) cb.onclick = () => { picker.style.display = picker.style.display === 'none' ? '' : 'none'; };
            body.querySelectorAll('[data-mf-cover]').forEach(b => b.onclick = () => this.setMyCover(b.dataset.mfCover));
            const fl = body.querySelector('#mf-cover-file');
            if (fl) fl.onchange = async e => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                try { this.setMyCover(await shrinkImage(f, 900)); } catch (err) { toast('这张图片读不了', 'warning'); }
                e.target.value = '';
            };
            const ub = body.querySelector('#mf-cover-urlbtn');
            if (ub) ub.onclick = () => {
                const v = (body.querySelector('#mf-cover-urlin').value || '').trim();
                if (!/^(https?:\/\/|data:image\/|\/|\.\/)/i.test(v)) { toast('填一个图片链接', 'warning'); return; }
                this.setMyCover(v);
            };
            /* v20-9：「全部」背景，只有我这边有这些按钮 */
            const acb = body.querySelector('#mf-allcover-btn');
            const acp = body.querySelector('#mf-allcover-picker');
            if (acb && acp) acb.onclick = () => { acp.style.display = acp.style.display === 'none' ? '' : 'none'; };
            body.querySelectorAll('[data-mf-allcover]').forEach(b => b.onclick = () => this.setAllCover(b.dataset.mfAllcover));
            const afl = body.querySelector('#mf-allcover-file');
            if (afl) afl.onchange = async e => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                try { this.setAllCover(await shrinkImage(f, 900)); } catch (err) { toast('这张图片读不了', 'warning'); }
                e.target.value = '';
            };
            const aub = body.querySelector('#mf-allcover-urlbtn');
            if (aub) aub.onclick = () => {
                const v = (body.querySelector('#mf-allcover-urlin').value || '').trim();
                if (!/^(https?:\/\/|data:image\/|\/|\.\/)/i.test(v)) { toast('填一个图片链接', 'warning'); return; }
                this.setAllCover(v);
            };
        }
    };

    /* ============================================================
       三、一起听：真实播放器
       ============================================================ */
    const TRACKS = [
        { name: '晚风 · 八音盒', root: 523.25, seq: [0, 2, 4, 7, 4, 2, 0, 4, 5, 7, 9, 7, 5, 4, 2, 0] },
        { name: '晴天 · 小调', root: 440.00, seq: [0, 3, 5, 7, 10, 7, 5, 3, 0, 5, 7, 8, 7, 5, 3, 0] },
        { name: '月光 · 慢板', root: 392.00, seq: [0, 4, 7, 12, 7, 4, 2, 0, 5, 9, 12, 9, 5, 2, 0, 4] }
    ];
    const semi = n => Math.pow(2, n / 12);
    const Player = {
        ctx: null, gain: null, src: null, buffers: {}, pending: {}, idx: 0,
        playing: false, startedAt: 0, offset: 0, timer: null, audioEl: null,
        get dur() { return 16; },
        ensure() {
            if (!this.ctx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AC();
                this.gain = this.ctx.createGain();
                this.gain.gain.value = 0.6;
                this.gain.connect(this.ctx.destination);
            }
            if (this.ctx.state === 'suspended') this.ctx.resume();
        },
        renderBuffer(i) {
            if (this.buffers[i]) return Promise.resolve(this.buffers[i]);
            if (this.pending[i]) return this.pending[i];   // 并发去重，避免重复合成
            const self = this;
            this.pending[i] = (async () => {
                const sr = 22050, dur = this.dur;
                const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
                const oc = new OC(1, sr * dur, sr);
                const t = TRACKS[i];
                for (let n = 0; n < t.seq.length; n++) {
                    const st = n * 1.0, len = 1.35, f = t.root * semi(t.seq[n]);
                    const o = oc.createOscillator(), g = oc.createGain();
                    o.type = 'sine'; o.frequency.value = f;
                    g.gain.setValueAtTime(0.0001, st);
                    g.gain.linearRampToValueAtTime(0.16, st + 0.03);
                    g.gain.exponentialRampToValueAtTime(0.0008, st + len);
                    o.connect(g); g.connect(oc.destination);
                    o.start(st); o.stop(st + len + 0.02);
                    const o2 = oc.createOscillator(), g2 = oc.createGain();
                    o2.type = 'sine'; o2.frequency.value = f * 2;
                    g2.gain.setValueAtTime(0.0001, st);
                    g2.gain.linearRampToValueAtTime(0.045, st + 0.03);
                    g2.gain.exponentialRampToValueAtTime(0.0006, st + len * 0.8);
                    o2.connect(g2); g2.connect(oc.destination);
                    o2.start(st); o2.stop(st + len + 0.02);
                }
                const buf = await oc.startRendering();
                self.buffers[i] = buf;
                delete self.pending[i];
                return buf;
            })();
            return this.pending[i];
        },
        stopSrc() {
            if (this.src) { try { this.src.stop(); } catch (e) {} this.src.disconnect(); this.src = null; }
        },
        async play(from) {
            this.ensure();
            // 先把状态切过去，点击立刻有反馈，音频合成完再真正出声
            const resumeOffset = (typeof from === 'number' ? from : this.offset);
            this.playing = true;
            this.paint();
            const buf = await this.renderBuffer(this.idx);
            this.stopSrc();
            const off = resumeOffset % this.dur;
            const s = this.ctx.createBufferSource();
            s.buffer = buf; s.loop = true;
            s.connect(this.gain);
            s.start(0, off);
            this.src = s;
            this.startedAt = this.ctx.currentTime - off;
            this.playing = true;
            this.tick();
            this.paint();
        },
        pause() {
            if (!this.playing) return;
            this.offset = (this.ctx.currentTime - this.startedAt) % this.dur;
            this.stopSrc();
            this.playing = false;
            clearInterval(this.timer); this.timer = null;
            this.paint();
        },
        async toggle() { if (this.playing) this.pause(); else await this.play(); },
        async switchTo(i) { this.idx = i; this.offset = 0; if (this.playing) await this.play(0); this.paint(); },
        vol(v) { this.ensure(); this.gain.gain.value = Math.max(0, Math.min(1, Number(v) || 0)); },
        tick() {
            clearInterval(this.timer);
            this.timer = setInterval(() => {
                if (!this.playing) return;
                const p = (this.ctx.currentTime - this.startedAt) % this.dur;
                const bar = document.getElementById('pl-prog');
                const t1 = document.getElementById('pl-cur');
                if (bar) bar.style.width = (p / this.dur * 100) + '%';
                if (t1) t1.textContent = '0:' + String(Math.floor(p)).padStart(2, '0');
            }, 200);
        },
        paint() {
            const b = document.getElementById('pl-toggle');
            if (b) b.innerHTML = this.playing ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
            const cover = document.getElementById('pl-cover');
            if (cover) cover.classList.toggle('spinning', this.playing);
            const ttl = document.getElementById('pl-title');
            if (ttl) ttl.textContent = TRACKS[this.idx].name;
            document.querySelectorAll('.pl-row').forEach(r => r.classList.toggle('on', Number(r.dataset.plTrack) === this.idx));
        },
        async view() {
            const body = document.getElementById('lp-body');
            if (!body) return;
            // 打开面板就先合成好当前曲目，点播放时不用等
            this.renderBuffer(this.idx).catch(() => {});
            body.innerHTML = '<div class="lp-head"><button class="lp-back" data-lp-back><i class="fas fa-arrow-left"></i></button><span>一起听</span></div>'
                + '<div class="pl-box">'
                + '<div class="pl-cover" id="pl-cover"><i class="fas fa-music"></i></div>'
                + '<div class="pl-title" id="pl-title">' + TRACKS[this.idx].name + '</div>'
                + '<div class="pl-sub"><span class="pl-dot"></span> ' + esc(partnerName()) + ' 也戴上了耳机</div>'
                + '<div class="pl-bar"><div class="pl-prog" id="pl-prog"></div></div>'
                + '<div class="pl-times"><span id="pl-cur">0:00</span><span>0:16</span></div>'
                + '<div class="pl-ctrl">'
                + '<button class="pl-small" id="pl-prev"><i class="fas fa-backward-step"></i></button>'
                + '<button class="pl-big" id="pl-toggle"><i class="fas fa-play"></i></button>'
                + '<button class="pl-small" id="pl-next"><i class="fas fa-forward-step"></i></button>'
                + '</div>'
                + '<div class="pl-vol"><i class="fas fa-volume-low"></i><input type="range" id="pl-vol" min="0" max="1" step="0.01" value="0.6"></div>'
                + '</div>'
                + '<div class="pl-list">' + TRACKS.map((t, i) => '<div class="pl-row ' + (i === this.idx ? 'on' : '') + '" data-pl-track="' + i + '"><i class="fas fa-music"></i><span>' + esc(t.name) + '</span><small>内置</small></div>').join('') + '</div>'
                + '<div class="pl-url"><label>或者贴一个音频直链（mp3 / ogg）</label><div><input type="url" id="pl-urlin" placeholder="https://…/song.mp3"><button id="pl-urlgo">播放</button></div><audio id="pl-audio" controls style="display:none;width:100%;margin-top:8px;"></audio></div>'
                + '<div class="pl-invite"><button class="modal-btn modal-btn-primary" id="pl-invite"><i class="fas fa-headphones"></i> 邀请 ' + esc(partnerName()) + ' 一起听</button></div>';
            this.paint();

            body.querySelector('#pl-toggle').onclick = () => this.toggle();
            body.querySelector('#pl-prev').onclick = () => this.switchTo((this.idx + TRACKS.length - 1) % TRACKS.length);
            body.querySelector('#pl-next').onclick = () => this.switchTo((this.idx + 1) % TRACKS.length);
            body.querySelector('#pl-vol').oninput = e => this.vol(e.target.value);
            body.querySelectorAll('.pl-row').forEach(r => r.onclick = () => this.switchTo(Number(r.dataset.plTrack)));
            body.querySelector('#pl-urlgo').onclick = () => {
                const u = (body.querySelector('#pl-urlin').value || '').trim();
                if (!/^https?:\/\//i.test(u)) { toast('链接要以 http 开头', 'warning'); return; }
                this.pause();
                const a = body.querySelector('#pl-audio');
                a.style.display = ''; a.src = u; a.play().catch(() => toast('这个链接播不了，换一个吧', 'warning'));
            };
            body.querySelector('#pl-invite').onclick = () => {
                const name = TRACKS[this.idx].name;
                if (!this.playing) this.play();
                if (typeof window.LoveExt !== 'undefined' && window.LoveExt.LP && typeof window.LoveExt.LP.pushCard === 'function') {
                    window.LoveExt.LP.pushCard('listen', name + '（正在播放）', '');
                }
                toast('已邀请 ' + partnerName() + ' 一起听');
            };
        }
    };

    /* ============================================================
       接管 ❥ 面板里的「朋友圈 / 一起听」
       ============================================================ */
    function takeoverLP() {
        const LP = (window.LoveExt && window.LoveExt.LP) || null;
        if (!LP) return false;
        LP.moments = async function () { await MF.load(); MF.view = 'all'; MF.render(); };
        LP.listen = async function () { await Player.view(); };
        return true;
    }

    /* ============================================================
       事件绑定
       ============================================================ */
    function bind() {
        document.addEventListener('click', e => {
            const t = e.target;

            // 群面板 tab
            const tab = t.closest('.gm-tab');
            if (tab) { switchTab(tab.dataset.gmtab); return; }

            // 群管理操作
            const km = t.closest('[data-gx-mute]');
            if (km) {
                const m = members().filter(x => memberKey(x) === km.dataset.gxMute)[0];
                if (m) showMuteSheet(m);
                return;
            }
            const ku = t.closest('[data-gx-unmute]');
            if (ku) { requestUnmute(ku.dataset.gxUnmute); return; }
            const kk = t.closest('[data-gx-kick]');
            if (kk) {
                const m = members().filter(x => memberKey(x) === kk.dataset.gxKick)[0];
                if (m) requestKick(m);
                return;
            }
            const agree = t.closest('[data-gx-agree]') || t.closest('[data-gx-ok]');
            if (agree) {
                if (agree.dataset.gxOk) { unMute(agree.dataset.gxKey); toast('已同意解除禁言'); sysCard('已同意 ' + esc(agree.dataset.gxOk) + ' 解除禁言。'); renderManage(); return; }
                const p = gov.pending.filter(x => x.id === agree.dataset.gxAgree)[0];
                if (p) handlePending(p, true);
                return;
            }
            const reject = t.closest('[data-gx-reject]') || t.closest('[data-gx-no]');
            if (reject) {
                if (reject.dataset.gxNo) { toast('已驳回申请'); sysCard('解除禁言的申请被驳回了。'); renderManage(); return; }
                const p = gov.pending.filter(x => x.id === reject.dataset.gxReject)[0];
                if (p) handlePending(p, false);
                return;
            }

            // 朋友圈
            const lk = t.closest('[data-mf-like]');
            if (lk) { MF.toggleLike(lk.dataset.mfLike); MF.render(); return; }
            const cm = t.closest('[data-mf-cmt]');
            if (cm) {
                const box = document.querySelector('.mf-cmtbox[data-box="' + cm.dataset.mfCmt + '"]');
                if (box) { box.style.display = box.style.display === 'none' ? 'flex' : 'none'; if (box.style.display === 'flex') box.querySelector('input').focus(); }
                return;
            }
            // 回复某一条评论：打开评论框并记住回复对象
            const rp = t.closest('[data-mf-rp]');
            if (rp) {
                const parts = String(rp.dataset.mfRp).split('|');
                const pid = parts[0], ci = Number(parts[1]);
                const f = MF.feed.filter(x => x.id === pid)[0];
                const c = f && f.comments[ci];
                if (!c) return;
                const box = document.querySelector('.mf-cmtbox[data-box="' + pid + '"]');
                if (box) {
                    box.style.display = 'flex';
                    box.dataset.replyById = c.byId || '';
                    box.dataset.replyByName = c.byName || '';
                    const inp = box.querySelector('input');
                    if (inp) { inp.placeholder = '回复 ' + c.byName + '…'; inp.focus(); }
                }
                return;
            }
            const sc = t.closest('[data-mf-sendcmt]');
            if (sc) {
                const box = sc.closest('.mf-cmtbox');
                const v = (box.querySelector('input').value || '').trim();
                if (!v) { toast('写点什么再发', 'warning'); return; }
                const rt = box.dataset.replyByName
                    ? { byId: box.dataset.replyById || '', byName: box.dataset.replyByName }
                    : null;
                MF.comment(sc.dataset.mfSendcmt, v, rt);
                box.dataset.replyById = '';
                box.dataset.replyByName = '';
                box.querySelector('input').placeholder = '说点什么…';
                MF.render();
                toast(rt ? ('已回复 ' + rt.byName) : '已评论');
                return;
            }
        });

        // 打开群面板时：是否是群会话 → 显示管理 tab
        const gc = document.getElementById('group-chat-btn');
        if (gc) gc.addEventListener('click', () => {
            setTimeout(async () => {
                await loadGov();
                const g = curGroup();
                const mt = document.getElementById('gm-manage-tab');
                if (mt) mt.style.display = g ? '' : 'none';
                switchTab(g ? 'manage' : 'create');
                if (typeof window.LoveExt !== 'undefined' && window.LoveExt.GroupNew) window.LoveExt.GroupNew.render();
            }, 80);
        });

        // 定时：梦角之间的群事件（仅群会话，低频率）
        setInterval(() => {
            try { if (curGroup() && Math.random() < 0.18) randomGroupEvent(false); } catch (e) {}
        }, 45000);
        // 定时：他们自己发（先排计划、到点才出现）+ 自己换封面；与刷新无关，不自动重绘打扰输入
        setInterval(() => {
            try {
                MF.deliverDue();
                if (Math.random() < 0.22) MF.planSomething();
            } catch (e) {}
        }, 30000);
    }

    /* ============================================================
       启动
       ============================================================ */
    async function boot() {
        let ok = false;
        for (let i = 0; i < 20 && !ok; i++) {
            ok = takeoverLP();
            if (!ok) await new Promise(r => setTimeout(r, 150));
        }
        bind();
        await loadGov();
        await ensureReplyPool();
        await MF.load();
        installMuteHooks();
        window.GX = { gov: () => gov, MF: MF, Player: Player, renderManage: renderManage, randomGroupEvent: randomGroupEvent, switchTab: switchTab, unMuteByKey: unMute, requestUnmute: requestUnmute, TRACK_COUNT: TRACKS.length, TRACKS: TRACKS };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 500));
    else setTimeout(boot, 500);
})();
