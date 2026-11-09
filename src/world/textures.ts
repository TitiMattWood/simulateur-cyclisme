/**
 * Textures du monde, dessinées par le code (aucun fichier à télécharger).
 *
 * Atlas de chaussée : 4 colonnes côte à côte (en travers de la route), répétées le long de la
 * route (1 répétition = ROAD_PERIOD mètres) :
 *   0 — route de campagne : ligne centrale discontinue + lignes de rive continues ;
 *   1 — rue de ville : ligne centrale discontinue ;
 *   2 — enrobé sans marquage (rues étroites, sens unique, ronds-points, pistes) ;
 *   3 — gravier / terre (teinté par la couleur du chemin).
 */
import * as THREE from 'three';

/** Longueur (m) couverte par une répétition de la texture le long de la route. */
export const ROAD_PERIOD = 8;
export const ROAD_COLUMNS = 4;

function rng(seed: number): () => number {
  let x = seed >>> 0;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
}

let roadTex: THREE.CanvasTexture | null = null;

export function roadAtlas(): THREE.CanvasTexture {
  if (roadTex) return roadTex;
  const colW = 128, H = 512; // 512 px = ROAD_PERIOD mètres → 64 px par mètre
  const c = document.createElement('canvas');
  c.width = colW * ROAD_COLUMNS;
  c.height = H;
  const g = c.getContext('2d')!;
  const r = rng(17);
  const pxPerM = H / ROAD_PERIOD;
  for (let col = 0; col < ROAD_COLUMNS; col++) {
    const x0 = col * colW;
    // fond : enrobé gris (ou gravier clair pour la colonne 3)
    g.fillStyle = col === 3 ? '#c8b896' : '#56595e';
    g.fillRect(x0, 0, colW, H);
    // grain : petits points clairs et sombres
    for (let k = 0; k < 3500; k++) {
      const v = r();
      g.fillStyle = col === 3
        ? (v > 0.5 ? 'rgba(90,70,40,0.35)' : 'rgba(255,245,220,0.35)')
        : (v > 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.10)');
      const s = col === 3 ? 1 + r() * 2.5 : 1 + r();
      g.fillRect(x0 + 2 + r() * (colW - 4), r() * H, s, s);
    }
    // traces d'usure (bandes de roulement un peu plus claires)
    if (col < 3) {
      g.fillStyle = 'rgba(255,255,255,0.035)';
      g.fillRect(x0 + colW * 0.2, 0, colW * 0.12, H);
      g.fillRect(x0 + colW * 0.68, 0, colW * 0.12, H);
    }
    g.fillStyle = '#ecebe6';
    // ligne centrale discontinue : 3 m de trait, 5 m d'espace (ligne type T1 hors agglomération)
    if (col === 0 || col === 1) {
      const w = col === 0 ? 5 : 4;
      g.fillRect(x0 + colW / 2 - w / 2, 0, w, 3 * pxPerM);
    }
    // lignes de rive continues
    if (col === 0) {
      g.fillRect(x0 + 6, 0, 4, H);
      g.fillRect(x0 + colW - 10, 0, 4, H);
    }
  }
  roadTex = new THREE.CanvasTexture(c);
  roadTex.colorSpace = THREE.SRGBColorSpace;
  roadTex.wrapS = THREE.ClampToEdgeWrapping;
  roadTex.wrapT = THREE.RepeatWrapping;
  roadTex.anisotropy = 8;
  return roadTex;
}

/**
 * Coordonnée de texture en travers de la route pour une colonne donnée de l'atlas
 * (t = 0 bord gauche, 1 bord droit). Une petite marge évite de « baver » sur la colonne voisine.
 */
export function roadU(col: number, t: number): number {
  const m = 0.02;
  return (col + m + t * (1 - 2 * m)) / ROAD_COLUMNS;
}

// ---------------------------------------------------------------------------
// Façades

