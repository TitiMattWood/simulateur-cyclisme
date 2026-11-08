/**
 * Moteur de rendu : un seul WebGLRenderer partagé entre l'écran d'accueil et la sortie.
 * Style « low-poly » : faces planes, éclairage simple, brume atmosphérique.
 */
import * as THREE from 'three';
import type { QualityPreset } from '../config';

export interface View {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(dt: number): void;
  /** appelé quand la taille de l'affichage change (en pixels CSS) */
  resize?(w: number, h: number): void;
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  private view: View | null = null;
  private last = performance.now();
  private running = false;
  /** images par seconde (moyenne lissée) */
  fps = 60;

  constructor(readonly canvas: HTMLCanvasElement, quality: QualityPreset) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality.antialias,
      // Tampon de profondeur logarithmique : indispensable pour voir à 25 km
      // tout en affichant le guidon à 50 cm sans scintillement.
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Ombres portées : seules les lumières qui le demandent en calculent (décor d'accueil).
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.setQuality(quality);
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q: QualityPreset): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.resize();
  }

  setView(v: View): void {
    this.view = v;
    this.resize();
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.view) {
      this.view.camera.aspect = w / h;
      this.view.camera.updateProjectionMatrix();
      this.view.resize?.(w, h);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
      if (this.view) {
        this.view.update(dt);
        this.renderer.render(this.view.scene, this.view.camera);
      }
    };
    requestAnimationFrame(loop);
  }
}

/** Dôme de ciel en dégradé, qui suit la caméra. */
export function createSky(top: THREE.ColorRepresentation, horizon: THREE.ColorRepresentation): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1, 24, 12);
  const mat = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vDir;
      void main(){ float t = clamp(vDir.y * 1.6, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(t, 0.7)), 1.0);
      #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  sky.scale.setScalar(1000);
  return sky;
}

/** Conversion d'une couleur sRGB (0–1) vers l'espace linéaire attendu par Three.js. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Couleur hexadécimale → composantes linéaires [r, g, b]. */
export function hexLinear(hex: string | number): [number, number, number] {
  const c = new THREE.Color(hex); // Three.js convertit déjà en linéaire
  return [c.r, c.g, c.b];
}
