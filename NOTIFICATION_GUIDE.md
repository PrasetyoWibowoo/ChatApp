# 🔔 Panduan Notifikasi ChatApp

## ✨ Fitur Notifikasi yang Tersedia

Aplikasi ChatApp sekarang memiliki sistem notifikasi lengkap yang bekerja di berbagai kondisi:

### 📱 **Notifikasi Bekerja Saat:**
- ✅ **Di Homepage** - Dapat notif dari semua room
- ✅ **Di Chat Room Lain** - Dapat notif dari room yang tidak dibuka
- ✅ **Tab Background** - Browser terbuka tapi tab tidak aktif
- ✅ **App Closed** - PWA terinstall tapi app tertutup (desktop/mobile)
- ✅ **Browser Closed** - Service Worker menangani (terbatas)

---

## 🎯 Cara Mengaktifkan Notifikasi

### **1. Allow Notification Permission**

#### **Di PC/Desktop:**
1. Buka aplikasi di browser
2. Akan muncul popup **"Allow notifications?"**
3. Klik **"Allow"** atau **"Izinkan"**
4. Jika terlewat: Settings browser → Site settings → Notifications → Allow

#### **Di iPhone/iPad:**
1. Install PWA dulu (Add to Home Screen)
2. Buka app dari home screen
3. Popup muncul: **"[App] Would Like to Send You Notifications"**
4. Tap **"Allow"**
5. ⚠️ Requirement: **iOS 16.4+**

#### **Di Android:**
1. Buka aplikasi di Chrome
2. Banner muncul: **"Allow notifications"**
3. Tap **"Allow"**
4. Atau: Settings → Apps → [App] → Notifications → On

---

### **2. Install sebagai PWA (Recommended)**

Untuk notifikasi yang lebih reliable, install sebagai PWA:

#### **PC/Desktop:**
- Chrome/Edge: Klik icon **⊕** di address bar → Install
- Icon akan muncul di desktop/start menu

#### **iPhone:**
- Safari: Share → Add to Home Screen
- Icon muncul di home screen

#### **Android:**
- Chrome: Menu → Install app
- Icon muncul di app drawer

---

## 🔊 Notifikasi yang Akan Anda Terima

### **Saat Di Homepage:**
- 💬 **Pesan baru dari semua room** yang Anda join
- 🔔 **Desktop notification** dengan preview pesan
- 🔊 **Notification sound** otomatis play
- 👆 **Klik notif** langsung ke room tersebut

### **Saat Di Chat Room:**
- 💬 **Pesan dari room lain** tetap dapat notif
- 🔔 **Room yang dibuka** tidak ada notif duplikat
- 🔊 **Sound play** untuk semua pesan baru

### **Saat App Closed (PWA):**
- 🔔 **Push notification** via Service Worker
- 📳 **Vibration** (mobile)
- 🔊 **System notification sound** (bukan custom sound)
- 👆 **Tap notif** membuka app langsung

---

## ⚙️ Pengaturan Notifikasi

### **Browser Settings:**

#### **Chrome/Edge (PC):**
1. Settings → Privacy and security → Site settings
2. Notifications → Find your site
3. Toggle: Allow notifications
4. Optional: Sound, Show notification on lock screen

#### **Safari (Mac):**
1. Safari → Preferences → Websites
2. Notifications → Find your site
3. Allow notifications

#### **Mobile (Chrome Android):**
1. Settings → Site settings
2. Notifications → Find your site
3. Toggle on/off

#### **iPhone (Safari/PWA):**
1. Settings → [App Name]
2. Notifications → Allow Notifications
3. Banner Style, Sounds, Badges

---

## 🐛 Troubleshooting

### **❌ Notifikasi Tidak Muncul?**

#### **Cek Permission:**
```
1. Buka browser DevTools (F12)
2. Console → ketik: Notification.permission
3. Harus return: "granted"
4. Jika "denied" → Reset di browser settings
```

#### **Cek Service Worker (PWA):**
```
1. DevTools → Application tab
2. Service Workers → Harus status "activated"
3. Jika error → Unregister → Refresh page
```

#### **iOS Tidak Ada Notif:**
- ✅ Cek iOS versi: Settings → General → About (minimum 16.4)
- ✅ Install sebagai PWA (Add to Home Screen) dulu
- ✅ Allow notification dari Settings → [App]