/**
 * Atlas de façades : 4 × 4 cases (9 utilisées). Chaque case représente UNE travée (≈ 3 m) sur UN étage.
 * Les murs portent des coordonnées « en travées / en étages » ; le shader répète la case
 * voulue (voir facadeMaterial). Les couleurs claires sont teintées par la couleur du
 * bâtiment (enduit), les matériaux (pierre, brique, verre) gardent leur teinte.
 */
export const FACADE = {
  pavillon: 0, meuliere: 1, balcons: 2, bureaux: 3, vitrine: 4, pierre: 5, bardage: 6, brique: 7, enduit: 8,
} as const;
export type FacadeStyle = keyof typeof FACADE;
const CELLS = 4; // 4 × 4 cases de 256 px = 1024 px (puissance de 2 : réductions de texture correctes)
const S = 256;

function drawWindow(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frame = '#f4f2ec', bars = true): void {
  g.fillStyle = frame;
  g.fillRect(x - 5, y - 5, w + 10, h + 10);
  const grad = g.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, '#5d7286');
  grad.addColorStop(0.55, '#2f3e4c');
  grad.addColorStop(1, '#46596b');
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  // reflet du ciel
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath();
  g.moveTo(x, y + h * 0.35); g.lineTo(x + w * 0.45, y); g.lineTo(x + w * 0.62, y); g.lineTo(x, y + h * 0.6);
  g.fill();
  if (bars) {
    g.fillStyle = frame;
    g.fillRect(x + w / 2 - 2, y, 4, h);
    g.fillRect(x, y + h * 0.42, w, 3);
  }
}

function noise(g: CanvasRenderingContext2D, x0: number, y0: number, r: () => number, n = 900, a = 0.06): void {
  for (let k = 0; k < n; k++) {
    g.fillStyle = r() > 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;
    g.fillRect(x0 + r() * S, y0 + r() * S, 2, 2);
  }
}

let facadeTex: THREE.CanvasTexture | null = null;

