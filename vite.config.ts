import { defineConfig } from 'vite';

// base: './' → l'application fonctionne aussi bien sur GitHub Pages
// (sous-dossier /simulateur-cyclisme/) que sur un NAS à la racine.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
  server: { host: true },
});