#### **Sound Tidak Play:**
- ✅ Click/tap page minimal 1x (browser autoplay policy)
- ✅ Cek volume device tidak mute
- ✅ Cek browser tidak block autoplay
- ✅ Chrome: Settings → Site settings → Sound → Allow

### **❌ Notifikasi Duplikat?**

Ini normal jika:
- Browser tab dan PWA app sama-sama buka
- Multiple tabs dari app yang sama

**Solusi:** Gunakan hanya 1 instance (PWA atau browser, bukan keduanya)

---

## 🎯 Best Practices

### **Untuk User:**
1. ✅ **Install PWA** untuk notifikasi paling reliable
2. ✅ **Allow notification** saat diminta
3. ✅ **Jangan block notification** di browser settings
4. ✅ **Keep Service Worker active** (jangan clear site data)

### **Untuk Admin/Developer:**
1. ✅ **HTTPS wajib** (sudah aktif di Vercel)
2. ✅ **Service Worker registered** (sudah otomatis)
3. ✅ **Icon ada** di public folder
4. ✅ **Manifest.json valid** (sudah setup)

---

## 📊 Notification Behavior

| Kondisi | Desktop Notif | Sound | Banner | Vibrate |
|---------|---------------|-------|--------|---------|
| **Homepage (Tab Active)** | ❌ | ✅ | ❌ | ❌ |
| **Homepage (Tab Background)** | ✅ | ✅ | ✅ | ✅ |
| **Chat Room (Same Room)** | ❌ | ✅ | ❌ | ❌ |
| **Chat Room (Other Room)** | ✅ | ✅ | ✅ | ✅ |
| **PWA Closed** | ✅ | ⚠️* | ✅ | ✅ |
| **Browser Closed** | ⚠️** | ❌ | ⚠️** | ⚠️** |

**Legend:**
- ✅ = Bekerja
- ❌ = Tidak ada
- ⚠️* = System sound, bukan custom sound
- ⚠️** = Terbatas, tergantung browser dan OS

---

## 💡 Tips & Tricks

### **Mendapatkan Notifikasi Maksimal:**

1. **Install PWA** (bukan hanya bookmark)
   - Desktop: Lebih reliable daripada browser tab
   - Mobile: Dapat notif bahkan app tertutup

2. **Allow Background Sync** (otomatis di PWA)
   - Browser dapat update bahkan tidak dibuka
   - Service Worker tetap monitoring

3. **Jangan Disable Service Worker**
   - Clear cache OK, tapi jangan unregister SW
   - SW handle notifikasi background

4. **Test Notifikasi:**
   ```
   1. Buka 2 device/tab berbeda
   2. Login user berbeda
   3. Kirim message dari satu
   4. Cek notif di yang lain
   ```

---

## 🔐 Privacy & Security

### **Data Notifikasi:**
- ✅ **Local only** - Tidak disimpan di server pihak ketiga
- ✅ **WebSocket real-time** - Langsung dari backend Anda
- ✅ **No tracking** - Tidak ada analytics notification
- ✅ **End-to-end** - Dari sender langsung ke receiver

### **Permission:**
- ✅ **User control** - User bisa revoke kapan saja
- ✅ **Per-site** - Tidak affect site lain
- ✅ **Transparent** - User tahu apa yang di-allow

---

## 📞 Support

### **Masalah Notifikasi?**

1. **Check Console Logs:**
   ```
   F12 → Console → Filter: "Notification" atau "Global"
   ```

2. **Check Service Worker:**
   ```
   F12 → Application → Service Workers
   ```

3. **Test Permission:**
   ```javascript
   // Di console
   Notification.permission // Should return "granted"
   ```

4. **Force Re-request:**
   ```javascript
   // Di console (jika stuck)
   Notification.requestPermission()
   ```

---

## 🎉 Selamat Menikmati Notifikasi!

Notifikasi sekarang bekerja di:
- ✅ PC Desktop
- ✅ Mac
- ✅ iPhone/iPad (iOS 16.4+)
- ✅ Android
- ✅ Browser & PWA
- ✅ Background & Foreground

**Tidak akan ketinggalan pesan lagi!** 🚀📱💻
