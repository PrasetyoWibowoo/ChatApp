import { render } from 'solid-js/web';
import App from './App';
import './styles.css';
import { registerServiceWorker, monitorNetworkStatus, isPWA } from './lib/pwa';

// Initialize PWA features
registerServiceWorker();
monitorNetworkStatus();

// Log PWA status
if (isPWA()) {
  console.log('[PWA] Running as installed app');
} else {
  console.log('[PWA] Running in browser');
}

render(() => <App />, document.getElementById('root') as HTMLElement);
