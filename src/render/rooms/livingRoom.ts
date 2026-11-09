/**
 * Salon lumineux : grande baie vitrée sur des collines, soleil qui entre et dessine les
 * ombres, parquet clair, canapé, plantes, meuble TV.
 */
import * as THREE from 'three';
import {
  type RoomSetup, std, texMat, woodFloor, outdoorView, aoEdge, box, cyl, plant, fan, tvBezel, shelfWithItems, areaStrip,
} from './common';

export function livingRoom(): RoomSetup {
  const g = new THREE.Group();
  const tv = { x: 3.15, y: 1.32, w: 1.65, h: 0.93 };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // ----- Structure
  box(g, texMat(woodFloor(['#a98458', '#9c784e', '#b28d61', '#94714a'], 60, 2), 0.72), 0, -0.05, 0.6, 7.2, 0.1, 7.6, false);
  const wall = std('#cfc6b8', 0.95);
  box(g, wall, 3.35, 1.5, 0.6, 0.1, 3, 7.6, false);
  box(g, wall, -3.55, 1.5, 0.6, 0.1, 3, 7.6, false);
  box(g, std('#d8d2c8', 0.95), 0, 3.02, 0.6, 7.2, 0.06, 7.6, false);
  // mur du fond percé d'une baie vitrée (de x = −3 à x = 1,4)
  box(g, wall, 2.4, 1.5, -3.05, 2.0, 3, 0.1, false);
  box(g, wall, -3.25, 1.5, -3.05, 0.5, 3, 0.1, false);
  box(g, wall, -0.8, 2.85, -3.05, 4.4, 0.3, 0.1, false);
  box(g, wall, -0.8, 0.12, -3.05, 4.4, 0.24, 0.1, false);
  const view = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 3.2), new THREE.MeshBasicMaterial({ map: outdoorView(true), color: new THREE.Color(0.78, 0.78, 0.78) }));
  view.position.set(-0.8, 1.6, -4.2);
  g.add(view);
  const frame = std('#2b2d30', 0.4, 0.5);
  for (const x of [-3.0, -1.53, -0.07, 1.4]) box(g, frame, x, 1.48, -3.0, 0.05, 2.5, 0.06, false);
  box(g, frame, -0.8, 0.24, -3.0, 4.45, 0.05, 0.06, false);
  box(g, frame, -0.8, 2.72, -3.0, 4.45, 0.05, 0.06, false);
  aoEdge(g, V(1.4, 0, -3), V(3.3, 0, -3), V(0, 0, 1));
  aoEdge(g, V(3.3, 0, -3), V(3.3, 0, 4.4), V(-1, 0, 0));
  aoEdge(g, V(-3.5, 0, -3), V(-3.5, 0, 4.4), V(1, 0, 0));
  // voilages
  for (const x of [-3.2, 1.55]) box(g, std('#e3ddd2', 0.95, 0, { transparent: true, opacity: 0.85 }), x, 1.5, -2.92, 0.35, 2.7, 0.04, false);

  // ----- Meuble TV et TV
  const oak = std('#b98d5c', 0.55);
  box(g, oak, 3.05, 0.25, 0, 0.45, 0.5, 2.2);
  box(g, std('#2f3134', 0.7), 2.82, 0.25, 0, 0.01, 0.4, 2.05);
  tvBezel(g, tv, 0.5);
  box(g, std('#1a1b1e', 0.5), 2.95, 0.55, 0, 0.12, 0.08, 0.9); // barre de son
  // bibliothèque à droite de la TV
  for (let k = 0; k < 4; k++) shelfWithItems(g, 3.18, 0.4 + k * 0.5, 1.75, 1.0, oak, 10 + k);

  // ----- Canapé contre le mur arrière, fauteuil, table basse
  const fabric = std('#7d8a96', 0.95);
  box(g, fabric, -3.05, 0.25, 1.2, 0.85, 0.42, 2.4); // assise
  box(g, fabric, -3.35, 0.65, 1.2, 0.25, 0.6, 2.4); // dossier
  for (const z of [0.05, 2.35]) box(g, fabric, -3.05, 0.4, z, 0.85, 0.5, 0.2); // accoudoirs
  for (const z of [0.6, 1.8]) box(g, std('#e3c567', 0.95), -3.2, 0.62, z, 0.15, 0.35, 0.4); // coussins
  box(g, std('#b9b0a2', 0.95), -2.2, 0.01, 1.2, 1.8, 0.02, 2.4, false); // tapis
  box(g, oak, -2.25, 0.38, 1.2, 0.6, 0.04, 1.0);
  for (const z of [0.78, 1.62]) for (const x of [-2.5, -2.0]) box(g, std('#222', 0.4, 0.5), x, 0.18, z, 0.03, 0.36, 0.03);

  // ----- Plantes près de la baie, lampadaire
  plant(g, -2.7, -2.4, 1.4, '#e8e2d8', 3);
  plant(g, 0.9, -2.5, 1.1, '#cf8c5e', 6);
  plant(g, 2.7, -2.5, 0.9, '#f2efe9', 8);
  cyl(g, std('#222', 0.4, 0.6), -3.1, 0.85, -0.6, 0.015, 0.015, 1.7, 8);
  const lampShade = cyl(g, std('#f2eadb', 0.9, 0, { emissive: '#ffdcae', emissiveIntensity: 0.6 }), -3.1, 1.78, -0.6, 0.18, 0.24, 0.3, 24);
  lampShade.castShadow = false;

  // ----- Tapis du home trainer et ventilateur
  box(g, std('#3a3d42', 0.95), 0.55, 0.006, 0, 2.5, 0.012, 1.3, false);
  const fanAnim = fan(g, 1.6, -1.6, -2.1);

  // ----- Lumières : soleil par la baie (ombres), ciel par la fenêtre, appoint doux
  g.add(new THREE.HemisphereLight('#dbeaff', '#8f7a60', 0.5));
  const sun = new THREE.DirectionalLight('#ffe9cc', 2.0);
  sun.position.set(-1.6, 4.2, -6.5);
  sun.target.position.set(0.4, 0, 0.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -4; sc.right = 4; sc.top = 4; sc.bottom = -4; sc.near = 1; sc.far = 16;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  g.add(sun, sun.target);
  areaStrip(g, '#e8f2ff', 1.6, V(-0.8, 1.5, -2.95), 4.4, 2.4, V(-0.8, 1.2, 1));

  return {
    group: g, tv, background: '#cfd8df', exposure: 0.85,
    bloom: { strength: 0.15, radius: 0.4, threshold: 2.0 },
    update: (t) => fanAnim(t),
  };
}
