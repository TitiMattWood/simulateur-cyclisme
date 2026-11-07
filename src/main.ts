/**
 * Point d'entrée : démarre l'application dans la page.
 */
import './ui/styles.css';
import { App } from './ui/app';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const app = new App(canvas, ui);
// Accès depuis la console du navigateur (débogage) : window.simulateur
(window as unknown as { simulateur: App }).simulateur = app;
