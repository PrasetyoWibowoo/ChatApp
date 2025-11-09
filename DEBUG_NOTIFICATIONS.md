# 🔍 Cara Debug & Test Notifikasi

## Masalah: Notifikasi Tidak Muncul

Ikuti langkah-langkah berikut untuk test dan debug notifikasi:

---

## ✅ Langkah 1: Cek Permission

### **Buka Console Browser (F12)**

```javascript
// Di console, ketik:
Notification.permission
```

**Result harus:** `"granted"`

**Jika "denied" atau "default":**
```javascript
// Request permission lagi:
Notification.requestPermission()
```

---

## ✅ Langkah 2: Test Notifikasi Manual

### **Di Console, coba show notification:**

```javascript
// Test 1: Basic notification
new Notification("Test", { body: "Hello World" });

// Test 2: With icon
new Notification("Test", { 
  body: "Hello World",
  icon: "/icon-192x192.png"
});
```

**Jika muncul notifikasi:** ✅ Browser support OK  
**Jika tidak muncul:** ❌ Cek browser settings

---

## ✅ Langkah 3: Test Sound

### **Di Console:**

```javascript
// Test play sound
const audio = new Audio('/notification/notification.mp3');
audio.volume = 0.5;
audio.play();
```

**Jika terdengar sound:** ✅ Sound OK  
**Jika error:** Cek autoplay policy (perlu user interaction)

---

## ✅ Langkah 4: Cek Global Notification System

### **Buka Homepage, lalu cek console:**

**Harus ada log:**
```
[Home] Notification permission granted
[Global Notification] Initializing for user: [user_id]
[Global Notification] Monitoring rooms: ["general", ...]
[Global Notification] Connected to room: general
```

**Jika tidak ada:**
- Refresh page
- Click page (untuk trigger permission)
- Cek console errors

---

## ✅ Langkah 5: Test Cross-Room Notification

### **Setup:**
1. **Device 1:** Buka homepage
2. **Device 2:** Buka chat room (misalnya "general")
3. **Device 2:** Kirim pesan di room "general"

### **Expected Result di Device 1:**
```
Console logs:
[Global Notification] Received: message from room: general
[Global Notification] Showing notification for room: general
[Notification] Sound play...

Desktop:
- Muncul notification popup
- Play sound
```

---

## ✅ Langkah 6: Test Same Room (No Duplicate)

### **Setup:**
1. **Device 1:** Buka chat room "general"
2. **Device 2:** Kirim pesan di room "general"

### **Expected Result di Device 1:**
```
Console logs:
[Global Notification] Skipping notification (same room)

Result:
- Sound play ✅
- NO notification popup (karena sudah di room itu)
```

---

## 🔧 Troubleshooting Steps

### **Problem: Console tidak ada log [Global Notification]**

**Solusi:**
1. Pastikan di **Homepage**, bukan di chat room
2. Check token valid: `localStorage.getItem('token')`
3. Refresh page dengan hard refresh: `Ctrl+Shift+R` (PC) / `Cmd+Shift+R` (Mac)

---

### **Problem: WebSocket tidak connect**

**Check di Console:**
```javascript
// Cek WebSocket URL
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const hostname = window.location.hostname;
console.log(`${protocol}//${hostname}:8080/ws`);
```

**Expected:**
- Localhost: `ws://localhost:8080/ws`
- Vercel: `wss://[your-domain].vercel.app:8080/ws`

**Jika error "Connection refused":**
- Backend belum jalan
- Port 8080 blocked
- CORS issue

---

### **Problem: Notification muncul tapi no sound**

**Solusi:**

1. **Click page dulu** (browser autoplay policy)
2. **Check volume** device tidak mute
3. **Test manual:**
   ```javascript
   const audio = new Audio('/notification/notification.mp3');
   audio.play().then(() => {
     console.log('Sound played successfully');
   }).catch(err => {
     console.error('Sound play failed:', err);
   });
   ```

4. **Check browser settings:**
   - Chrome: Settings → Site settings → Sound → Allow
   - Safari: Preferences → Websites → Auto-Play → Allow

---

### **Problem: Notifikasi tidak muncul di tab background**

**Check:**

1. **Browser notification permission:**
   ```javascript
   Notification.permission // Must be "granted"
   ```

2. **Page visibility:**
   ```javascript
   document.hidden // true = background, false = foreground
   ```

