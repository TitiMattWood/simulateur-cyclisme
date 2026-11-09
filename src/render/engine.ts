/**
 * Moteur de rendu : un seul WebGLRenderer partagé entre l'écran d'accueil et la sortie.
 * Matériaux physiques (PBR), tone mapping « cinéma » ACES, reflets d'environnement,
 * ombres douces et post-traitement (halo) selon la qualité choisie.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { QualityPreset } from '../config';
import { PostFX, type BloomStyle, type PostLevel } from './post';

export interface View {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(dt: number): void;
  /** appelé quand la taille de l'affichage change (en pixels CSS) */
  resize?(w: number, h: number): void;
  /** réglage du halo lumineux pour cette scène */
  bloom?: BloomStyle;
  /** exposition du tone mapping pour cette scène (1 par défaut) */
  exposure?: number;
}

const DEFAULT_BLOOM: BloomStyle = { strength: 0.35, radius: 0.5, threshold: 0.9 };

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  private view: View | null = null;
  private last = performance.now();
  private running = false;
  private post: PostFX | null = null;
  private envMap: THREE.Texture | null = null;
  private boundBloom: BloomStyle | undefined;
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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    // Ombres portées : seules les lumières qui le demandent en calculent (décor d'accueil).
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.setQuality(quality);
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q: QualityPreset): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.shadowMap.type = q.post >= 2 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (!this.post || this.post.level !== q.post) {
      this.post?.dispose();
      this.post = q.post > 0 ? new PostFX(this.renderer, q.post as PostLevel) : null;
    }
    this.resize();
    this.bindPost();
  }

  setView(v: View): void {
    this.view = v;
    this.resize();
    this.bindPost();
  }

  /**
   * Carte d'environnement neutre (un studio éclairé) : elle donne des reflets crédibles
   * aux matériaux brillants (cadre verni, casque, jantes) sans aucun fichier à télécharger.
   */
  environment(): THREE.Texture {
    if (!this.envMap) {
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.envMap = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    return this.envMap;
  }

  private bindPost(): void {
    if (this.post && this.view) this.post.setView(this.view.scene, this.view.camera, this.view.bloom ?? DEFAULT_BLOOM);
    this.boundBloom = this.view?.bloom;
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w, h);
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
        // le décor peut changer en cours de route (choix de la pièce au profil)
        if (this.view.bloom !== this.boundBloom) this.bindPost();
        this.renderer.toneMappingExposure = this.view.exposure ?? 1;
        if (this.post) this.post.render(dt);
        else this.renderer.render(this.view.scene, this.view.camera);
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
