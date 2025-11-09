# 🚀 Quick Test - Notifikasi

## Setelah deploy ke Vercel selesai, ikuti langkah ini:

---

## ✅ Step 1: Test Manual Notification

### Buka aplikasi di browser → Press F12 → Console

**Test 1: Cek Permission**
```javascript
Notification.permission
// Harus return: "granted"
// Jika "default" atau "denied", jalankan:
Notification.requestPermission()
```

**Test 2: Test Notifikasi Langsung**
```javascript
window.testNotification()
```

**Expected:**
- Console log: `[Test] Showing test notification...`
- Notification popup muncul: "🧪 Test Notification"
- Sound play

**Jika tidak muncul:**
- Cek permission: `window.checkNotificationPermission()`
- Cek errors di console

---

## ✅ Step 2: Test Global Notification di Homepage

### Device 1: Homepage
1. Login → Stay di **Homepage** (jangan buka room)
2. Buka Console (F12)
3. **Check logs harus ada:**
```
[Home] Notification permission granted
[Global Notification] Initializing for user: xxxxx
[Global Notification] Monitoring rooms: ["general"]
[Global Notification] Connected to room: general
```

### Device 2: Chat Room
1. Login user berbeda
2. Buka room "general"
3. Kirim pesan: "Test dari device 2"

### Device 1: Check
**Console harus show:**
```
[Global Notification] Received message: ...
[Global Notification] Message from other user detected
[Global Notification] Comparing rooms: ...
[Global Notification] ✅ Different room - Showing notification
[showMessageNotification] Called with: ...
[showMessageNotification] Playing sound...
[showMessageNotification] Showing notification via PWA...
```

**Result:**
- ✅ Notification muncul
- ✅ Sound play
- ✅ Bisa click notification

---

## ❌ Jika Masih Tidak Muncul

### Cek 1: WebSocket Connected?
```javascript
// Di console
// Harus ada log: [Global Notification] Connected to room: general
```

**Jika tidak ada:**
- Backend belum running
- WebSocket error (check console errors)

### Cek 2: Permission Granted?
```javascript
window.checkNotificationPermission()
```

**Harus output:**
```
Notification.permission: "granted"
Service Worker: "supported"
Service Worker controller: "activated"
```

### Cek 3: UserID Valid?
```javascript
const token = localStorage.getItem('token');
const payload = JSON.parse(atob(token.split('.')[1]));
console.log('User ID:', payload.sub);
```

Harus ada user ID, bukan undefined.

### Cek 4: Force Test
```javascript
// Test tanpa WebSocket
import { showMessageNotification } from './lib/notifications';

// Atau langsung:
new Notification("Direct Test", { 
  body: "Bypass everything",
  icon: "/icon-192x192.png"
});
```

---

## 📊 Expected Console Output (Full Flow)

### Homepage Load:
```
[Home] Notification permission granted
[Global Notification] Initializing for user: abc123def456
[Global Notification] Monitoring rooms: ["general"]
[Global Notification] Connected to room: general
```

### Saat Pesan Masuk:
```
[Global Notification] Received message: {
  type: "message",
  room: "general",
  sender_id: "xyz789",
  content_preview: "Hello world",
  currentUserId: "abc123",
  currentRoomId: undefined
}
[Global Notification] Message from other user detected
[Global Notification] Comparing rooms: {
  msgRoomId: "general",
  currentRoomId: undefined
}
[Global Notification] ✅ Different room - Showing notification
[showMessageNotification] Called with: {
  title: "💬 user@email.com",
  body: "Hello world",
  options: {...}
}
[showMessageNotification] Playing sound...
[showMessageNotification] Showing notification via PWA...
[showMessageNotification] Notification request sent
```

---

## 🎯 Debugging Commands

Copy-paste ini di console:

```javascript
// Test suite lengkap
console.log('=== NOTIFICATION DEBUG ===');
console.log('Permission:', Notification.permission);
console.log('ServiceWorker:', 'serviceWorker' in navigator);
console.log('Token:', localStorage.getItem('token') ? 'exists' : 'missing');

// Test manual notification
window.testNotification();

// Test sound
const audio = new Audio('/notification/notification.mp3');
audio.play().then(() => console.log('✅ Sound OK')).catch(e => console.error('❌ Sound failed:', e));

// Check WebSocket status
// (Lihat network tab → WS → Status harus 101)
```

---

## 🔄 Reset Everything

Jika masih stuck:

```javascript
// 1. Clear everything
localStorage.clear();
sessionStorage.clear();

// 2. Unregister service worker
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(reg => reg.unregister());
});

// 3. Hard reload
location.reload(true);
```

---

## ✅ Success Checklist

Centang jika OK:

- [ ] `Notification.permission === "granted"`
- [ ] `window.testNotification()` shows notification
- [ ] Console shows `[Global Notification] Connected`
- [ ] Sound plays when test notification triggered
- [ ] Notification muncul saat pesan dari device lain
- [ ] Notification muncul di homepage
- [ ] Sound play untuk setiap notifikasi

**Jika semua ✅ = Notifikasi bekerja sempurna! 🎉**

---

## 📸 Screenshot untuk Debug

Jika masih gagal, screenshot ini dan kirim:

1. **Console logs** (F12 → Console)
2. **Network tab** → Filter WS (WebSocket connections)
3. **Application tab** → Service Workers status
4. Result dari: `window.checkNotificationPermission()`

---

**Tunggu Vercel deploy selesai (~2 menit), lalu test!** 🚀
