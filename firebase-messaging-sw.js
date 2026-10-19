// Rings calls in the browser while Site Pro is in the background or closed:
// shows a notification, and clicking it opens the app on the call.
// The config is the Firebase web app's public settings (see
// lib/core/firebase_config.dart); empty until Firebase is set up.
const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  messagingSenderId: '',
  appId: '',
};

if (firebaseConfig.appId) {
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const d = payload.data || {};
    if (d.type === 'call_cancel') {
      return self.registration.getNotifications({ tag: d.call_id }).then((list) => list.forEach((n) => n.close()));
    }
    if (d.type !== 'call') return;
    const video = d.video === '1';
    return self.registration.showNotification(d.caller || 'سايت برو', {
      body: (video ? 'مكالمة فيديو' : 'مكالمة صوت') + ' · ' + (d.title || ''),
      tag: d.call_id,
      requireInteraction: true,
      icon: 'icons/Icon-192.png',
      dir: 'rtl',
      lang: 'ar',
      data: d,
    });
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const url = new URL('./?join=' + encodeURIComponent([d.kind, d.id, d.video].join(':')), self.registration.scope).href;
  event.waitUntil(clients.openWindow(url));
});
