# 🚀 Deploy ke Koyeb (FREE - No Credit Card!)

Koyeb menyediakan:
- ✅ Gratis permanent (tidak ada trial)
- ✅ **NO credit card required**
- ✅ Proper CORS support
- ✅ Auto-deploy dari GitHub
- ✅ 512MB RAM, 2GB storage free tier

## Step-by-Step Deployment

### 1. Sign Up Koyeb

1. Buka https://app.koyeb.com/auth/signup
2. Sign up dengan **GitHub** (paling mudah)
3. **Tidak perlu credit card!** ✨
4. Verify email jika diminta

### 2. Create New Service

1. Di Koyeb Dashboard, klik **"Create Service"**
2. Pilih **"Deploy from GitHub"**
3. **Connect GitHub Account:**
   - Klik "Connect with GitHub"
   - Authorize Koyeb
   - Select repository: `PrasetyoWibowoo/ChatApp`

### 3. Configure Deployment

**Basic Settings:**
```
Builder: Docker
Dockerfile: apps/backend/Dockerfile
```

**Advanced Settings:**
- Klik "Advanced" di samping
- **Working Directory:** `apps/backend`
- **Port:** `8080`
- **Region:** `Singapore` (atau terdekat)
- **Instance Type:** `Free (Eco)`

### 4. Environment Variables

Scroll ke **"Environment variables"**, klik **"Add variable"**:

```
DATABASE_URL = postgresql://postgres:Razerorochi1@db.erhmqzediblmqruorrmt.supabase.co:5432/postgres
JWT_SECRET = chatapp_secure_jwt_secret_key_2024_production_v1
SMTP_SERVER = smtp.gmail.com
SMTP_USERNAME = singcbd@gmail.com
SMTP_PASSWORD = nevnrikdiychoqnn
SMTP_FROM_EMAIL = singcbd@gmail.com
RUST_LOG = info
BIND_ADDR = 0.0.0.0:8080
PORT = 8080
```

### 5. Health Check

Scroll ke **"Health checks"**:
- **Path:** `/health`
- **Port:** `8080`

### 6. Deploy!

1. Klik **"Create Service"** di bawah
2. Tunggu 3-5 menit untuk build Docker
3. Monitor di tab **"Logs"**
4. Tunggu status **"Healthy"** ✅

### 7. Copy Backend URL

Setelah deploy sukses:
- Di halaman service, copy **Public URL**
- Contoh: `https://chatapp-backend-prasety.koyeb.app`

### 8. Update Vercel

1. Buka https://vercel.com
2. Pilih project `chat-app`
3. Settings → Environment Variables
4. Edit `VITE_API_URL`:
   ```
   https://chatapp-backend-prasety.koyeb.app
   ```
5. Save → Redeploy

### 9. Test! 🎉

1. Buka frontend Vercel
2. Test signup/login
3. **CORS harusnya OK!** ✅

---

## Troubleshooting

**Build gagal:**
- Check logs untuk error messages
- Pastikan Dockerfile path benar
- Pastikan working directory: `apps/backend`

**Database connection error:**
- Pastikan DATABASE_URL benar (dari Supabase)
- Check backend logs untuk error detail

**CORS masih error:**
- Pastikan VITE_API_URL di Vercel sudah update
- Hard refresh browser: Ctrl+Shift+R

---

## Free Tier Limits

| Item | Limit |
|------|-------|
| **Compute** | 512MB RAM |
| **Storage** | 2GB |
| **Bandwidth** | 2.5GB/month |
| **Services** | 2 apps |

Cukup untuk personal project dan demo! 🚀

---

**Alternative jika Koyeb juga butuh kartu:**

Mari kita coba opsi terakhir yang pasti gratis tanpa credit card!
