/* 传讯 · 通知用 Service Worker
   只负责把通知显示到系统通知栏 / 锁屏，不托管缓存，避免影响站点原有行为。 */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('notificationclick', function (e) {
    e.notification.close();
    e.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
            for (var i = 0; i < cs.length; i++) {
                if (cs[i] && 'focus' in cs[i]) return cs[i].focus();
            }
            return self.clients.openWindow ? self.clients.openWindow('./') : null;
        })
    );
});

self.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'notify') return;
    var d = e.data;
    e.waitUntil(self.registration.showNotification(d.title || '传讯', {
        body: d.body || '对方发来了消息',
        icon: d.icon,
        tag: 'partner-msg',
        renotify: true
    }));
});
