# PWA Setup Guide

This application is now a **Progressive Web App (PWA)** that can be installed on desktop and mobile devices!

## ✨ Features

- 📱 **Install on Any Device** - Works on PC, iPhone, Android
- 🔔 **Push Notifications** - Get notified of new messages (iOS 16.4+)
- 📴 **Offline Support** - Basic functionality works offline
- 🚀 **Fast Loading** - Cached assets for instant loading
- 🎨 **Native Feel** - Fullscreen mode without browser UI
- 📞 **WebRTC Support** - Voice & video calls work perfectly

## 📲 How to Install

### On iPhone/iPad (Safari)
1. Open website in **Safari** browser
2. Tap the **Share** button (square with arrow up) at the bottom
3. Scroll down and tap **"Add to Home Screen"**
4. Edit the name if you want
5. Tap **"Add"**
6. App icon will appear on your home screen!

### On Android (Chrome)
1. Open website in **Chrome** browser
2. Tap the **menu** (three dots) in top right
3. Tap **"Add to Home screen"** or **"Install app"**
4. Confirm installation
5. App icon will appear on your home screen!

### On Windows PC (Chrome/Edge)
1. Open website in **Chrome** or **Edge** browser
2. Click the **install icon** (⊕) in the address bar
3. Or go to menu → **"Install [App Name]"**
4. Click **"Install"**
5. App will open in its own window!

### On Mac (Safari/Chrome)
1. Open website in **Safari** or **Chrome**
2. For Safari: File → Add to Dock
3. For Chrome: Click install icon in address bar
4. App can run standalone!

## 🔧 Development

### Generate PWA Icons
```bash
# Install sharp (image processing library)
npm install sharp --save-dev

# Generate all icon sizes from logo.png
node scripts/generate-icons.js
```

### Test PWA Locally
```bash
# Build the app
npm run build

# Preview with production settings
npm run preview

# Open in browser and test PWA features
```

### Check PWA Score
1. Open DevTools (F12)
2. Go to **Lighthouse** tab
3. Run **PWA** audit
4. Check score and recommendations

## 📋 PWA Checklist

✅ **Manifest.json** - Configured with app metadata  
✅ **Service Worker** - Handles offline caching  
✅ **Icons** - Multiple sizes for all devices (72px to 512px)  
✅ **Apple Touch Icons** - iOS support  
✅ **Theme Colors** - Native app feel  
✅ **Meta Tags** - SEO and social sharing  
✅ **HTTPS** - Required for PWA (Vercel provides this)  
✅ **Responsive** - Mobile-optimized layout  
✅ **WebRTC** - Video calls work in PWA mode  

## 🌐 Browser Support

| Feature | Chrome | Edge | Safari | Firefox | iOS Safari |
|---------|--------|------|--------|---------|------------|
| Install | ✅ | ✅ | ⚠️ | ⚠️ | ✅ |
| Service Worker | ✅ | ✅ | ✅ | ✅ | ✅ |
| Push Notifications | ✅ | ✅ | ✅ | ✅ | ✅ (16.4+) |
| WebRTC | ✅ | ✅ | ✅ | ✅ | ✅ |
| Offline | ✅ | ✅ | ✅ | ✅ | ✅ |

⚠️ = Limited support (can add to home screen manually)

## 🚀 Deployment

PWA features work automatically when deployed to:
- ✅ **Vercel** (already configured)
- ✅ **Netlify**
- ✅ **GitHub Pages** (with HTTPS)
- ✅ Any HTTPS hosting

**Important:** PWA requires HTTPS! Development on localhost is okay.

## 📱 Screenshots

Take screenshots for app stores (optional):
- Desktop: 1280x720 or 1920x1080
- Mobile: 750x1334 (iPhone) or 1080x1920 (Android)
- Place in `public/` folder
- Update `manifest.json` with screenshot paths

## 🔔 Push Notifications

To enable push notifications:

```typescript
import { requestNotificationPermission, showNotification } from './lib/pwa';

// Request permission
const granted = await requestNotificationPermission();

// Show notification
if (granted) {
  showNotification('New Message', {
    body: 'You have a new chat message',
    icon: '/icon-192x192.png',
  });
}
```

## 🎯 Tips for Best PWA Experience

1. **Always use HTTPS** in production
2. **Test on real devices** - iOS and Android behave differently
3. **Keep Service Worker updated** - Users get prompted to refresh
4. **Optimize images** - PWA icons should be optimized
5. **Test offline mode** - Ensure critical features work offline
6. **Monitor performance** - Use Lighthouse to check PWA score

## 🐛 Troubleshooting

### PWA not installing
- ✅ Check HTTPS is enabled
- ✅ Verify manifest.json is accessible
- ✅ Check Service Worker is registered
- ✅ Clear cache and try again

### Icons not showing
- ✅ Run `node scripts/generate-icons.js`
- ✅ Check icons exist in `public/` folder
- ✅ Verify paths in `manifest.json`

### Notifications not working
- ✅ Check permissions are granted
- ✅ iOS requires 16.4+ for PWA notifications
- ✅ Service Worker must be active

### Offline mode issues
- ✅ Check Service Worker logs in DevTools
- ✅ Verify files are cached properly
- ✅ Test with DevTools → Application → Service Workers

## 📚 Resources

- [MDN PWA Guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [Web.dev PWA](https://web.dev/progressive-web-apps/)
- [iOS PWA Support](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [Android PWA](https://developer.android.com/topic/google-play-instant/progressive-web-apps)

## 🎉 Success!

Your app is now installable as a PWA! Users can enjoy:
- ✨ Native app experience
- 🚀 Instant loading
- 📴 Offline access
- 🔔 Push notifications
- 📱 Home screen icon

Happy coding! 🎊
