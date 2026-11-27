/**
 * Outil de développement : le cycliste sur son vélo, vu sous plusieurs angles, pour juger
 * le rendu du corps (articulations, raccords). http://localhost:5173/dev/rider.html
 * Paramètres : ?style=smooth|facet&crank=1.2 (angle du pédalier en radians)&standing=1
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RiderModel } from '../src/render/riderModel';
import { defaultAppearance, DEFAULT_PAINTS, type RiderLook } from '../src/render/look';

const q = new URLSearchParams(location.search);
const style = (q.get('style') ?? 'facet') as RiderLook['style'];
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setScissorTest(true);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#8a8f96');
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight('#ffffff', '#776f66', 1.0));
const sun = new THREE.DirectionalLight('#fff3e0', 2.2);
sun.position.set(3, 5, 4);
scene.add(sun);
const look: RiderLook = {
  ...defaultAppearance('climb'), ...DEFAULT_PAINTS.climb, style, sleeves: 'short', gloves: 'mitts',
  heightCm: 178, weightKg: 72, frame: 'climb', wheels: 'pro55',
  jerseyColor: '#e4572e', jerseyColor2: '#1d3557', helmetColor: '#ffffff', overshoes: false,
};
const m = new RiderModel(look, q.get('standing') ? { standing: { holdZ: 0.42 } } : {});
m.update(0, 0);
m.crankAngle = Number(q.get('crank') ?? 1.2);
m.update(0.0001, 0);
scene.add(m.root);
// quatre vues : profil côté transmission, 3/4 avant, 3/4 arrière, gros plan genou/coude
const views: Array<[THREE.Vector3, THREE.Vector3, number]> = [
  [new THREE.Vector3(0.55, 0.95, 2.4), new THREE.Vector3(0.55, 0.9, 0), 38],
  [new THREE.Vector3(2.0, 1.3, 1.5), new THREE.Vector3(0.6, 1.0, 0), 34],
  [new THREE.Vector3(-1.2, 1.4, 1.6), new THREE.Vector3(0.4, 0.95, 0), 34],
  [new THREE.Vector3(0.75, 0.95, 1.0), new THREE.Vector3(0.6, 0.85, 0), 32],
];
const draw = () => {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  views.forEach(([pos, tgt, fov], i) => {
    const x = (i % 2) * (w / 2), y = (i < 2 ? h / 2 : 0);
    const cam = new THREE.PerspectiveCamera(fov, w / h, 0.05, 50);
    cam.position.copy(pos);
    cam.lookAt(tgt);
    renderer.setViewport(x, y, w / 2, h / 2);
    renderer.setScissor(x, y, w / 2, h / 2);
    renderer.render(scene, cam);
  });
};
addEventListener('resize', draw);
setInterval(draw, 500);
draw();
