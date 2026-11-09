/**
 * « Pain cave » néon : pièce sombre, bardage bois, rubans LED rose et violet,
 * fresque de montagnes, bureau en bois avec grand écran face au vélo.
 */
import * as THREE from 'three';
import {
  type RoomSetup, std, texMat, woodFloor, mountainMural, aoEdge, box, cyl, plant, fan,
  tvBezel, shelfWithItems, areaStrip, rng,
} from './common';

export function neonCave(): RoomSetup {
  const g = new THREE.Group();
  const tv = { x: 3.12, y: 1.32, w: 1.5, h: 0.85 };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // ----- Structure
  const wall = std('#2a2b31', 0.92);
  box(g, texMat(woodFloor(['#4a4038', '#544840', '#3f362f', '#5a4d43'], 72, 8), 0.55), 0, -0.05, 0.6, 7.2, 0.1, 7.6, false);
  box(g, wall, 0, 1.5, -3.05, 7.2, 3, 0.1, false); // mur du fond
  box(g, wall, 3.35, 1.5, 0.6, 0.1, 3, 7.6, false); // mur de l'écran
  box(g, wall, -3.55, 1.5, 0.6, 0.1, 3, 7.6, false); // mur arrière
  box(g, std('#1e1f24', 0.9), 0, 3.02, 0.6, 7.2, 0.06, 7.6, false); // plafond
  aoEdge(g, V(-3.5, 0, -3), V(3.3, 0, -3), V(0, 0, 1));
  aoEdge(g, V(3.3, 0, -3), V(3.3, 0, 4.4), V(-1, 0, 0));
  aoEdge(g, V(-3.5, 0, -3), V(-3.5, 0, 4.4), V(1, 0, 0));

  // ----- Fresque de montagnes (partie gauche du mur du fond), encadrée
  const mural = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.5),
    new THREE.MeshStandardMaterial({ map: mountainMural(['#3a1f4f', '#c4557a'], ['#5b2c6f', '#3e1f52', '#26143a']), roughness: 0.9 }));
  mural.position.set(-1.7, 1.65, -2.99);
  g.add(mural);
  const frame = std('#141418', 0.5);
  for (const [x, y, w, h] of [[-1.7, 2.42, 3.08, 0.04], [-1.7, 0.88, 3.08, 0.04], [-3.22, 1.65, 0.04, 1.58], [-0.18, 1.65, 0.04, 1.58]] as const) {
    box(g, frame, x, y, -2.985, w, h, 0.03, false);
  }

  // ----- Bardage bois vertical (partie droite du mur du fond)
  const slat = std('#b5763e', 0.6);
  const slatGeo = new THREE.BoxGeometry(0.045, 2.75, 0.05);
  const slats = new THREE.InstancedMesh(slatGeo, slat, 46);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 46; i++) {
    m.makeTranslation(0.25 + i * 0.066, 1.375, -2.975);
    slats.setMatrixAt(i, m);
  }
  slats.receiveShadow = true;
  g.add(slats);
  box(g, std('#3a2a1e', 0.8), 1.77, 1.375, -2.995, 3.1, 2.75, 0.01, false); // fond sombre entre les lames
  const shelfWood = std('#d9a066', 0.55);
  shelfWithItems(g, 1.65, 1.95, -2.82, 2.2, shelfWood, 4);
  shelfWithItems(g, 1.85, 1.45, -2.82, 1.6, shelfWood, 7);

  // ----- Casques accrochés sous la fresque
  const r = rng(12);
  for (let k = 0; k < 3; k++) {
    const x = -2.7 + k * 0.42;
    cyl(g, std('#888', 0.3, 0.8), x, 0.72, -2.97, 0.01, 0.01, 0.08, 6).rotation.x = Math.PI / 2;
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      std(['#f2f2f2', '#d62839', '#1d3557'][k], 0.35, 0.05));
    h.scale.set(1.2, 0.8, 1);
    h.position.set(x, 0.6 + r() * 0.02, -2.88);
    h.castShadow = true;
    g.add(h);
  }

  // ----- Bureau en bois le long du mur de l'écran, avec écran
  const desk = std('#c48a52', 0.5);
  box(g, desk, 2.95, 0.74, 0.1, 0.75, 0.05, 3.6); // plateau
  box(g, std('#222327', 0.5, 0.4), 2.95, 0.37, -1.6, 0.7, 0.72, 0.05);
  box(g, std('#222327', 0.5, 0.4), 2.95, 0.37, 1.8, 0.7, 0.72, 0.05);
  box(g, std('#2b2c31', 0.7), 2.95, 0.45, 1.25, 0.65, 0.55, 0.9); // caisson
  tvBezel(g, tv, 0.765);
  // petits objets sur le bureau
  box(g, std('#1b1c20', 0.4), 2.7, 0.785, -0.95, 0.18, 0.03, 0.42); // clavier
  cyl(g, std('#efefef', 0.5), 2.8, 0.83, 1.2, 0.04, 0.035, 0.12, 14); // bidon
  plant(g, 3.0, -1.35, 0.55, '#2a2a2e', 5);

  // ----- Tapis et ventilateur
  box(g, std('#1c1d22', 0.95), 0.55, 0.006, 0, 2.6, 0.012, 1.4, false);
  box(g, std('#d63c86', 0.6), 0.55, 0.007, 0, 2.62, 0.01, 1.42, false).scale.set(1, 1, 1);
  box(g, std('#1c1d22', 0.95), 0.55, 0.013, 0, 2.5, 0.006, 1.3, false);
  const fanAnim = fan(g, 1.6, -1.6, -2.1);

  // ----- Lumières : peu d'ambiance, rubans LED colorés, un projecteur sur le vélo
  g.add(new THREE.HemisphereLight('#8c7cbf', '#1a1418', 0.35));
  const key = new THREE.SpotLight('#ffe9d6', 8, 12, 0.6, 0.55, 1.6);
  key.position.set(1.2, 2.9, 2.2);
  key.target.position.set(0.4, 0.6, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0006;
  key.shadow.radius = 4;
  g.add(key, key.target);
  // ruban rose en haut du mur du fond, violet en haut du mur de l'écran, rose sous le bureau
  areaStrip(g, '#ff3d9a', 14, V(0, 2.92, -2.85), 6.8, 0.1, V(0, 1.2, 0), { size: [6.8, 0.03, 0.03], at: V(0, 2.95, -2.97) });
  areaStrip(g, '#8f5cff', 14, V(3.2, 2.92, 0.6), 7.2, 0.1, V(0, 1.2, 0.6), { size: [0.03, 0.03, 7.2], at: V(3.27, 2.95, 0.6) });
  areaStrip(g, '#ff3d9a', 6, V(2.95, 0.7, 0.1), 3.4, 0.08, V(1.5, 0, 0.1), { size: [0.02, 0.02, 3.4], at: V(2.6, 0.71, 0.1) });
  // lueur derrière l'écran
  areaStrip(g, '#6a5cff', 5, V(3.3, tv.y, 0), tv.w + 0.3, tv.h + 0.3, V(2.5, tv.y, 0));
  // lueur des étagères
  areaStrip(g, '#ffb36b', 3, V(1.65, 1.93, -2.8), 2.2, 0.06, V(1.65, 0, -2.6));

  return {
    group: g, tv, background: '#121318', exposure: 1.0,
    bloom: { strength: 0.9, radius: 0.55, threshold: 1.5 },
    update: (t) => fanAnim(t),
  };
}
