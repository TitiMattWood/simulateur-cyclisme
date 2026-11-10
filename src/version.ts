/**
 * Détection d'une nouvelle version en ligne : on relit version.json (sans passer par le cache)
 * au démarrage, toutes les 5 minutes et quand l'onglet redevient visible. Si l'identifiant
 * diffère de celui de la version chargée, onNew() est appelé (une seule fois).
 */
declare const __BUILD_ID__: string;

export const BUILD_ID: string = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

export function watchForUpdates(onNew: () => void, everyMs = 5 * 60 * 1000): void {
  if (BUILD_ID === 'dev' || import.meta.env.DEV) return; // pas en développement local
  let notified = false;
  const check = async () => {
    if (notified) return;
    try {
      const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const { build } = (await res.json()) as { build?: string };
      if (build && build !== BUILD_ID) {
        notified = true;
        onNew();
      }
    } catch {
      /* hors ligne : on réessaiera plus tard */
    }
  };
  window.setTimeout(check, 15000);
  window.setInterval(check, everyMs);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}
