/**
 * Outil de développement : affiche les vélos de profil sur fond clair, pour les comparer
 * aux photos de référence (image/velos/). Ouvrir http://localhost:5173/dev/bikes.html
 * Paramètres : ?frames=climb,aero&wheels=c40,mono60&cols=2
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RiderModel } from '../src/render/riderModel';
import { defaultAppearance, DEFAULT_PAINTS, type RiderLook } from '../src/render/look';
import type { FrameId, WheelId } from '../src/physics/equipment';

const q = new URLSearchParams(location.search);
const frames = (q.get('frames') ?? 'climb,aero,gravel,tt').split(',') as FrameId[];
const wheels = (q.get('wheels') ?? 'pro55,mono60,g30,tt80d').split(',') as WheelId[];
const cols = Number(q.get('cols') ?? 2);
/** ?finish=gloss pour voir la peinture dessinée (version en ligne) au lieu de la photo */
const finish = q.get('finish');

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(q.get('bg') ?? '#8a8f96');
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight('#ffffff', '#c8c4bc', 1.2));
const sun = new THREE.DirectionalLight('#ffffff', 1.6);
sun.position.set(2, 5, 6);
scene.add(sun);

const W = 2.0, H = 1.25;
const rows = Math.ceil(frames.length / cols);
frames.forEach((f, i) => {
  const paint = DEFAULT_PAINTS[f];
  const look: RiderLook = {
    ...defaultAppearance(f), ...paint, ...(finish ? { finish: finish as RiderLook['finish'] } : {}),
    heightCm: 178, weightKg: 70, frame: f, wheels: wheels[i] ?? 'c40',
    jerseyColor: '#ffffff', jerseyColor2: '#000000', helmetColor: '#ffffff', overshoes: false,
  };
  const m = new RiderModel(look, { bikeOnly: true });
  m.root.position.set((i % cols) * W - ((cols - 1) * W) / 2 - 0.5, -Math.floor(i / cols) * H + ((rows - 1) * H) / 2 - 0.4, 0);
  scene.add(m.root);
});
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
cam.position.set(0, 0, 10);
const fit = () => {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  const halfH = Math.max((rows * H) / 2 + 0.1, ((cols * W) / 2 + 0.1) * (h / w));
  cam.top = halfH; cam.bottom = -halfH; cam.left = -halfH * (w / h); cam.right = halfH * (w / h);
  cam.updateProjectionMatrix();
  renderer.render(scene, cam);
};
addEventListener('resize', fit);
fit();
// les photos de profil arrivent après coup : on redessine régulièrement
setInterval(() => renderer.render(scene, cam), 500);
(window as unknown as { ready: boolean }).ready = true;
