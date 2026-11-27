/**
 * Outil de développement : un coureur de chaque équipe sur son vélo, vus de 3/4 avant,
 * pour contrôler maillots et couleurs de vélo. http://localhost:5173/dev/teams.html
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RiderModel } from '../src/render/riderModel';
import { aiLook } from '../src/ride/ai/looks';
import { TEAMS } from '../src/data/teams';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9aa0a6');
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight('#ffffff', '#776f66', 1.0));
const sun = new THREE.DirectionalLight('#fff3e0', 2.0);
sun.position.set(3, 5, 4);
scene.add(sun);
const cols = 6;
TEAMS.forEach((tm, i) => {
  const { look } = aiLook(i * 17 + 3, 'smooth', tm);
  look.helmetType = 'road';
  const m = new RiderModel(look);
  m.crankAngle = 1.2;
  m.update(0.0001, 0);
  m.root.position.set((i % cols) * 2.1, -Math.floor(i / cols) * 2.2, 0);
  m.root.rotation.y = -0.55;
  scene.add(m.root);
});
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
cam.position.set(5.2, 2.2, 12);
cam.lookAt(5.2, -1.4, 0);
const fit = () => {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  const half = 3.9;
  cam.top = half; cam.bottom = -half; cam.left = -half * (w / h); cam.right = half * (w / h);
  cam.updateProjectionMatrix();
  renderer.render(scene, cam);
};
addEventListener('resize', fit);
setInterval(fit, 500);
