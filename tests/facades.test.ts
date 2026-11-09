import { describe, it, expect } from 'vitest';
import { chooseFacade, roadColumn } from '../src/world/features';
import { FACADE } from '../src/world/textures';

const r = () => 0.5;

describe('façades selon la BD TOPO', () => {
  it('pavillon en meulière (code 2) → meulière', () => {
    expect(chooseFacade({ usage_1: 'Résidentiel', materiaux_des_murs: '20', nombre_de_logements: 1 }, 7, 90, r).upper).toBe(FACADE.meuliere);
  });
  it('pavillon enduit → pavillon à volets', () => {
    expect(chooseFacade({ usage_1: 'Résidentiel', materiaux_des_murs: '50', nombre_de_logements: 1, date_d_apparition: '1978-01-01Z' }, 6, 90, r).upper).toBe(FACADE.pavillon);
  });
  it('immeuble de logements → balcons', () => {
    expect(chooseFacade({ usage_1: 'Résidentiel', nombre_de_logements: 40 }, 25, 600, r).upper).toBe(FACADE.balcons);
  });
  it('vieille maison de village en pierre → pierre', () => {
    expect(chooseFacade({ usage_1: 'Résidentiel', materiaux_des_murs: '10' }, 6, 80, r).upper).toBe(FACADE.pierre);
  });
  it('bureaux hauts → mur-rideau ; commerce bas → vitrine au rez-de-chaussée', () => {
    expect(chooseFacade({ usage_1: 'Commercial et services' }, 30, 900, r).upper).toBe(FACADE.bureaux);
    expect(chooseFacade({ usage_1: 'Commercial et services' }, 7, 200, r).ground).toBe(FACADE.vitrine);
  });
  it('entrepôt → bardage ; église → pierre', () => {
    expect(chooseFacade({ usage_1: 'Industriel' }, 9, 2000, r).upper).toBe(FACADE.bardage);
    expect(chooseFacade({ usage_1: 'Religieux', nature: 'Eglise' }, 15, 500, r).upper).toBe(FACADE.pierre);
  });
});

describe('marquage des routes', () => {
  it('route de campagne à double sens → lignes de rive et centrale', () => {
    expect(roadColumn({ nature: 'Route à 1 chaussée', largeur_de_chaussee: 6, sens_de_circulation: 'Double sens', urbain: false })).toBe(0);
  });
  it('rue de ville à double sens → ligne centrale', () => {
    expect(roadColumn({ nature: 'Route à 1 chaussée', largeur_de_chaussee: 6, sens_de_circulation: 'Double sens', urbain: true })).toBe(1);
  });
  it('rue à sens unique ou étroite → sans marquage ; chemin → gravier', () => {
    expect(roadColumn({ nature: 'Route à 1 chaussée', largeur_de_chaussee: 6, sens_de_circulation: 'Sens direct', urbain: true })).toBe(2);
    expect(roadColumn({ nature: 'Route à 1 chaussée', largeur_de_chaussee: 3.5, sens_de_circulation: 'Double sens' })).toBe(2);
    expect(roadColumn({ nature: 'Chemin' })).toBe(3);
  });
});
