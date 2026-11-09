// Outil de développement : pilote un Chrome sans écran (protocole DevTools) pour exécuter des
// étapes sur l'application et prendre des captures d'écran.
//
// usage : node scripts/capture.mjs <dossier_sortie> '<étapes JSON>' [largeur] [hauteur]
// étapes : [{ "nav": url, "wait": ms }, { "js": "expression", "wait": ms }, { "sleep": ms }, { "shot": "nom" }]
//
// L'application expose window.simulateur pour être pilotée depuis ces étapes.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [, , outDir, stepsJson, W = '1400', H = '850'] = process.argv;
const steps = JSON.parse(stepsJson);
mkdirSync(outDir, { recursive: true });
const prof = join(tmpdir(), 'myhomeride-chrome-prof');
const chrome = spawn('google-chrome', [
  '--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${prof}`, `--window-size=${W},${H}`,
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0;
const pending = new Map();
const logs = [];
for (let i = 0; i < 40; i++) {
  try {
    const tabs = await (await fetch('http://127.0.0.1:9333/json')).json();
    const page = tabs.find((t) => t.type === 'page');
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
  } catch { /* Chrome démarre */ }
  await sleep(250);
}
await new Promise((r) => ws.addEventListener('open', r));
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type !== 'debug') logs.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  if (m.method === 'Runtime.exceptionThrown') logs.push(`EXC: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: false });
for (const st of steps) {
  if (st.nav) { await send('Page.navigate', { url: st.nav }); await sleep(st.wait ?? 2500); }
  if (st.js) {
    const r = await send('Runtime.evaluate', { expression: st.js, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) logs.push(`JSERR ${r.result.exceptionDetails.exception?.description}`);
    else if (r.result?.result?.value !== undefined && r.result.result.value !== 1) logs.push(`JS> ${JSON.stringify(r.result.result.value)}`);
    await sleep(st.wait ?? 300);
  }
  if (st.sleep) await sleep(st.sleep);
  if (st.shot) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${outDir}/${st.shot}.png`, Buffer.from(r.result.data, 'base64'));
  }
}
console.log(logs.filter((l) => !l.includes('[vite]')).join('\n'));
ws.close();
chrome.kill();
process.exit(0);
