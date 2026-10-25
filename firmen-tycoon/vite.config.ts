import { defineConfig } from 'vite';

export default defineConfig({
  // Relative Pfade, damit der Build auch aus einem Unterordner läuft.
  base: './',
  server: {
    // Im WLAN erreichbar machen (Handy-Test).
    host: true,
    port: 5173,
  },
  build: {
    // Three.js allein ist ~600 kB; Warnung erst darüber.
    chunkSizeWarningLimit: 900,
  },
  preview: {
    host: true,
    port: 4173,
  },
});
