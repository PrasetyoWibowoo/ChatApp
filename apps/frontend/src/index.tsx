import { render } from 'solid-js/web';
import App from './App';
import './styles.css';
import { registerServiceWorker, monitorNetworkStatus, isPWA, getPWAStatus } from './lib/pwa';

// Initialize PWA features
registerServiceWorker();
monitorNetworkStatus();

// Log PWA status
if (isPWA()) {
  console.log('[PWA] Running as installed app');
} else {
  console.log('[PWA] Running in browser');
}

// Log detailed status after a short delay to allow SW registration
setTimeout(async () => {
  const status = await getPWAStatus();
  console.log('[PWA] Detailed Status:');
  console.table(status);
  
  if (!status.serviceWorkerActive) {
    console.warn('[PWA] ⚠️ Service Worker not active - background notifications will not work');
  }
  if (status.notificationPermission !== 'granted') {
    console.warn('[PWA] ⚠️ Notification permission not granted - please allow notifications');
  }
}, 2000);

render(() => <App />, document.getElementById('root') as HTMLElement);
