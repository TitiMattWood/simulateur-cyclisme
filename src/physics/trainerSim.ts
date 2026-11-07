/**
 * Paramètres envoyés au home trainer en mode SIM (FTMS « Indoor Bike Simulation »).
 *
 * Changement de vitesse MANUEL (cassette réelle) : on envoie la pente, le Crr et la
 * résistance de l'air tels quels ; le trainer fait le reste.
 *
 * Changement de vitesse VIRTUEL (pignon unique) : soit k = rapport virtuel / rapport réel.
 * Pour une même cadence, le vélo virtuel roule k fois plus vite que le volant du trainer,
 * et l'effort aux pédales doit être celui du braquet virtuel. Le calcul (couple aux
 * manivelles identique) donne, à la vitesse v_t du trainer :
 *
 *   F_trainer(v_t) = k × F_route(k × v_t)
 *
 * ce qui revient à envoyer :
 *   sin(pente') + Crr·cos(pente') = k × (sin(pente) + Crr·cos(pente))
 *   cw'         = cw × k³          (la traînée croît avec le carré de la vitesse)
 *   vent'       = vent / k
 *
 * Hypothèse : le trainer applique la pente avec une masse proche de celle du cycliste.
 * Le protocole FTMS ne permet pas de lui transmettre le poids, donc l'effort peut être
 * décalé de quelques pourcents selon le modèle de trainer.
 */

export interface SimInput {
  /** pente réelle (fraction) */
  grade: number;
  crr: number;
  /** coefficient de vent ½·ρ·CdA (kg/m), aspiration comprise */
  cw: number;
  /** vent de face (m/s) */
  headwind: number;
  /** part de la pente transmise au trainer (réglage « difficulté ») */
  difficulty: number;
  /** rapport virtuel / rapport réel ; 1 en changement de vitesse manuel */
  k: number;
}

export interface SimOutput {
  grade: number;
  crr: number;
  cw: number;
  wind: number;
}

/** Limite du protocole FTMS pour cw (octet, pas de 0,01 kg/m). */
const CW_MAX = 2.55;

export function simulationParams(i: SimInput): SimOutput {
  const g = i.grade * i.difficulty;
  if (Math.abs(i.k - 1) < 1e-6) return { grade: g, crr: i.crr, cw: Math.min(CW_MAX, i.cw), wind: i.headwind };
  const theta = Math.atan(g);
  // On cherche θ' tel que sin θ' + Crr·cos θ' = k·(sin θ + Crr·cos θ),
  // soit √(1+Crr²)·sin(θ' + φ) = cible, avec φ = atan(Crr).
  const target = i.k * (Math.sin(theta) + i.crr * Math.cos(theta));
  const phi = Math.atan(i.crr);
  const x = Math.max(-0.95, Math.min(0.95, target / Math.sqrt(1 + i.crr * i.crr)));
  return {
    grade: Math.tan(Math.asin(x) - phi),
    crr: i.crr,
    cw: Math.min(CW_MAX, i.cw * i.k ** 3),
    wind: i.headwind / i.k,
  };
}
