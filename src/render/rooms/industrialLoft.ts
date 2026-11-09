/**
 * Loft industriel : mur de briques, poutres métalliques, verrière d'atelier, sol en béton,
 * ampoules à filament et enseigne néon « MyHomeRide ».
 */
import * as THREE from 'three';
import {
  type RoomSetup, std, glow, texMat, concrete, bricks, outdoorView, aoEdge, box, cyl, plant, fan, tvBezel, shelfWithItems,
  areaStrip, canvas, tex, type NeonSetting,
} from './common';

/** Texture de l'enseigne : texte en tube néon (cœur clair + halo coloré), fond transparent. */
function neonSign(text: string, color: string): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 256);
  g.font = 'italic 700 120px "Brush Script MT", "Segoe Script", cursive, system-ui';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 28;
  g.lineWidth = 10;
  g.strokeStyle = color;
  g.strokeText(text, 512, 128);
  g.shadowBlur = 0;
  g.lineWidth = 4;
  g.strokeStyle = '#ffffff';
  g.strokeText(text, 512, 128);
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function industrialLoft(neon: NeonSetting = { color: '#ff4fa8', on: true }): RoomSetup {
  const g = new THREE.Group();
  const tv = { x: 3.12, y: 1.42, w: 1.65, h: 0.93 };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // ----- Structure
  box(g, texMat(concrete('#6f7174', 21, 3), 0.35), 0, -0.05, 0.6, 7.2, 0.1, 7.6, false);
  box(g, texMat(bricks(9), 0.92), 0, 1.6, -3.05, 7.2, 3.2, 0.1, false);
  box(g, texMat(concrete('#5d6064', 23, 2), 0.85), 3.35, 1.6, 0.6, 0.1, 3.2, 7.6, false);
  box(g, std('#3a3c40', 0.9), 0, 3.22, 0.6, 7.2, 0.06, 7.6, false);
  // mur arrière : verrière d'atelier (cadre acier, petits carreaux)
  box(g, std('#3b3d41', 0.9), -3.55, 0.35, 0.6, 0.1, 0.7, 7.6, false);
  box(g, std('#3b3d41', 0.9), -3.55, 3.0, 0.6, 0.1, 0.4, 7.6, false);
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), new THREE.MeshBasicMaterial({ map: outdoorView(false), toneMapped: false }));
  outside.position.set(-4.8, 1.6, 0.6);
  outside.rotation.y = Math.PI / 2;
  g.add(outside);
  const steel = std('#1d1f22', 0.45, 0.7);
  for (let k = 0; k <= 10; k++) box(g, steel, -3.5, 1.75, -3.0 + k * 0.74, 0.06, 2.1, 0.04, false);
  for (let k = 0; k <= 5; k++) box(g, steel, -3.5, 0.7 + k * 0.42, 0.6, 0.06, 0.035, 7.4, false);
  aoEdge(g, V(-3.5, 0, -3), V(3.3, 0, -3), V(0, 0, 1));
  aoEdge(g, V(3.3, 0, -3), V(3.3, 0, 4.4), V(-1, 0, 0));

  // ----- Poutres métalliques (IPN) au plafond
  for (const x of [-1.6, 1.0]) {
    box(g, steel, x, 3.05, 0.6, 0.12, 0.02, 7.6, false);
    box(g, steel, x, 2.88, 0.6, 0.12, 0.02, 7.6, false);
    box(g, steel, x, 2.965, 0.6, 0.02, 0.17, 7.6, false);
  }

  // ----- Enseigne néon sur les briques
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({
    // éteinte : le tube reste visible, gris et sans éclat
    map: neonSign('MyHomeRide', neon.on ? neon.color : '#6b6b6b'), transparent: true, toneMapped: false,
    color: neon.on ? new THREE.Color(1.5, 1.5, 1.5) : new THREE.Color(0.35, 0.35, 0.35),
  }));
  sign.position.set(0.6, 2.3, -2.98);
  g.add(sign);
  if (neon.on) areaStrip(g, neon.color, 7, V(0.6, 2.3, -2.9), 2.4, 0.5, V(0.6, 1.2, 1));

  // ----- Étagère industrielle (acier + bois), fauteuil en cuir
  const wood = std('#8a5a33', 0.6);
  for (const x of [-2.9, -1.6]) for (const z of [-2.95, -2.6]) box(g, steel, x, 1.0, z, 0.03, 2.0, 0.03);
  for (let k = 0; k < 4; k++) shelfWithItems(g, -2.25, 0.25 + k * 0.55, -2.78, 1.3, wood, 20 + k);
  const leather = std('#6b3a22', 0.55);
  box(g, leather, -2.85, 0.25, 2.2, 0.8, 0.4, 0.8);
  box(g, leather, -3.15, 0.65, 2.2, 0.2, 0.6, 0.8);
  for (const z of [1.85, 2.55]) box(g, leather, -2.85, 0.45, z, 0.8, 0.3, 0.12);
  plant(g, 1.6, -2.55, 1.2, '#2f3134', 11);
  plant(g, -3.0, 0.9, 0.9, '#2f3134', 14);

  // ----- TV sur console en acier et bois
  box(g, wood, 3.05, 0.55, 0, 0.45, 0.05, 2.0);
  box(g, wood, 3.05, 0.2, 0, 0.45, 0.04, 2.0);
  for (const z of [-0.98, 0.98]) for (const x of [2.85, 3.25]) box(g, steel, x, 0.28, z, 0.03, 0.56, 0.03);
  tvBezel(g, tv);

  // ----- Ampoules à filament suspendues
  const filament = glow('#ffb45c', 7);
  for (const [x, z, drop] of [[-0.6, -1.2, 0.9], [0.4, -1.6, 1.15], [1.4, -1.1, 0.8]] as const) {
    cyl(g, std('#111', 0.5), x, 3.2 - drop / 2, z, 0.004, 0.004, drop, 6);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), std('#fff3dc', 0.05, 0, { transparent: true, opacity: 0.35 }));
    b.position.set(x, 3.15 - drop, z);
    g.add(b);
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 6), filament);
    f.position.set(x, 3.15 - drop, z);
    g.add(f);
    const l = new THREE.PointLight('#ffb45c', 3.2, 6, 1.7);
    l.position.set(x, 3.1 - drop, z);
    g.add(l);
  }

  // ----- Tapis et ventilateur
  box(g, std('#2b2724', 0.95), 0.55, 0.006, 0, 2.6, 0.012, 1.4, false);
  const fanAnim = fan(g, 1.6, -1.6, -2.1);

  // ----- Lumières : jour froid par la verrière (ombres), ambiance sombre
  g.add(new THREE.HemisphereLight('#c9d6e3', '#3b3530', 0.55));
  const day = new THREE.DirectionalLight('#dde8f5', 1.7);
  day.position.set(-6, 4.5, 1.8);
  day.target.position.set(0.5, 0, 0);
  day.castShadow = true;
  day.shadow.mapSize.set(2048, 2048);
  const sc = day.shadow.camera;
  sc.left = -4; sc.right = 4; sc.top = 4; sc.bottom = -4; sc.near = 1; sc.far = 16;
  day.shadow.bias = -0.0005;
  day.shadow.normalBias = 0.02;
  day.shadow.radius = 3;
  g.add(day, day.target);
  areaStrip(g, '#d8e6f5', 3, V(-3.4, 1.7, 0.6), 7.0, 2.0, V(1, 1.2, 0.6));

  return {
    group: g, tv, background: '#151515', exposure: 1.0,
    bloom: { strength: 0.9, radius: 0.6, threshold: 1.5 },
    update: (t) => fanAnim(t),
  };
}
