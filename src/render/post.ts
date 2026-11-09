/**
 * Post-traitement : ce qui donne le rendu « premium » au-delà des modèles 3D.
 *  - rendu dans une image intermédiaire anticrénelée (MSAA) ;
 *  - halo lumineux (bloom) autour des sources vives : néons, écran de TV, ampoules ;
 *  - conversion finale (tone mapping ACES + espace de couleur sRGB).
 *
 * Niveau 0 : rien (rendu direct, le plus léger) ; 1 : halo léger ; 2 : halo plus riche.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export type PostLevel = 0 | 1 | 2;

/** Réglages du halo selon la scène : les pièces d'intérieur en veulent plus que l'extérieur. */
export interface BloomStyle {
  strength: number;
  radius: number;
  threshold: number;
}

export class PostFX {
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloom: UnrealBloomPass;

  constructor(private renderer: THREE.WebGLRenderer, readonly level: PostLevel) {
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
      type: THREE.HalfFloatType,
      samples: level >= 2 ? 4 : 2,
    });
    this.composer = new EffectComposer(renderer, target);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.4, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setView(scene: THREE.Scene, camera: THREE.Camera, style: BloomStyle): void {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    const k = this.level >= 2 ? 1 : 0.75;
    this.bloom.strength = style.strength * k;
    this.bloom.radius = style.radius;
    this.bloom.threshold = style.threshold;
  }

  setSize(w: number, h: number): void {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
  }
}