3. **Test force show:**
   ```javascript
   // Di console saat tab background
   new Notification("Test Background", { 
     body: "Should appear even in background" 
   });
   ```

---

### **Problem: PWA notifikasi tidak bekerja**

**Check Service Worker:**

1. **DevTools → Application → Service Workers**
2. **Status harus:** "activated and is running"
3. **Jika error:** Click "Unregister" → Refresh page

**Test SW notification:**
```javascript
// Di console
navigator.serviceWorker.ready.then(registration => {
  registration.showNotification("Test SW", {
    body: "From Service Worker"
  });
});
```

---

## 📊 Debug Checklist

Centang jika sudah OK:

- [ ] `Notification.permission === "granted"`
- [ ] Sound file `/notification/notification.mp3` accessible
- [ ] Global WebSocket connected (check console log)
- [ ] Backend running on port 8080
- [ ] User sudah click/tap page (autoplay policy)
- [ ] Browser tidak mute notifications
- [ ] Service Worker activated (for PWA)
- [ ] User ID valid (dari JWT token)

---

## 🎯 Test Scenario Lengkap

### **Scenario 1: Homepage Notification**

**Steps:**
1. Login user A di device 1 → Stay di homepage
2. Login user B di device 2 → Buka room "general"
3. User B kirim: "Hello from general"
4. Check device 1 (homepage):
   - ✅ Notification muncul
   - ✅ Sound play
   - 👆 Click notif → redirect ke room

---

### **Scenario 2: Cross-Room Notification**

**Steps:**
1. Login user A di device 1 → Buka room "team"
2. Login user B di device 2 → Buka room "general"
3. User B kirim pesan di room "general"
4. Check device 1 (di room "team"):
   - ✅ Notification dari room "general" muncul
   - ✅ Sound play

---

### **Scenario 3: No Duplicate in Same Room**

**Steps:**
1. Login user A di device 1 → Buka room "general"
2. Login user B di device 2 → Buka room "general"
3. User B kirim pesan
4. Check device 1:
   - ✅ Sound play
   - ❌ NO notification (karena sudah di room itu)

---

### **Scenario 4: PWA Background**

**Steps:**
1. Install PWA di device 1
2. Close/minimize PWA app
3. Login user B di device 2
4. User B kirim pesan
5. Check device 1:
   - ✅ System notification muncul
   - 👆 Tap → Open app

---

## 💡 Pro Tips

### **Enable Verbose Logging:**

Di console, set:
```javascript
localStorage.setItem('debug_notifications', 'true');
```

Lalu refresh page. All notification logs akan muncul.

---

### **Test Different Browsers:**

| Browser | Notification | Sound | PWA |
|---------|--------------|-------|-----|
| Chrome PC | ✅ | ✅ | ✅ |
| Edge PC | ✅ | ✅ | ✅ |
| Safari Mac | ✅ | ✅ | ⚠️ |
| Chrome Android | ✅ | ✅ | ✅ |
| Safari iOS 16.4+ | ✅ | ✅ | ✅ |

---

### **Clear Everything & Start Fresh:**

Jika masih bermasalah:

1. **Clear site data:**
   - DevTools → Application → Clear storage → Clear site data
2. **Unregister SW:**
   - DevTools → Application → Service Workers → Unregister
3. **Reload:**
   - Hard refresh: `Ctrl+Shift+R`
4. **Test lagi** dari awal

---

## 📞 Still Not Working?

### **Collect Debug Info:**

```javascript
// Run this in console and copy output:
console.log({
  permission: Notification.permission,
  protocol: window.location.protocol,
  hostname: window.location.hostname,
  hasServiceWorker: 'serviceWorker' in navigator,
  swState: navigator.serviceWorker?.controller?.state,
  userId: localStorage.getItem('token') ? 'exists' : 'missing',
  myRooms: localStorage.getItem('myRooms')
});
```

---

## ✅ Sukses Indicator

**Notifikasi bekerja dengan baik jika:**

1. ✅ Console ada log: `[Global Notification] Connected`
2. ✅ Dapat notif saat di homepage
3. ✅ Dapat notif dari room lain saat di chat
4. ✅ Sound play untuk setiap pesan baru
5. ✅ PWA notification bekerja saat app closed

**Selamat! Notifikasi sudah sempurna! 🎉**
