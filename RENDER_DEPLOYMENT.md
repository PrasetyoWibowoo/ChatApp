# 🚀 Deploy ke Render.com (FREE - No Credit Card!)

## Persiapan

✅ **Sudah selesai:**
- Repository GitHub: `PrasetyoWibowoo/ChatApp`
- Backend Rust sudah ready
- Frontend di Vercel sudah jalan
- Dockerfile sudah dioptimasi

## Step 1: Sign Up Render.com

1. Buka https://render.com
2. Klik **"Get Started"**
3. Sign up dengan **GitHub** (paling mudah)
4. **Tidak perlu credit card!** ✨

## Step 2: Deploy Backend

### A. Create Web Service

1. Di Render Dashboard, klik **"New +"** → **"Web Service"**

2. **Connect Repository:**
   - Klik **"Connect account"** untuk GitHub
   - Pilih repository: **ChatApp**
   - Klik **"Connect"**

3. **Configure Service:**
   ```
   Name: chatapp-backend
   Region: Singapore (paling dekat)
   Branch: main
   Root Directory: apps/backend
   Environment: Docker
   Instance Type: Free
   ```

4. Klik **"Create Web Service"** (jangan deploy dulu!)

### B. Setup Database Dulu

1. Kembali ke Dashboard, klik **"New +"** → **"PostgreSQL"**

2. **Configure Database:**
   ```
   Name: chatapp-db
   Region: Singapore
   Database: chatapp
   User: chatapp
   Plan: Free
   ```

3. Klik **"Create Database"**

4. Tunggu beberapa detik sampai database ready

5. **Copy Database URL:**
   - Di halaman database, klik tab **"Info"**
   - Copy **"Internal Database URL"** (yang pakai `postgresql://`)
   - Contoh: `postgresql://chatapp:xxxxx@dpg-xxxxx/chatapp`

### C. Add Environment Variables ke Backend

1. Kembali ke **chatapp-backend** service

2. Klik tab **"Environment"** di sidebar kiri

3. **Add Variables** (klik "Add Environment Variable"):

   ```
   DATABASE_URL = [paste Internal Database URL dari step B5]
   JWT_SECRET = ganti_dengan_random_string_panjang
   SMTP_SERVER = smtp.gmail.com
   SMTP_USERNAME = email_kamu@gmail.com
   SMTP_PASSWORD = app_password_gmail
   SMTP_FROM_EMAIL = email_kamu@gmail.com
   RUST_LOG = info
   BIND_ADDR = 0.0.0.0:8080
   ```

   **Cara membuat Gmail App Password:**
   - Buka https://myaccount.google.com/apppasswords
   - Generate password baru
   - Copy 16 karakter password
   - Paste ke `SMTP_PASSWORD`

4. Klik **"Save Changes"**

### D. Deploy!

1. Backend akan otomatis deploy setelah save environment variables

2. Atau klik **"Manual Deploy"** → **"Deploy latest commit"**

3. **Tunggu 3-5 menit** untuk build Docker image

4. Lihat logs untuk memastikan sukses:
   ```
   ChatApp Backend v1.0.1 starting...
   connecting to database...
   starting chat server on 0.0.0.0:8080
   ```

5. Copy **Backend URL** dari halaman service (atas):
   - Contoh: `https://chatapp-backend.onrender.com`

## Step 3: Update Frontend (Vercel)

1. Buka **Vercel Dashboard**: https://vercel.com

2. Pilih project **chat-app**

3. Klik **"Settings"** → **"Environment Variables"**

4. Edit/Add variable:
   ```
   VITE_API_URL = https://chatapp-backend.onrender.com
   ```

5. Klik **"Save"**

6. **Redeploy Frontend:**
   - Klik tab **"Deployments"**
   - Klik **⋯** di deployment terbaru
   - Klik **"Redeploy"**

## Step 4: Test! 🎉

1. Buka frontend Vercel: `https://chat-app-sigma-topaz-55.vercel.app`

2. **Test Signup:**
   - Klik "Sign Up"
   - Isi form
   - Submit

3. **Harusnya TIDAK ADA CORS ERROR lagi!** ✅

4. Check browser console (F12) - harusnya lihat:
   ```
   POST https://chatapp-backend.onrender.com/api/auth/signup
   Status: 200 OK
   ```

## Troubleshooting

### Backend tidak start:
- Check logs di Render dashboard
- Pastikan DATABASE_URL benar (copy dari Internal URL, bukan External)
- Pastikan semua env variables sudah diisi

### CORS masih error:
- Pastikan `VITE_API_URL` di Vercel sudah diupdate
- Hard refresh browser: `Ctrl + Shift + R`
- Check backend logs untuk request masuk

### Database connection error:
- Pastikan pakai **Internal Database URL** (bukan External)
- Format: `postgresql://user:password@hostname.internal/database`

## Free Tier Limits

| Item | Limit |
|------|-------|
| **Backend** | 750 hours/month (cukup untuk 1 bulan 24/7) |
| **Database** | 90 days gratis, lalu rotates to new instance |
| **Bandwidth** | Unlimited |
| **Build Time** | Unlimited |

**Tips:** Render free tier akan "sleep" setelah 15 menit tidak ada request. 
Cold start pertama butuh 30-60 detik. Setelah itu lancar!

## Next Steps

Setelah backend jalan di Render:
1. ✅ Test semua fitur (signup, login, chat)
2. ✅ Test dari device lain (mobile)
3. ✅ Monitor logs untuk errors
4. ✅ Setup custom domain (optional)

---

**Need help?** Render docs: https://render.com/docs
