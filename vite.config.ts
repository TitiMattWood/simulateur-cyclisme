import { defineConfig, type Plugin } from 'vite';

/**
 * Identifiant de version : change à chaque construction. Il est inscrit dans le code
 * (__BUILD_ID__) et publié dans version.json ; l'application compare les deux pour proposer
 * de recharger quand une nouvelle version est en ligne.
 */
const BUILD_ID = new Date().toISOString();

function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
    },
  };
}

// base: './' → l'application fonctionne aussi bien sur GitHub Pages
// (sous-dossier /simulateur-cyclisme/) que sur un NAS à la racine.
export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [versionFile()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
  server: { host: true },
});
