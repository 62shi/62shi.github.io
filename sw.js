/* 传讯 · 通知用 Service Worker（v28）
   - 只负责把通知送进系统通知栏 / 锁屏，不接管页面缓存，避免影响站点原有行为
   - 支持页面消息（postMessage）、Web Push（服务端下发）、通知点击回到应用
*/
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

function showMsg(payload) {
    var title = payload.title || '传讯';
    var body = payload.body || '对方发来了消息';
    var options = {
        body: body,
        icon: payload.icon || 'vendor/icons/icon-192.png',
        badge: 'vendor/icons/favicon-32.png',
        tag: payload.tag || 'partner-msg',
        renotify: true,
        timestamp: Date.now(),
        data: { url: payload.url || './index.html' },
        vibrate: [40, 30, 40],
        silent: false
    };
    return self.registration.showNotification(title, options);
}

self.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'notify') return;
    e.waitUntil(showMsg(e.data));
});

/* Web Push：以后接服务端（自建推送 / OneSignal / PushPlus Web 通道）可直接使用 */
self.addEventListener('push', function (e) {
    var data = {};
    try { data = e.data ? e.data.json() : {}; } catch (err) {
        data = { title: '传讯', body: e.data ? e.data.text() : '对方发来了消息' };
    }
    e.waitUntil(showMsg({
        title: data.title || '传讯',
        body: data.body || '对方发来了消息',
        icon: data.icon,
        tag: data.tag
    }));
});

self.addEventListener('notificationclick', function (e) {
    e.notification.close();
    var target = (e.notification.data && e.notification.data.url) || './index.html';
    e.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
            for (var i = 0; i < cs.length; i++) {
                var c = cs[i];
                if (c && 'focus' in c) {
                    try { c.postMessage({ type: 'notify-click' }); } catch (err) {}
                    return c.focus();
                }
            }
            return self.clients.openWindow ? self.clients.openWindow(target) : null;
        })
    );
});
