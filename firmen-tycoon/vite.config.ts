import { defineConfig } from 'vite';

export default defineConfig({
  // Relative Pfade, damit der Build auch aus einem Unterordner läuft.
  base: './',
  server: {
    // Im WLAN erreichbar machen (Handy-Test).
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
});
