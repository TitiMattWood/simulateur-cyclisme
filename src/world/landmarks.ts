/**
 * Monuments modélisés à la main et vue lointaine.
 *
 *  - Tour Eiffel et gratte-ciel de Paris / La Défense (immeubles BD TOPO de plus de 90 m,
 *    à leur hauteur réelle) : visibles de loin, par exemple depuis l'Axe Majeur à Cergy
 *    ou les buttes de Cormeilles ;
 *  - Cergy : tour Belvédère (36 m, absente en hauteur de la BD TOPO), colonnes blanches
 *    autour de l'esplanade, passerelle rouge de l'Axe Majeur (géométrie BD TOPO) ;
 *  - Sannois : moulin à vent avec ses ailes qui tournent ;
 *  - Paris : Arc de Triomphe, Notre-Dame, Sacré-Cœur, Dôme des Invalides, Panthéon,
 *    Pyramide du Louvre, Grande Arche, orientés comme les vrais ;
 *  - Dijon : flèche de la cathédrale Saint-Bénigne (93 m).
 *
 * Seuls les monuments à moins de 60 km du départ sont chargés.
 */
import * as THREE from 'three';
import type { LocalProjection } from '../geo/projection';
import { fetchElevations, fetchWfs, type BBox, type GeoFeature } from '../geo/ign';
import { geoToLines, geoToPolys, polyArea } from './geometry';
import type { Exclusion } from './streamer';

const RANGE = 60000;

interface Item {
  obj: THREE.Object3D;
  /** point de référence pour la brume (position du monument) */
  center: THREE.Vector3;
  /** matériaux « lointains » teintés par la brume à la main (la brume de la scène s'arrête trop tôt) */
  far: Array<{ mat: THREE.MeshLambertMaterial; base: THREE.Color }>;
  spin?: THREE.Object3D;
}

const lambert = (color: string, far = false) => new THREE.MeshLambertMaterial({ color, flatShading: true, fog: !far });

export class Landmarks {
  readonly group = new THREE.Group();
  readonly exclusions: Exclusion[] = [];
  private items: Item[] = [];
  private tmp = new THREE.Color();
  private t = 0;

  constructor(private readonly proj: LocalProjection, private readonly horizon: THREE.Color) {}

  private local(lat: number, lon: number): { x: number; z: number; d: number } {
    const p = this.proj.toLocal(lat, lon);
    return { ...p, d: Math.hypot(p.x, p.z) };
  }

  private bbox(lat: number, lon: number, r: number): BBox {
    const dLat = r / 111132, dLon = r / (111320 * Math.cos((lat * Math.PI) / 180));
    return { minLat: lat - dLat, maxLat: lat + dLat, minLon: lon - dLon, maxLon: lon + dLon };
  }

