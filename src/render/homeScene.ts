/**
 * Décor de l'écran d'accueil : l'avatar pédale tranquillement sur son home trainer
 * dans une pièce aménagée (fenêtre, écran, plante, tapis), caméra en lent travelling.
 */
import * as THREE from 'three';
import type { View } from './engine';
import { RiderModel, type RiderLook } from './riderModel';

export class HomeScene implements View {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
  private rider: RiderModel;
  private t = 0;

  constructor(look: RiderLook) {
    const s = this.scene;
    s.background = new THREE.Color('#20252c');
    s.add(new THREE.HemisphereLight('#fff4e6', '#3a3f47', 1.1));
    const sun = new THREE.DirectionalLight('#ffe2b8', 1.6);
    sun.position.set(-3, 5, 2);
    s.add(sun);
    const fill = new THREE.PointLight('#6fb1ff', 6, 8);
    fill.position.set(2.5, 1.6, -1.8);
    s.add(fill);

    const m = (c: string) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.1, 7), m('#8a6f55'));
    floor.position.y = -0.05;
    s.add(floor);
    const mat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 1.1), m('#2f3338'));
    mat.position.set(0.5, 0.01, 0);
    s.add(mat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 0.1), m('#d9d2c5'));
    back.position.set(0, 2, -2.6);
    s.add(back);
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4, 7), m('#cfc6b6'));
    side.position.set(-3.2, 2, 0);
    s.add(side);
    // fenêtre avec vue dégagée
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.3), new THREE.MeshBasicMaterial({ color: '#9cc9f0' }));
    win.position.set(-3.14, 1.9, -0.4);
    win.rotation.y = Math.PI / 2;
    s.add(win);
    for (const [w, h, x, y] of [[1.9, 0.08, 0, 0.65], [1.9, 0.08, 0, -0.65], [0.08, 1.4, 0.9, 0], [0.08, 1.4, -0.9, 0], [0.05, 1.3, 0, 0]] as const) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, w), m('#f4f1ea'));
      bar.position.set(-3.12, 1.9 + y, -0.4 + x);
      s.add(bar);
    }
    // collines vues par la fenêtre (deux plans de triangles)
    for (const [color, h, x0, dy] of [['#7fae5a', 0.5, -1.2, 0], ['#5f8f3e', 0.32, -0.9, -0.12]] as const) {
      const g = new THREE.BufferGeometry();
      const pts: number[] = [];
      for (let k = 0; k < 6; k++) {
        const za = x0 + k * 0.5, zb = za + 0.5;
        pts.push(0, -0.65, za, 0, -0.65 + h * (0.5 + 0.5 * Math.sin(k * 1.9)), (za + zb) / 2, 0, -0.65, zb);
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const hills = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
      hills.position.set(-3.13 + dy * 0.01, 1.9 + dy, -0.4);
      s.add(hills);
    }
    // écran mural
    const tv = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.1, 0.06), m('#111317'));
    tv.position.set(1.4, 1.75, -2.52);
    s.add(tv);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.0), new THREE.MeshBasicMaterial({ color: '#2d6a4f' }));
    screen.position.set(1.4, 1.75, -2.48);
    s.add(screen);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.0), new THREE.MeshBasicMaterial({ color: '#4f5257' }));
    road.position.set(1.4, 1.65, -2.47);
    road.scale.set(1, 0.8, 1);
    s.add(road);
    // plante et ventilateur
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.35, 7), m('#b5654a'));
    pot.position.set(-2.5, 0.18, -2);
    s.add(pot);
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), m('#4f8a3c'));
    leaves.position.set(-2.5, 0.7, -2);
    s.add(leaves);
    const fanBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.25, 1.0, 6), m('#3b4048'));
    fanBase.position.set(2.4, 0.5, 0.6);
    s.add(fanBase);
    const fanHead = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 12), m('#e5e7eb'));
    fanHead.rotation.z = Math.PI / 2;
    fanHead.rotation.y = 0.5;
    fanHead.position.set(2.35, 1.05, 0.55);
    s.add(fanHead);

    this.rider = new RiderModel(look, { trainer: true });
    this.rider.root.position.set(0, 0, 0);
    s.add(this.rider.root);
  }

  /** Change l'apparence de l'avatar (couleurs, matériel). */
  setLook(look: RiderLook): void {
    this.scene.remove(this.rider.root);
    this.rider.dispose();
    this.rider = new RiderModel(look, { trainer: true });
    this.scene.add(this.rider.root);
  }

  update(dt: number): void {
    this.t += dt;
    this.rider.update(dt, 78);
    const a = 0.9 + Math.sin(this.t * 0.12) * 0.55;
    this.camera.position.set(0.5 + Math.cos(a) * 3.6, 1.5 + Math.sin(this.t * 0.2) * 0.1, Math.sin(a) * 3.6);
    this.camera.lookAt(0.45, 0.85, 0);
  }
}
