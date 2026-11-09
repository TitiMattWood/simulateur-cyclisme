/**
 * Garage atelier : sol en béton, murs en parpaings peints, panneau à outils au-dessus de
 * l'établi, vélos accrochés au mur, suspensions à lumière chaude, porte de garage.
 */
import * as THREE from 'three';
import { RiderModel } from '../riderModel';
import { defaultAppearance, type RiderLook } from '../look';
import {
  type RoomSetup, std, glow, texMat, concrete, blocks, pegboard, aoEdge, box, cyl, plant, fan, tvBezel, areaStrip, rng,
} from './common';

function hangingBike(g: THREE.Group, x: number, z: number, look: Partial<RiderLook>, style: RiderLook['style']): void {
  const full: RiderLook = {
    ...defaultAppearance('climb'), style, heightCm: 178, weightKg: 72, frame: 'climb', wheels: 'c40',
    jerseyColor: '#000', jerseyColor2: '#000', helmetColor: '#000', overshoes: false, bottles: 0, computer: false, ...look,
  };
  const bike = new RiderModel(full, { bikeOnly: true });
  // accroché par la roue avant : vélo vertical contre le mur
  bike.root.rotation.z = Math.PI / 2;
  bike.root.rotation.y = 0;
  bike.root.position.set(x + 0.335, 0.42, z);
  g.add(bike.root);
}