  async load(): Promise<void> {
    const spots = {
      eiffel: { lat: 48.85826, lon: 2.2945 },
      arc: { lat: 48.87378, lon: 2.29506 },
      notredame: { lat: 48.85295, lon: 2.35004 },
      sacrecoeur: { lat: 48.88679, lon: 2.34301 },
      invalides: { lat: 48.85507, lon: 2.31253 },
      pantheon: { lat: 48.84622, lon: 2.34604 },
      louvre: { lat: 48.86101, lon: 2.33586 },
      arche: { lat: 48.8925, lon: 2.2359 },
      belvedere: { lat: 49.046, lon: 2.03347 },
      moulin: { lat: 48.96868, lon: 2.2426 },
      benigne: { lat: 47.3215, lon: 5.03435 },
    };
    const near = Object.entries(spots).filter(([, s]) => this.local(s.lat, s.lon).d < RANGE);
    if (!near.length) return;
    const ele = await fetchElevations(near.map(([, s]) => s.lat), near.map(([, s]) => s.lon)).catch(() => near.map(() => 0));
    const base: Record<string, number> = {};
    near.forEach(([k], i) => (base[k] = Number.isFinite(ele[i]) ? ele[i] : 0));
    const jobs: Array<Promise<void>> = [];
    if ('eiffel' in base) {
      this.add(this.eiffel(), spots.eiffel, base.eiffel, true);
      this.exclude(spots.eiffel, 45);
      jobs.push(this.skyline());
      // Monuments de Paris : modèles orientés comme les vrais, à la place des volumes BD TOPO.
      this.add(this.arcDeTriomphe(), spots.arc, base.arc, true);
      this.exclude(spots.arc, 14);
      this.add(this.notreDame(), spots.notredame, base.notredame, true);
      this.exclude(spots.notredame, 75);
      this.add(this.sacreCoeur(), spots.sacrecoeur, base.sacrecoeur, true);
      this.exclude(spots.sacrecoeur, 22);
      this.add(this.invalides(), spots.invalides, base.invalides, true);
      this.exclude(spots.invalides, 18);
      this.add(this.pantheon(), spots.pantheon, base.pantheon, true);
      this.exclude(spots.pantheon, 20);
      this.add(this.louvre(), spots.louvre, base.louvre, true);
      this.add(this.grandeArche(), spots.arche, base.arche, true);
      this.exclude(spots.arche, 40);
    }
    if ('belvedere' in base) {
      this.add(this.belvedere(), spots.belvedere, base.belvedere, false);
      this.exclusions.push({ ...this.local(spots.belvedere.lat, spots.belvedere.lon), r: 5 });
      jobs.push(this.columns(spots.belvedere), this.passerelle());
    }
    if ('moulin' in base) {
      this.add(this.windmill(), spots.moulin, base.moulin, false);
      this.exclusions.push({ ...this.local(spots.moulin.lat, spots.moulin.lon), r: 5 });
    }
    if ('benigne' in base) this.add(this.spire(93 - 28, 5), spots.benigne, base.benigne + 28, false);
    await Promise.all(jobs.map((j) => j.catch(() => undefined)));
  }

  private exclude(at: { lat: number; lon: number }, r: number): void {
    this.exclusions.push({ ...this.local(at.lat, at.lon), r });
  }

  private add(item: Item, at: { lat: number; lon: number }, y: number, _far: boolean): void {
    const p = this.local(at.lat, at.lon);
    item.obj.position.set(p.x, y, p.z);
    item.center.set(p.x, y, p.z);
    this.group.add(item.obj);
    this.items.push(item);
  }

  // ---------------------------------------------------------------------------
  // Modèles