export function facadeAtlas(): THREE.CanvasTexture {
  if (facadeTex) return facadeTex;
  const c = document.createElement('canvas');
  c.width = c.height = S * CELLS;
  const g = c.getContext('2d')!;
  const r = rng(29);
  // case n → colonne n % CELLS, ligne (depuis le BAS de l'image) floor(n / CELLS)
  const at = (n: number): [number, number] => [(n % CELLS) * S, (CELLS - 1 - Math.floor(n / CELLS)) * S];
  const cell = (n: number, draw: (x0: number, y0: number) => void) => {
    const [x0, y0] = at(n);
    g.save();
    g.beginPath();
    g.rect(x0, y0, S, S);
    g.clip();
    draw(x0, y0);
    g.restore();
  };
  g.fillStyle = '#f2efe9';
  g.fillRect(0, 0, c.width, c.height);
  // 0 — pavillon : enduit, fenêtre à volets, appui
  cell(FACADE.pavillon, (x, y) => {
    g.fillStyle = '#ffffff';
    g.fillRect(x, y, S, S);
    noise(g, x, y, r);
    drawWindow(g, x + 92, y + 70, 72, 104);
    g.fillStyle = '#6b7f78';
    g.fillRect(x + 54, y + 65, 30, 114);
    g.fillRect(x + 172, y + 65, 30, 114);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let k = 0; k < 6; k++) { g.fillRect(x + 54, y + 72 + k * 18, 30, 2); g.fillRect(x + 172, y + 72 + k * 18, 30, 2); }
    g.fillStyle = '#e2ddd2';
    g.fillRect(x + 82, y + 180, 92, 8);
  });
  // 1 — meulière : moellons ocre et bruns, joints clairs, encadrement brique
  cell(FACADE.meuliere, (x, y) => {
    // joints clairs, petits moellons irréguliers ocre-brun (vus de la rue, assez fondus)
    g.fillStyle = '#d9c6a6';
    g.fillRect(x, y, S, S);
    const cols = ['#c9a374', '#bd935f', '#d3ad7d', '#b28657', '#c49a68', '#a97f52'];
    for (let row = 0; row < 18; row++) {
      let px = -r() * 12;
      while (px < S) {
        const w = 9 + r() * 14, hh = 10 + r() * 4;
        g.fillStyle = cols[Math.floor(r() * cols.length)];
        g.beginPath();
        g.ellipse(x + px + w / 2, y + row * 14.5 + 7, w / 2, hh / 2, (r() - 0.5) * 0.6, 0, Math.PI * 2);
        g.fill();
        px += w + 1.5;
      }
    }
    g.fillStyle = '#a4472f';
    g.fillRect(x + 80, y + 58, 96, 130);
    drawWindow(g, x + 92, y + 70, 72, 104, '#f2efe8');
  });
  // 2 — immeuble à balcons (années 60–80) : grande baie, dalle de balcon, garde-corps
  cell(FACADE.balcons, (x, y) => {
    g.fillStyle = '#ffffff';
    g.fillRect(x, y, S, S);
    noise(g, x, y, r, 600, 0.05);
    drawWindow(g, x + 40, y + 40, 176, 150, '#ebe8e2');
    g.fillStyle = '#cfcac0';
    g.fillRect(x, y + 196, S, 18);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(x, y + 214, S, 8);
    g.fillStyle = '#3d4246';
    g.fillRect(x, y + 140, S, 5);
    for (let k = 4; k < S; k += 14) g.fillRect(x + k, y + 140, 3, 56);
  });
  // 3 — bureaux : mur-rideau vitré, montants, allège
  cell(FACADE.bureaux, (x, y) => {
    const grad = g.createLinearGradient(x, y, x + S, y + S);
    grad.addColorStop(0, '#7f9bb2');
    grad.addColorStop(0.5, '#4b6377');
    grad.addColorStop(1, '#6f879b');
    g.fillStyle = grad;
    g.fillRect(x, y, S, S);
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.beginPath(); g.moveTo(x, y + 150); g.lineTo(x + 150, y); g.lineTo(x + 200, y); g.lineTo(x, y + 200); g.fill();
    g.fillStyle = '#c9d0d6';
    for (const k of [0, 126, 252]) g.fillRect(x + k - 4, y, 8, S);
    g.fillStyle = '#8f9aa3';
    g.fillRect(x, y + 214, S, 42);
  });
  // 4 — rez-de-chaussée commercial : vitrine, store rayé, enseigne
  cell(FACADE.vitrine, (x, y) => {
    g.fillStyle = '#f2f0ec';
    g.fillRect(x, y, S, S);
    const grad = g.createLinearGradient(x, y + 80, x, y + S);
    grad.addColorStop(0, '#9b8a73');
    grad.addColorStop(1, '#5d5143');
    g.fillStyle = grad;
    g.fillRect(x + 16, y + 86, S - 32, S - 96);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(x + 30, y + 96, 50, S - 116);
    g.fillStyle = '#2f3438';
    g.fillRect(x + 16, y + 86, S - 32, 6);
    g.fillRect(x + S / 2 - 3, y + 86, 6, S - 96);
    for (let k = 0; k < 8; k++) {
      g.fillStyle = k % 2 ? '#f5f5f5' : '#b23a2e';
      g.fillRect(x + k * 32, y + 34, 32, 40);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x, y + 74, S, 8);
    g.fillStyle = '#26303a';
    g.fillRect(x + 20, y + 6, S - 40, 24);
  });
  // 5 — vieille pierre de village : moellons calcaires, petite fenêtre, volets bois
  cell(FACADE.pierre, (x, y) => {
    g.fillStyle = '#c9bea4';
    g.fillRect(x, y, S, S);
    for (let row = 0; row < 12; row++) {
      let px = -r() * 30;
      while (px < S) {
        const w = 22 + r() * 34;
        g.fillStyle = ['#dcd2b8', '#d2c5a6', '#e3dac4', '#c7b994'][Math.floor(r() * 4)];
        g.fillRect(x + px + 2, y + row * 22 + 2, w - 3, 19);
        px += w;
      }
    }
    g.fillStyle = '#b9ab8a';
    g.fillRect(x + 92, y + 78, 72, 108);
    drawWindow(g, x + 100, y + 86, 56, 92, '#efe9dc');
    g.fillStyle = '#7a5a3c';
    g.fillRect(x + 68, y + 82, 26, 100);
    g.fillRect(x + 162, y + 82, 26, 100);
  });
  // 6 — bardage métallique (hangars, entrepôts)
  cell(FACADE.bardage, (x, y) => {
    for (let k = 0; k < S; k += 16) {
      g.fillStyle = '#e1e4e6';
      g.fillRect(x + k, y, 8, S);
      g.fillStyle = '#b3b8bc';
      g.fillRect(x + k + 8, y, 8, S);
    }
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(x, y + S - 10, S, 10);
  });
  // 7 — brique : appareil rouge, fenêtre à encadrement blanc
  cell(FACADE.brique, (x, y) => {
    g.fillStyle = '#d9cfc2';
    g.fillRect(x, y, S, S);
    for (let row = 0; row < 16; row++) {
      for (let k = -1; k < 6; k++) {
        g.fillStyle = ['#a8513a', '#9a4632', '#b25c43', '#8f412f'][Math.floor(r() * 4)];
        g.fillRect(x + k * 52 + (row % 2) * 26 + 2, y + row * 16 + 2, 48, 13);
      }
    }
    drawWindow(g, x + 92, y + 70, 72, 104, '#f4f2ec');
  });
  // 8 — enduit nu (pignons, annexes)
  cell(FACADE.enduit, (x, y) => {
    g.fillStyle = '#ffffff';
    g.fillRect(x, y, S, S);
    noise(g, x, y, r, 1200, 0.05);
  });
  facadeTex = new THREE.CanvasTexture(c);
  facadeTex.colorSpace = THREE.SRGBColorSpace;
  facadeTex.anisotropy = 8;
  return facadeTex;
}