export function workshop(style: RiderLook['style'] = 'smooth'): RoomSetup {
  const g = new THREE.Group();
  const tv = { x: 3.15, y: 1.5, w: 1.55, h: 0.87 };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // ----- Structure
  box(g, texMat(concrete('#8a8d90', 5, 3), 0.42), 0, -0.05, 0.6, 7.2, 0.1, 7.6, false);
  const wallTex = blocks('#d2d4cf', 13);
  box(g, texMat(wallTex, 0.9), 0, 1.5, -3.05, 7.2, 3, 0.1, false);
  box(g, texMat(blocks('#d2d4cf', 17), 0.9), 3.35, 1.5, 0.6, 0.1, 3, 7.6, false);
  box(g, texMat(blocks('#d2d4cf', 19), 0.9), -3.55, 1.5, 0.6, 0.1, 3, 7.6, false);
  box(g, std('#3b3e42', 0.9), 0, 3.02, 0.6, 7.2, 0.06, 7.6, false);
  // bande de peinture jaune de sécurité au pied des murs
  box(g, std('#e3b21b', 0.6), 0, 0.06, -2.99, 7.0, 0.12, 0.02, false);
  aoEdge(g, V(-3.5, 0, -3), V(3.3, 0, -3), V(0, 0, 1));
  aoEdge(g, V(3.3, 0, -3), V(3.3, 0, 4.4), V(-1, 0, 0));
  aoEdge(g, V(-3.5, 0, -3), V(-3.5, 0, 4.4), V(1, 0, 0));

  // ----- Porte de garage sectionnelle (mur arrière)
  const door = std('#e9eaec', 0.45, 0.3);
  for (let k = 0; k < 6; k++) box(g, door, -3.49, 0.25 + k * 0.42, 0.9, 0.04, 0.4, 2.8, false);
  box(g, std('#9aa0a6', 0.4, 0.6), -3.47, 1.4, 0.9, 0.06, 2.6, 0.06, false);

  // ----- Établi, panneau à outils et servante
  const wood = std('#b88a5a', 0.6);
  const steel = std('#3c4045', 0.45, 0.6);
  box(g, wood, -1.7, 0.9, -2.68, 2.4, 0.06, 0.62);
  for (const x of [-2.82, -0.58]) box(g, steel, x, 0.45, -2.68, 0.05, 0.88, 0.58);
  box(g, steel, -1.7, 0.25, -2.68, 2.3, 0.03, 0.55);
  box(g, texMat(pegboard(), 0.85), -1.7, 1.75, -2.98, 2.4, 1.1, 0.02, false);
  const r = rng(31);
  const toolMat = [std('#c0392b', 0.5, 0.2), std('#2c3e50', 0.5, 0.3), std('#aab2bd', 0.3, 0.9), std('#f39c12', 0.5, 0.2)];
  for (let k = 0; k < 14; k++) {
    const x = -2.75 + (k % 7) * 0.32, y = 2.05 - Math.floor(k / 7) * 0.48;
    const h = 0.16 + r() * 0.2;
    box(g, toolMat[k % toolMat.length], x, y - h / 2, -2.95, 0.03 + r() * 0.03, h, 0.02);
    box(g, toolMat[2], x, y - h, -2.95, 0.07, 0.025, 0.02); // tête d'outil
  }
  // servante rouge
  const red = std('#c0392b', 0.35, 0.3);
  box(g, red, 0.45, 0.5, -2.72, 0.7, 1.0, 0.5);
  for (let k = 0; k < 5; k++) box(g, std('#d9dde1', 0.3, 0.9), 0.45, 0.2 + k * 0.17, -2.465, 0.5, 0.02, 0.01);
  // roues de rechange posées contre le mur
  for (const [x, c] of [[1.25, '#1d1e20'], [1.45, '#2a2b2e']] as const) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.016, 8, 40), std(c, 0.8));
    w.position.set(x, 0.34, -2.9);
    w.rotation.y = 0.1;
    w.castShadow = true;
    g.add(w);
  }

  // ----- Vélos accrochés au mur du fond (partie droite)
  hangingBike(g, 2.35, -2.75, { frameColor: '#1f6f4a', frameColor2: '#f4d35e', tireWall: 'tan', frame: 'gravel' }, style);
  hangingBike(g, 2.95, -2.5, { frameColor: '#e8e8e8', frameColor2: '#d62839', wheels: 'c55', frame: 'aero' }, style);
  for (const x of [2.35, 2.9]) box(g, std('#8b949c', 0.3, 0.9), x, 1.8, -2.88, 0.03, 0.03, 0.2); // crochets

  // ----- TV murale et desserte
  tvBezel(g, tv);
  box(g, steel, 3.0, 0.5, 0, 0.5, 0.04, 1.4);
  box(g, steel, 3.0, 0.15, 0, 0.5, 0.04, 1.4);
  for (const z of [-0.68, 0.68]) for (const x of [2.77, 3.23]) box(g, steel, x, 0.33, z, 0.03, 0.66, 0.03);
  plant(g, 2.9, -1.5, 0.8, '#5c6066', 9);

  // ----- Tapis et ventilateur
  box(g, std('#26282b', 0.95), 0.55, 0.006, 0, 2.5, 0.012, 1.3, false);
  const fanAnim = fan(g, 1.6, -1.55, -2.1);

  // ----- Lumières : deux suspensions chaudes, un néon d'atelier au-dessus de l'établi
  g.add(new THREE.HemisphereLight('#f3ead9', '#4a4741', 0.4));
  for (const [x, z, cast] of [[1.4, 1.2, true], [-1.7, -2.2, false]] as const) {
    cyl(g, std('#222', 0.5, 0.5), x, 2.65, z, 0.005, 0.005, 0.7, 6); // câble
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.2, 24, 1, true), std('#1f2a24', 0.5, 0.4, { side: THREE.DoubleSide }));
    shade.position.set(x, 2.22, z);
    g.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), glow('#ffcf8a', 6));
    bulb.position.set(x, 2.12, z);
    g.add(bulb);
    const l = new THREE.SpotLight('#ffcf8a', cast ? 6 : 5, 9, 1.0, 0.6, 1.5);
    l.position.set(x, 2.1, z);
    l.target.position.set(x, 0, z);
    if (cast) {
      l.castShadow = true;
      l.shadow.mapSize.set(1024, 1024);
      l.shadow.bias = -0.0006;
      l.shadow.radius = 4;
    }
    g.add(l, l.target);
  }
  areaStrip(g, '#eaf2ff', 6, V(-1.7, 2.5, -2.6), 1.6, 0.08, V(-1.7, 0, -2.4), { size: [1.6, 0.04, 0.08], at: V(-1.7, 2.52, -2.6) });
  // lumière du jour qui passe sous la porte de garage
  areaStrip(g, '#cfe2ff', 3, V(-3.4, 0.1, 0.9), 2.6, 0.12, V(0, 0, 0.9));

  return {
    group: g, tv, background: '#1d1e20', exposure: 0.9,
    bloom: { strength: 0.6, radius: 0.5, threshold: 1.5 },
    update: (t) => fanAnim(t),
  };
}
