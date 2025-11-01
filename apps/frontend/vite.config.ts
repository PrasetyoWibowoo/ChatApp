import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

// Expose dev server on LAN so phones on the same Wi‑Fi can access it
export default defineConfig({
  plugins: [solid()],
  server: {
    host: true, // listen on 0.0.0.0
    port: 5173,
  },
  build: { target: 'esnext' }
});