  /** Tour Eiffel stylisée : quatre piliers, deux plateformes, fût effilé et antenne (330 m). */
  private eiffel(): Item {
    const mat = lambert('#6b5845', true);
    const g = new THREE.Group();
    const prism = (pts: number[][]) => {
      // tronc de pyramide à base carrée : 4 coins bas (y0, demi-côté a) → 4 coins hauts (y1, demi-côté b)
      const [y0, a, y1, b] = pts[0];
      const geo = new THREE.CylinderGeometry(b * Math.SQRT2, a * Math.SQRT2, y1 - y0, 4, 1).rotateY(Math.PI / 4).translate(0, (y0 + y1) / 2, 0);
      return new THREE.Mesh(geo, mat);
    };
    // piliers : de chaque coin (±62 m) vers le premier étage (±35 m à 57 m)
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(7, 12, 62, 4).rotateY(Math.PI / 4), mat);
      leg.position.set(sx * 48, 28, sz * 48);
      leg.lookAt(sx * 30, 70, sz * 30);
      leg.rotateX(Math.PI / 2);
      g.add(leg);
    }
    g.add(prism([[57, 36, 61, 36]]));
    g.add(prism([[61, 30, 115, 17]]));
    g.add(prism([[115, 20, 119, 20]]));
    g.add(prism([[119, 15, 276, 4]]));
    g.add(prism([[276, 6, 282, 6]]));
    g.add(prism([[282, 2.5, 330, 0.5]]));
    return { obj: g, center: new THREE.Vector3(), far: [{ mat, base: mat.color.clone() }] };
  }

  /** Groupe dont l'axe local +X suit une direction donnée (angle en degrés depuis l'est, vers le nord positif). */
  private oriented(deg: number, mats: THREE.MeshLambertMaterial[]): { g: THREE.Group; item: Item } {
    const g = new THREE.Group();
    g.rotation.y = (deg * Math.PI) / 180;
    return { g, item: { obj: g, center: new THREE.Vector3(), far: mats.map((m) => ({ mat: m, base: m.color.clone() })) } };
  }

  /** Boîte de dimensions (lx, ly, lz) dont le coin bas est centré en (x, y0, z). */
  private box(lx: number, ly: number, lz: number, x: number, y0: number, z: number, m: THREE.Material): THREE.Mesh {
    return new THREE.Mesh(new THREE.BoxGeometry(lx, ly, lz).translate(x, y0 + ly / 2, z), m);
  }

  /** Arc de Triomphe (49,5 m), arche principale ouverte dans l'axe des Champs-Élysées. */
  private arcDeTriomphe(): Item {
    const stone = lambert('#e6dcc6', true);
    // axe historique (Louvre → Arc de Triomphe → La Défense) : ~25° au nord de l'ouest
    const { g, item } = this.oriented(154.7, [stone]);
    for (const s of [-1, 1]) g.add(this.box(22, 29.2, 15.2, 0, 0, s * 14.9, stone));
    g.add(this.box(22, 20.3, 45, 0, 29.2, 0, stone));
    g.add(this.box(23, 1.6, 46, 0, 47.9, 0, lambert('#d8cdb4', true)));
    return item;
  }

  /** Notre-Dame de Paris : nef, transept, chevet, deux tours de 69 m, flèche de 96 m. Axe ~24° au sud de l'est. */
  private notreDame(): Item {
    const stone = lambert('#d9cdb3', true), roof = lambert('#5f6b78', true);
    const { g, item } = this.oriented(-24.2, [stone, roof]);
    // origine = centre de l'emprise BD TOPO ; façade ouest à −60 m, chevet à +68 m
    const W = -60;
    g.add(this.box(14, 43, 40, W + 7, 0, 0, stone)); // massif de la façade
    for (const s of [-1, 1]) g.add(this.box(14, 26, 14, W + 7, 43, s * 13, stone)); // tours jusqu'à 69 m
    g.add(this.box(100, 20, 40, W + 64, 0, 0, stone)); // bas-côtés
    g.add(this.box(100, 33, 13, W + 64, 0, 0, stone)); // vaisseau central
    const nave = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 9.2, 10, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 1), roof);
    nave.scale.set(100 / 13, 1, 1);
    nave.position.set(W + 64, 38, 0);
    g.add(nave);
    g.add(this.box(14, 33, 48, W + 74, 0, 0, stone)); // transept
    const apse = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 30, 8, 1, false, 0, Math.PI).rotateY(-Math.PI / 2).translate(W + 114, 15, 0), stone);
    g.add(apse);
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 4, 53, 8).translate(W + 74, 43 + 26.5, 0), roof)); // flèche
    return item;
  }

  /** Sacré-Cœur : basilique blanche, dôme principal, quatre petits dômes, campanile au nord. */
  private sacreCoeur(): Item {
    const white = lambert('#f2efe6', true);
    const { g, item } = this.oriented(90, [white]); // façade au sud, chevet et campanile au nord
    g.add(this.box(80, 24, 34, 0, 0, 0, white));
    g.add(this.box(30, 24, 56, -2, 0, 0, white));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(11, 12, 22, 16).translate(-2, 35, 0), white));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(12, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2.1, 1).translate(-2, 46, 0), white));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 10, 8).translate(-2, 76, 0), white));
    for (const [x, z] of [[-30, 12], [-30, -12], [22, 12], [22, -12]]) {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(4.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.8, 1).translate(x, 24, z), white));
    }
    g.add(this.box(11, 62, 11, 44, 0, 0, white));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(5.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1).translate(44, 62, 0), white));
    return item;
  }

  /** Dôme des Invalides : base carrée, tambour, dôme doré, lanterne et flèche (107 m). */
  private invalides(): Item {
    const stone = lambert('#ddd3bd', true), gold = lambert('#d4a937', true), lead = lambert('#5d6670', true);
    const { g, item } = this.oriented(0, [stone, gold, lead]);
    g.add(this.box(56, 28, 56, 0, 0, 0, stone));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 22, 16).translate(0, 39, 0), stone));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(14, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.7, 1).translate(0, 50, 0), lead));
    for (let k = 0; k < 12; k++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(1, 22, 1).translate(0, 11, 0), gold);
      const a = (k / 12) * Math.PI * 2;
      rib.position.set(Math.cos(a) * 12.5, 50, Math.sin(a) * 12.5);
      rib.lookAt(0, 76, 0);
      rib.rotateX(Math.PI / 2);
      g.add(rib);
    }
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 12, 8).translate(0, 79, 0), gold));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 1.4, 16, 6).translate(0, 93, 0), gold));
    return item;
  }

  /** Panthéon : plan en croix, péristyle à l'ouest, tambour à colonnade, dôme (83 m). */
  private pantheon(): Item {
    const stone = lambert('#e3dccb', true), dome = lambert('#b9bab3', true);
    const { g, item } = this.oriented(0, [stone, dome]);
    g.add(this.box(100, 26, 36, 0, 0, 0, stone));
    g.add(this.box(36, 26, 82, 0, 0, 0, stone));
    g.add(this.box(14, 22, 36, -57, 0, 0, stone)); // péristyle côté rue Soufflot
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 21, 8, 4).rotateY(Math.PI / 4).scale(0.5, 1, 1.25).translate(-57, 26, 0), stone));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(19, 19, 24, 20).translate(0, 38, 0), stone));
    g.add(new THREE.Mesh(new THREE.SphereGeometry(16, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.3, 1).translate(0, 50, 0), dome));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(2, 2.6, 12, 8).translate(0, 76, 0), dome));
    return item;
  }

  /** Pyramide du Louvre (21,6 m, base 35 m), alignée sur l'axe historique. */
  private louvre(): Item {
    const glass = new THREE.MeshLambertMaterial({ color: '#9fb7c9', flatShading: true, fog: false, transparent: true, opacity: 0.85 });
    const { g, item } = this.oriented(154.7, [glass]);
    g.add(new THREE.Mesh(new THREE.ConeGeometry(25, 21.6, 4).rotateY(Math.PI / 4).translate(0, 10.8, 0), glass));
    return item;
  }

  /** Grande Arche de La Défense : cube creux de 110 m, légèrement tourné par rapport à l'axe historique. */
  private grandeArche(): Item {
    const white = lambert('#f1f2f0', true);
    const { g, item } = this.oriented(154.7 + 6.3, [white]);
    for (const s of [-1, 1]) g.add(this.box(112, 92, 18, 0, 0, s * 45, white));
    g.add(this.box(112, 18, 108, 0, 92, 0, white));
    return item;
  }

  /** Gratte-ciel de Paris et de La Défense (BD TOPO, plus de 90 m), extrudés à leur hauteur réelle. */
  private async skyline(): Promise<void> {
    const b: BBox = { minLat: 48.82, maxLat: 48.91, minLon: 2.2, maxLon: 2.42 };
    const feats = await fetchWfs('batiment', b, ['hauteur', 'nature'], 1, 'hauteur>90');
    const mats = ['#8ea3b5', '#a7b5c1', '#71879a', '#b9c3cc'].map((c) => lambert(c, true));
    const eiffel = this.local(48.85826, 2.2945);
    const arche = this.local(48.8925, 2.2359);
    const group = new THREE.Group();
    for (const f of feats as GeoFeature[]) {
      const polys = geoToPolys(f.geometry, this.proj);
      if (!polys.length) continue;
      const ring = polys[0].outer;
      let cx = 0, cz = 0;
      for (const [x, z] of ring) { cx += x; cz += z; }
      cx /= ring.length; cz /= ring.length;
      // la tour Eiffel et la Grande Arche ont leur propre modèle
      if (Math.hypot(cx - eiffel.x, cz - eiffel.z) < 150 || Math.hypot(cx - arche.x, cz - arche.z) < 40) continue;
      const h = Number(f.properties.hauteur);
      const coords = f.geometry.coordinates as number[][][][];
      const roofZ = Number(coords?.[0]?.[0]?.[0]?.[2]);
      const baseY = Number.isFinite(roofZ) && roofZ > -500 ? roofZ - h : 35;
      const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, baseY, 0);
      group.add(new THREE.Mesh(geo, mats[Math.abs(Math.round(cx)) % mats.length]));
      this.exclusions.push({ x: cx, z: cz, r: 4 });
    }
    this.group.add(group);
    const c = this.local(48.8925, 2.236); // La Défense
    this.items.push({ obj: group, center: new THREE.Vector3(c.x, 60, c.z), far: mats.map((m) => ({ mat: m, base: m.color.clone() })) });
  }

  /** Tour Belvédère de l'Axe Majeur : tour carrée blanche de 36 m. */
  private belvedere(): Item {
    const mat = lambert('#f1efe8');
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(4.6, 36, 4.6).translate(0, 18, 0), mat));
    const crack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 30, 4.7).translate(0, 19, 0), lambert('#c9c6bd'));
    g.add(crack);
    return { obj: g, center: new THREE.Vector3(), far: [] };
  }

  /** Colonnes de l'esplanade : piliers fins (< 12 m² au sol, > 10 m) recensés par la BD TOPO, rendus en colonnes blanches. */
  private async columns(at: { lat: number; lon: number }): Promise<void> {
    const feats = await fetchWfs('batiment', this.bbox(at.lat, at.lon, 400), ['hauteur', 'nature']);
    const mat = lambert('#f4f2ec');
    const group = new THREE.Group();
    const cols: Array<{ cx: number; cz: number; area: number; h: number }> = [];
    for (const f of feats) {
      const polys = geoToPolys(f.geometry, this.proj);
      if (!polys.length) continue;
      const ring = polys[0].outer;
      const area = Math.abs(polyArea(ring));
      const h = Number(f.properties.hauteur);
      if (!(area < 12 && h > 10)) continue;
      let cx = 0, cz = 0;
      for (const [x, z] of ring) { cx += x; cz += z; }
      cols.push({ cx: cx / ring.length, cz: cz / ring.length, area, h });
    }
    const alt = await this.altitudes(cols.map((c) => [c.cx, c.cz]));
    cols.forEach(({ cx, cz, area, h }, i) => {
      const r = Math.max(0.5, Math.sqrt(area / Math.PI));
      const col = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, h, 10).translate(0, h / 2, 0), mat);
      col.position.set(cx, alt[i] - 0.3, cz);
      group.add(col);
      this.exclusions.push({ x: cx, z: cz, r: r + 1.5 });
    });
    this.group.add(group);
    this.items.push({ obj: group, center: new THREE.Vector3(), far: [] });
  }

  /** Passerelle rouge de l'Axe Majeur, d'après la ligne « Pont – Passerelle » de la BD TOPO. */
  private async passerelle(): Promise<void> {
    const b: BBox = { minLat: 49.036, maxLat: 49.041, minLon: 2.039, maxLon: 2.046 };
    const feats = await fetchWfs('construction_lineaire', b, ['nature', 'nature_detaillee']);
    const red = lambert('#c62f2b');
    const group = new THREE.Group();
    for (const f of feats) {
      if (f.properties.nature_detaillee !== 'Passerelle') continue;
      for (const line of geoToLines(f.geometry, this.proj)) {
        const len = line.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - line[i - 1][0], p[2] - line[i - 1][2]) : 0), 0);
        if (len < 50) continue;
        const piers: Array<[number, number]> = [];
        for (let i = 0; i < line.length - 1; i++) {
          const [ax, ay, az] = line[i], [bx, by, bz] = line[i + 1];
          const l = Math.hypot(bx - ax, bz - az);
          const yA = Number.isFinite(ay) ? ay : 31, yB = Number.isFinite(by) ? by : 31;
          const deck = new THREE.Mesh(new THREE.BoxGeometry(l, 0.7, 3.4), red);
          deck.position.set((ax + bx) / 2, (yA + yB) / 2 - 0.35, (az + bz) / 2);
          deck.rotation.y = -Math.atan2(bz - az, bx - ax);
          group.add(deck);
          for (const side of [-1.6, 1.6]) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(l, 1.1, 0.12), red);
            rail.position.set(0, 0.9, side);
            deck.add(rail);
          }
          for (let s = 0; s < l; s += 32) piers.push([ax + ((bx - ax) * s) / l, az + ((bz - az) * s) / l]);
        }
        const ground = await this.altitudes(piers);
        const deckY = Number.isFinite(line[0][1]) ? line[0][1] : 31;
        piers.forEach(([x, z], i) => {
          const hgt = deckY - ground[i];
          if (hgt < 1) return;
          const pier = new THREE.Mesh(new THREE.BoxGeometry(1.2, hgt, 1.2).translate(0, hgt / 2, 0), red);
          pier.position.set(x, ground[i], z);
          group.add(pier);
        });
      }
    }
    this.group.add(group);
    this.items.push({ obj: group, center: new THREE.Vector3(), far: [] });
  }

  /** Moulin à vent (modèle générique) : tour de pierre, toit conique, quatre ailes qui tournent. */
  private windmill(): Item {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 9, 10).translate(0, 4.5, 0), lambert('#e9e3d3')));
    g.add(new THREE.Mesh(new THREE.ConeGeometry(3.1, 3.6, 10).translate(0, 10.8, 0), lambert('#5b4a3d')));
    const hub = new THREE.Group();
    hub.position.set(0, 9.2, 3.3);
    const wood = lambert('#8a6b4c');
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Group();
      arm.rotation.z = (k * Math.PI) / 2;
      arm.add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 8.5, 0.25).translate(0, 4.4, 0), wood));
      arm.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 6.5, 0.08).translate(0.8, 5.2, 0), lambert('#efe7d6')));
      hub.add(arm);
    }
    g.add(hub);
    return { obj: g, center: new THREE.Vector3(), far: [], spin: hub };
  }

  /** Flèche d'église octogonale (cathédrale Saint-Bénigne à Dijon). */
  private spire(h: number, r: number): Item {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 6, 8).translate(0, 3, 0), lambert('#d8cfb8')));
    // tuiles vernissées bourguignonnes : bandes de couleurs
    const colors = ['#c9a227', '#2f6b3a', '#8e2a1c', '#1f2428'];
    const bands = 6;
    for (let i = 0; i < bands; i++) {
      const r0 = r * (1 - i / bands), r1 = r * (1 - (i + 1) / bands);
      const hh = (h - 6) / bands;
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(Math.max(0.05, r1), r0, hh, 8).translate(0, 6 + hh * (i + 0.5), 0), lambert(colors[i % colors.length])));
    }
    return { obj: g, center: new THREE.Vector3(), far: [] };
  }

  /** Altitude IGN de plusieurs points locaux (0 si indisponible). */
  private async altitudes(pts: Array<[number, number]>): Promise<number[]> {
    if (!pts.length) return [];
    const ll = pts.map(([x, z]) => this.proj.toLatLon(x, z));
    const out: number[] = [];
    for (let i = 0; i < ll.length; i += 400) {
      const part = ll.slice(i, i + 400);
      const e = await fetchElevations(part.map((p) => p.lat), part.map((p) => p.lon)).catch(() => part.map(() => 0));
      out.push(...e.map((v) => (Number.isFinite(v) ? v : 0)));
    }
    return out;
  }

  // ---------------------------------------------------------------------------

  /** Brume des monuments lointains et rotation des ailes du moulin. */
  update(cam: THREE.Vector3): void {
    this.t += 1 / 60;
    for (const it of this.items) {
      if (it.spin) it.spin.rotation.z -= 0.012;
      if (!it.far.length) continue;
      const d = cam.distanceTo(it.center);
      const haze = Math.min(0.82, Math.max(0, (d - 2000) / 45000));
      for (const f of it.far) f.mat.color.copy(this.tmp.copy(f.base).lerp(this.horizon, haze));
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
