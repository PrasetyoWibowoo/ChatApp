# Vercel Environment Variable Setup

## Mixed Content Error Fix

The app was showing "Mixed Content" errors because it was trying to connect to `http://` URLs from an HTTPS page.

## Solution: Set Environment Variable

You need to set the `VITE_API_URL` environment variable in Vercel:

### Steps:

1. Go to your Vercel dashboard: https://vercel.com/dashboard
2. Select your project: `chat-app-sigma-topaz-55`
3. Go to **Settings** → **Environment Variables**
4. Add new environment variable:
   - **Name**: `VITE_API_URL`
   - **Value**: `https://chatapp-0.up.railway.app`
   - **Environments**: Select all (Production, Preview, Development)
5. Click **Save**
6. Go to **Deployments** tab
7. Click the **...** menu on the latest deployment
8. Click **Redeploy** → **Redeploy with existing Build Cache**

### Why This Works:

- Frontend hosted on Vercel (HTTPS): `https://chat-app-sigma-topaz-55.vercel.app`
- Backend hosted on Railway (HTTPS): `https://chatapp-0.up.railway.app`
- All code now uses `import.meta.env.VITE_API_URL` instead of hardcoded URLs
- WebSocket automatically converts `https` → `wss` for secure connections

### Files Changed:

- `apps/frontend/src/lib/api.ts` - API base URL
- `apps/frontend/src/lib/notifications.ts` - Global notification WebSocket URL
- `apps/frontend/src/pages/Chat.tsx` - Chat room WebSocket URL
- `apps/frontend/src/pages/Home.tsx` - API calls for room list

### Expected Result:

After setting the environment variable and redeploying:
- ✅ No more Mixed Content errors
- ✅ API calls work: `https://chatapp-0.up.railway.app/api/...`
- ✅ WebSocket connects: `wss://chatapp-0.up.railway.app/ws/...`
- ✅ Notifications work across rooms
- ✅ Video calls work
- ✅ Real-time chat works

### Testing:

1. Open browser console (F12)
2. Should NOT see "Mixed Content" errors
3. Should see: `[Global Notification] Connected to room: general`
4. Test notification with: `window.testNotification()`
5. Send message from another device/browser - notification should appear

### Troubleshooting:

If still not working after setting environment variable:
1. Check if variable is set: Go to Vercel Settings → Environment Variables
2. Make sure you redeployed AFTER setting the variable
3. Clear browser cache and reload the page
4. Check console for WebSocket connection logs
