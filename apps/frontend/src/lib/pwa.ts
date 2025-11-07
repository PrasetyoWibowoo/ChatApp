/**
 * PWA Service Worker Registration
 * Handles installation, updates, and offline support
 */

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });

        console.log('[PWA] Service Worker registered successfully:', registration.scope);

        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          console.log('[PWA] New Service Worker found, installing...');

          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New service worker available, prompt user to reload
                console.log('[PWA] New version available! Refresh to update.');
                showUpdateNotification();
              }
            });
          }
        });

        // Check for updates every hour
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);

      } catch (error) {
        console.error('[PWA] Service Worker registration failed:', error);
      }
    });
  } else {
    console.log('[PWA] Service Workers not supported');
  }
}

function showUpdateNotification() {
  // You can implement a custom UI here
  const shouldReload = confirm('New version available! Reload to update?');
  if (shouldReload) {
    window.location.reload();
  }
}

/**
 * Request notification permissions for PWA
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.log('[PWA] This browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

/**
 * Show a local notification
 */
export function showNotification(title: string, options?: NotificationOptions) {
  if (Notification.permission === 'granted') {
    const defaultOptions: NotificationOptions = {
      icon: '/icon-192x192.png',
      badge: '/icon-72x72.png',
      tag: 'chat-notification',
      ...options,
    };

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      // Use service worker notification (works in background)
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, defaultOptions);
      });
    } else {
      // Fallback to regular notification
      new Notification(title, defaultOptions);
    }
  }
}

/**
 * Check if app is running as PWA
 */
export function isPWA(): boolean {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isIOSStandalone = (window.navigator as any).standalone === true;
  
  return isStandalone || (isIOS && isIOSStandalone);
}

/**
 * Show install prompt for PWA
 */
let deferredPrompt: any = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  console.log('[PWA] Install prompt ready');
  
  // Show custom install button
  showInstallButton();
});

function showInstallButton() {
  // You can implement a custom install button here
  // For now, just log
  console.log('[PWA] App can be installed');
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) {
    console.log('[PWA] Install prompt not available');
    return false;
  }

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  
  console.log('[PWA] User choice:', outcome);
  deferredPrompt = null;
  
  return outcome === 'accepted';
}

window.addEventListener('appinstalled', () => {
  console.log('[PWA] App installed successfully');
  deferredPrompt = null;
});

/**
 * Network status monitoring
 */
export function monitorNetworkStatus() {
  window.addEventListener('online', () => {
    console.log('[PWA] Back online');
    showNotification('You\'re back online!', {
      body: 'Connection restored',
      tag: 'network-status',
    });
  });

  window.addEventListener('offline', () => {
    console.log('[PWA] Gone offline');
    showNotification('You\'re offline', {
      body: 'Some features may be limited',
      tag: 'network-status',
    });
  });
}
