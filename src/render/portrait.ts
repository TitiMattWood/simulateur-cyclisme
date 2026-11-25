/**
 * « Photo de profil » : un portrait (buste, trois-quarts face) rendu depuis le modèle 3D du
 * coureur, en petite image. Sert pour le joueur, le classement et les fiches d'équipe.
 *
 * Le rendu se fait hors écran, avec le moteur 3D déjà ouvert (pas de second contexte WebGL),
 * et chaque portrait est gardé en mémoire : on ne le calcule qu'une fois par apparence.
 */
import * as THREE from 'three';
import { RiderModel } from './riderModel';
import type { RiderLook } from './look';

const SIZE = 128;
const cache = new Map<string, string>();
let target: THREE.WebGLRenderTarget | null = null;

function scene(model: RiderModel): { scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
  const sc = new THREE.Scene();
  sc.background = new THREE.Color('#1b2230');
  sc.add(new THREE.HemisphereLight('#dfe9ff', '#3a3024', 1.6));
  const key = new THREE.DirectionalLight('#fff4e0', 2.6);
  key.position.set(2, 3, 2);
  sc.add(key);
  const rim = new THREE.DirectionalLight('#7fb4ff', 1.4);
  rim.position.set(-2, 1.5, -2);
  sc.add(rim);
  sc.add(model.root);
  model.update(0, 0, 0);
  model.root.updateMatrixWorld(true);
  // le modèle regarde vers +x ; on se place devant lui, légèrement de côté, à hauteur des yeux
  const eye = model.body.localToWorld(model.eye.clone());
  const cam = new THREE.PerspectiveCamera(20, 1, 0.05, 20);
  cam.position.copy(eye).add(new THREE.Vector3(0.85, 0.04, 0.5));
  cam.lookAt(eye.x - 0.04, eye.y - 0.06, eye.z);
  return { scene: sc, camera: cam };
}

/** Portrait du coureur (URL d'image PNG), calculé une seule fois par apparence. */
export function riderPortrait(renderer: THREE.WebGLRenderer, look: RiderLook): string {
  const key = JSON.stringify(look);
  const hit = cache.get(key);
  if (hit) return hit;
  target ??= new THREE.WebGLRenderTarget(SIZE, SIZE, { colorSpace: THREE.SRGBColorSpace, samples: 4 });
  const model = new RiderModel(look);
  model.setBlobShadow(true);
  const { scene: sc, camera } = scene(model);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.clear();
  renderer.render(sc, camera);
  const px = new Uint8Array(SIZE * SIZE * 4);
  renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, px);
  renderer.setRenderTarget(prev);
  model.dispose();
  // WebGL lit les lignes de bas en haut : on retourne l'image
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) img.data.set(px.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