let facadeMat: THREE.MeshStandardMaterial | null = null;

/**
 * Matériau des murs : la texture de l'atlas est répétée case par case. Attributs attendus :
 * uv (travées, étages), color (teinte de l'enduit), aCell (case des étages, case du rez-de-chaussée).
 */
export function facadeMaterial(): THREE.MeshStandardMaterial {
  if (facadeMat) return facadeMat;
  const m = new THREE.MeshStandardMaterial({ map: facadeAtlas(), vertexColors: true, roughness: 0.88, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aCell;\nvarying vec2 vCell;\nvarying vec2 vFacade;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvFacade = uv;\nvCell = aCell;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCell;\nvarying vec2 vFacade;')
      .replace('#include <map_fragment>', `
        // arrondi : la valeur interpolée peut valoir 7,9999 au lieu de 8 (mauvaise case)
        float cellId = floor((vFacade.y < 1.0 ? vCell.y : vCell.x) + 0.5);
        vec2 f = fract(vFacade);
        vec2 cellXY = vec2(mod(cellId, ${CELLS}.0), floor(cellId / ${CELLS}.0));
        const float m = 0.04;
        vec2 cuv = (cellXY + m + f * (1.0 - 2.0 * m)) / ${CELLS}.0;
        // niveau de détail limité : au-delà, les cases voisines de l'atlas se mélangeraient
        vec2 gx = dFdx(vFacade) * (1.0 - 2.0 * m) / ${CELLS}.0;
        vec2 gy = dFdy(vFacade) * (1.0 - 2.0 * m) / ${CELLS}.0;
        float texels = max(length(gx), length(gy)) * ${S * CELLS}.0;
        float rawLod = log2(max(texels, 1e-4));
        vec4 detail = textureLod(map, cuv, clamp(rawLod, 0.0, 3.0));
        // de loin : couleur moyenne de la case (pas de scintillement des fenêtres)
        vec4 avg = textureLod(map, (cellXY + 0.5) / ${CELLS}.0, 6.3);
        diffuseColor *= mix(detail, avg, smoothstep(2.6, 4.6, rawLod));
      `);
  };
  facadeMat = m;
  return m;
}
