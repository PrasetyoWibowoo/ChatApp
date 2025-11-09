# 🔍 Notification Debug Checklist

## ⚠️ PENTING: Set Environment Variable Dulu!

**NOTIFICATIONS TIDAK AKAN WORK sampai environment variable di-set!**

### 1️⃣ Set VITE_API_URL di Vercel:

1. Buka: https://vercel.com/dashboard
2. Pilih project: `chat-app-sigma-topaz-55`
3. **Settings** → **Environment Variables**
4. **Add Variable**:
   - Name: `VITE_API_URL`
   - Value: `https://chatapp-0.up.railway.app`
   - Environments: ✅ Production ✅ Preview ✅ Development
5. **Save**
6. **Deployments** → **Redeploy** latest deployment

**Tunggu Vercel deploy selesai (~2 menit) sebelum test!**

---

## 2️⃣ Test Notifications Setelah Deploy:

### A. Buka Console (F12)

Setelah buka app di https://chat-app-sigma-topaz-55.vercel.app, cek console log:

#### ✅ **Yang HARUS Muncul:**

```
[PWA] Service Worker registered successfully: /
[PWA] Running in browser  (atau "Running as installed app")
[PWA] Detailed Status:
┌─────────────────────────────┬──────────────┐
│ serviceWorkerSupported      │ true         │
│ serviceWorkerRegistered     │ true         │
│ serviceWorkerActive         │ true         │  ← HARUS TRUE!
│ notificationSupported       │ true         │
│ notificationPermission      │ granted      │  ← HARUS GRANTED!
│ isPWA                       │ false/true   │
│ isOnline                    │ true         │
└─────────────────────────────┴──────────────┘
```

#### ✅ **Saat Login/Masuk Homepage:**

```
[Home] User ID: abc12345 Requesting notification permission...
[Home] Notification permission result: true
[Home] Initializing global notifications for user: abc12345
[Global Notification] API URL from env: https://chatapp-0.up.railway.app
[Global Notification] WebSocket URL: wss://chatapp-0.up.railway.app/ws
[Global Notification] Connecting to general room...
[Global Notification] Connected to room: general
```

#### ❌ **Yang TIDAK BOLEH Muncul:**

```
Mixed Content: The page at '...' was loaded over HTTPS, but requested an insecure resource...
WebSocket connection to 'wss://chat-app-sigma-topaz-55.vercel.app:8080/ws' failed
[Global Notification] WebSocket error
[Global Notification] API URL from env: undefined  ← MASALAH: ENV tidak ke-set!
```

---

### B. Manual Test Commands

Di browser console, jalankan command ini:

#### 1. **Check PWA Status:**
```javascript
window.getPWAStatus()
```

Expected output:
```
{
  serviceWorkerSupported: true,
  serviceWorkerRegistered: true,
  serviceWorkerActive: true,     ← HARUS TRUE
  notificationSupported: true,
  notificationPermission: "granted",  ← HARUS "granted"
  isPWA: false,
  isOnline: true
}
```

#### 2. **Check Notification Permission:**
```javascript
window.checkNotificationPermission()
```

Expected output:
```
[testNotification] Permission: granted
[testNotification] Service Worker: active
```

#### 3. **Test Notification (Manual):**
```javascript
window.testNotification()
```

Expected:
- ✅ Notification muncul di desktop
- ✅ Sound "ding" terdengar
- ✅ Console log: `[testNotification] Notification triggered`

---

### C. Test Real Scenario

#### Test 1: Homepage Notifications
1. Buka app di device/browser #1 → Login → Stay di **Homepage**
2. Buka app di device/browser #2 → Login dengan user berbeda
3. Device #2: Masuk ke room "general" → Send message
4. **Expected di Device #1:**
   - ✅ Console: `[Global Notification] ✅ Different room - Showing notification`
   - ✅ Notification muncul di desktop
   - ✅ Sound terdengar

#### Test 2: Background Notifications
1. Buka app → Login → Grant notification permission
2. **Close tab** atau minimize browser
3. Dari device lain: Send message ke room "general"
4. **Expected:**
   - ✅ Notification muncul di desktop (even app closed!)
   - ✅ Click notification → App opens to that room

#### Test 3: Different Room Notifications
1. Device #1: Masuk ke room "project-a"
2. Device #2: Send message ke room "general" (different room)
3. **Expected di Device #1:**
   - ✅ Notification muncul (karena di room berbeda)
   - ✅ Sound terdengar

4. Device #2: Send message ke room "project-a" (same room)
5. **Expected di Device #1:**
   - ❌ NO notification (karena di room yang sama)
   - ❌ Console: `[Global Notification] ❌ Same room - Skipping notification`

---

## 3️⃣ Troubleshooting

### Problem: "API URL from env: undefined"

**Cause:** Environment variable belum di-set di Vercel

**Fix:**
1. Set `VITE_API_URL` di Vercel Settings (lihat step 1 di atas)
2. **Redeploy** (PENTING! Environment variable hanya apply setelah redeploy)
3. Clear browser cache: Ctrl+Shift+Delete → Clear cache
4. Reload page: Ctrl+F5

### Problem: "Notification permission: denied"

**Cause:** User klik "Block" atau "Don't Allow" saat browser minta permission

**Fix:**

**Chrome/Edge:**
1. Klik **padlock icon** di address bar
2. Pilih **Site settings**
3. Scroll ke **Notifications** → Change to **Allow**
4. Reload page

**Firefox:**
1. Klik **padlock icon** di address bar
2. Klik **Clear permissions and reload**
3. Reload → Klik **Allow** saat diminta

**Safari (iOS/Mac):**
- iOS: Settings → Safari → (scroll ke website) → Notifications → Allow
- Mac: Safari → Settings for This Website → Notifications → Allow

### Problem: "serviceWorkerActive: false"

**Cause:** Service Worker belum register atau error

**Fix:**
1. Open DevTools → **Application** tab → **Service Workers**
2. Check if `/sw.js` is registered
3. If error: Click **Unregister** → Reload page
4. If not showing: Check console for SW registration errors

### Problem: WebSocket connection failed

**Cause:** Backend Railway app mungkin sleep (free tier)

**Fix:**
1. Buka backend URL di browser: https://chatapp-0.up.railway.app
2. Tunggu ~10-30 detik sampai backend wake up
3. Reload frontend app

### Problem: Notification muncul tapi no sound

**Cause:** Browser blocked autoplay atau audio file 404

**Fix:**
1. Check console: Harus ada log `[Notification Sound] Played successfully`
2. If error: Check browser autoplay settings
3. Unmute browser tab (klik speaker icon di tab)
4. User must interact with page first (click anywhere) before sound can play

---

## 4️⃣ Success Checklist

Sebelum bilang "notifications work", pastikan semua ini ✅:

- [ ] Environment variable `VITE_API_URL` set di Vercel
- [ ] Vercel sudah redeploy setelah set env variable
- [ ] Console log: `serviceWorkerActive: true`
- [ ] Console log: `notificationPermission: granted`
- [ ] Console log: `WebSocket URL: wss://chatapp-0.up.railway.app/ws`
- [ ] Console log: `Connected to room: general`
- [ ] `window.testNotification()` berhasil (notification + sound)
- [ ] Notification muncul di homepage saat ada message di room lain
- [ ] Notification muncul saat app closed/minimized
- [ ] Click notification membuka app ke room yang benar
- [ ] Sound "ding" terdengar saat notification muncul

---

## 5️⃣ Quick Reference

### Debug Commands:
```javascript
// Check status
window.getPWAStatus()

// Check permission
window.checkNotificationPermission()

// Test notification
window.testNotification()

// Check WebSocket URL
console.log(import.meta.env.VITE_API_URL)
```

### Expected WebSocket URL:
- ✅ Production: `wss://chatapp-0.up.railway.app/ws`
- ✅ Development: `ws://localhost:8080/ws`
- ❌ WRONG: `wss://chat-app-sigma-topaz-55.vercel.app:8080/ws`

### Backend Health Check:
- Open: https://chatapp-0.up.railway.app
- Should see: JSON response (not error)
- If 502 error: Backend is sleeping, wait 30 seconds

---

**Next Step:** Set environment variable di Vercel → Redeploy → Test!
