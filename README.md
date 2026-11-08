# MyHomeRide by Titi

Simulateur de home trainer dans le navigateur : on roule en 3D low-poly sur les **vrais reliefs de France**,
générés à partir des données ouvertes de l'IGN, avec un home trainer connecté en Bluetooth.

Mondes : **Horizon du 95** (Val-d'Oise), **Côtes et Moutarde** (Côte-d'Or), **L'air de la Montagne** (Alpes).

## État : lots 1 et 2

### Lot 2 : trajet libre, revêtements, monuments

| Fonction | État |
|---|---|
| **Trajet libre** partout en France : réseau routier BD TOPO construit à la volée, choix de direction à chaque carrefour (← / → ou boutons ◀ ▶), demi-tour (U), nom des rues, mini-carte orientée, profil des 1,5 km à venir | ✅ |
| Points de départ : Cergy (Axe Majeur, Village, Cergy-le-Haut), Vauréal, Franconville, Ermont, Sannois, Montsoult, Marines, Dijon, Longvic, lac Kir, Albertville, Bourg-d'Oisans ; ou n'importe quelle adresse (géocodage IGN) | ✅ |
| Terrain aplani sous toutes les routes (chaussée posée sur son replat dans les pentes) | ✅ |
| Revêtements : bitume, allées revêtues, gravier, terre (estimés d'après la BD TOPO) → Crr de la physique, couleur de la chaussée, reconnus aussi sous les tracés GPX | ✅ |
| Monuments de Paris modélisés et orientés comme les vrais : tour Eiffel, Arc de Triomphe, Notre-Dame (tours, flèche), Sacré-Cœur, Dôme des Invalides, Panthéon, Pyramide du Louvre, Grande Arche (creuse) ; le reste de Paris vient de la BD TOPO (emprises et hauteurs réelles). Départs : Champ-de-Mars, Notre-Dame, Champs-Élysées, Montmartre | ✅ |
| Autres monuments : gratte-ciel de Paris et de La Défense (hauteurs BD TOPO, visibles depuis Cergy), tour Belvédère, colonnes de l'esplanade, passerelle rouge de l'Axe Majeur, moulin de Sannois, flèche de Saint-Bénigne ; toits vernissés des églises de Côte-d'Or ; tours et châteaux en pierre | ✅ |
| Transmission virtuelle au choix : mono ou double plateau (séquentiel ou avec touche plateau), cassette, pneu | ✅ |
| Alpe d'Huez : montée officielle de 13,8 km (Bourg-d'Oisans → avenue du Rif Nel) | ✅ |

### Avatar et accueil

| Fonction | État |
|---|---|
| Avatar « réaliste stylisé » : membres au profil anatomique, silhouette selon la taille et le poids, visage, cheveux, barbe, lunettes | ✅ |
| Tenue : 8 motifs de maillot, 3 couleurs, cuissard, manches courtes/longues, gants, 3 casques (route, aéro, CLM), chaussures, chaussettes, couvre-chaussures | ✅ |
| Vélo : 5 cadres dans l'esprit de la gamme Scott (Addict RC, Foil, Addict Gravel, Plasma, Spark tout-suspendu) avec leur position et leur physique : tubes à profil tronqué, haubans plongeants, cockpit intégré, inscription « MyHomeRide » ; couleurs et finition du cadre, groupe, guidoline, pneus (crampons en gravel/VTT), selle, bidons, compteur | ✅ |
| Casques dans l'esprit de Specialized (route ventilé type Prevail, aéro type Evade, CLM à queue courte et visière type TT5) ; chaussures à molettes | ✅ |
| Aperçu en direct de l'avatar pendant les réglages du profil, gros plan de la caméra | ✅ |
| Pièce d'accueil : vélo face à une TV qui affiche une route ; au départ, la caméra plonge dans l'écran | ✅ |

### Lot 1 : socle

| Fonction | État |
|---|---|
| Import d'un fichier `.gpx` → monde 3D généré automatiquement (relief, couleurs du sol, bâtiments, forêts, haies, vignes, routes, voies ferrées, rivières) | ✅ |
| Altitude du parcours IGN RGE ALTI (1 m), correction des ponts et tunnels, pente réelle | ✅ |
| Moteur physique (puissance → vitesse : masse, pente, CdA, Crr, altitude, vent, aspiration, cadre, roues, équipement) | ✅ (aspiration et vent prêts côté physique, utilisés à partir du lot 3 et du lot 6) |
| Freinage automatique avant les virages serrés | ✅ |
| Bluetooth : trainer FTMS (modes SIM et ERG), capteur de puissance, cardio (ceinture ou montre Coros/Garmin en diffusion), cadence ; reconnexion automatique | ✅ (ERG utilisé à partir du lot 4) |
| Changement de vitesse au choix : **manuel** (cassette du vélo) ou **virtuel** (pignon unique type Zwift Cog, 24 rapports, touches réglables pour les manettes via BikeControl, boutons tactiles) | ✅ |
| Mode démo sans capteur (puissance au clavier ou boutons tactiles) | ✅ |
| 5 caméras : action cam, cockpit, poursuite (+ regard arrière), drone, réalisation TV | ✅ |
| Tableau de bord : puissance, W/kg, zones, vitesse, cadence, FC, pente, distance, temps, D+, profil, mini-carte | ✅ |
| Bilan : distance, temps, kcal, TSS, IF, puissance moyenne/normalisée, XP ; export `.fit` (sortie virtuelle Strava/Garmin/Coros) et `.gpx` | ✅ |
| Profil, niveau/XP, historique, sauvegarde locale + export/restauration d'un fichier de sauvegarde | ✅ |
| Français par défaut, anglais en option | ✅ |
| Parcours : boucles du Vexin (57 km), de Montsoult (54 km) et Franconville–Ermont–Sannois (52 km) au départ de Cergy ; Cergy–Vauréal, Buttes du Parisis, Dijon–Longvic–Lac Kir, Albertville–La Bâthie–Champagny-le-Haut, Alpe d'Huez | ✅ |

### Lots suivants

3. Sortie en groupe et course contre l'IA (aspiration, barre d'aspiration, demi-tour, attaques, fatigue).
   Lecture directe des manettes Zwift Click/Play en Bluetooth (sans BikeControl), si leur protocole le permet.
4. Entraînement structuré (mode ERG) et défis KOM (détection automatique des montées, fantôme du record).
5. Progression : trophées, garage et avatar complet.
6. Monde vivant : météo, cycle jour/nuit, audio 3D, trafic, piétons, événements, photo souvenir.

## Lancer l'application

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests unitaires
npm run build      # version de production dans dist/
```

## Matériel et navigateurs

- **Bluetooth** : Chrome ou Edge sur Windows, macOS, Android et ChromeOS.
  **Linux** : dans Chrome, activer `chrome://flags/#enable-experimental-web-platform-features` puis relancer ;
  utiliser Chrome installé en paquet (.deb/.rpm), pas en Flatpak/Snap, avec le service Bluetooth (BlueZ) actif.
  Safari (Mac, iPhone, iPad) et Firefox ne gèrent pas le Web Bluetooth.
  Sur iPad, le navigateur **Bluefy** l'ajoute (à tester avec ton matériel).
- **Apple TV** : tvOS n'a pas de navigateur. Il faut faire tourner l'application sur un iPad ou un Mac
  et recopier l'écran par AirPlay, ou brancher le PC sur la TV en HDMI.
- **ANT+** : non disponible dans un navigateur ; tout passe par le Bluetooth.
- **Montre en cardio** : activer la diffusion de la fréquence cardiaque (Coros : « Diffusion FC » ; Garmin : « Diffuser la FC »).
  Certaines montres Garmin anciennes ne diffusent qu'en ANT+.
- Le Web Bluetooth exige une page **HTTPS** (ou `localhost`).

## Hébergement

L'application est un site statique (dossier `dist/`), sans serveur applicatif.

- **GitHub Pages (v1)** : le fichier `.github/workflows/deploy.yml` publie automatiquement le site à chaque mise à jour
  de la branche `main`. Prérequis, une seule fois :
  1. passer le dépôt en public (Settings → General → Danger Zone → Change visibility) ;
  2. Settings → Pages → Build and deployment → Source : **GitHub Actions**.

  Adresse : `https://titimattwood.github.io/simulateur-cyclisme/`
- **NAS TrueNAS + Tailscale (v2)** : servir `dist/` (conteneur nginx ou `tailscale serve`). Tailscale fournit un
  certificat HTTPS valide en `*.ts.net`, indispensable pour que le navigateur autorise le Bluetooth.

## Clavier

`←` `→` direction au prochain carrefour (trajet libre) · `U` demi-tour · `1`–`5` caméras · `C` caméra suivante · `B` (maintenir) regard arrière · `H` masquer le tableau de bord ·
`+` / `-` (ou les touches choisies dans le profil, `PageUp` / `PageDown` par défaut) vitesses virtuelles ·
`↑` `↓` puissance en mode démo (`Maj` = ±50 W) · `Espace` / `Échap` pause.

## Données et licences

- Relief, orthophotos et BD TOPO : © IGN – Géoplateforme, [Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/).
  Les données sont téléchargées pendant la préparation du parcours, puis gardées dans le cache du navigateur.
- Parcours calculés avec [BRouter](https://brouter.de) à partir d'OpenStreetMap, © contributeurs OpenStreetMap (ODbL),
  puis nettoyés des allers-retours en cul-de-sac par `scripts/make-route.py`.
- Google Maps n'est pas utilisé : ses conditions d'utilisation interdisent d'extraire ses données pour construire un autre monde.

## Organisation du code

```
src/
  config.ts            réglages globaux, sources IGN, préréglages graphiques
  geo/                 GPX, projection, parcours (pente, virages), accès IGN
  physics/             matériel (CdA, Crr, masses) et moteur physique
  devices/             Bluetooth : FTMS, puissance, cardio, cadence, gestionnaire
  world/               génération du monde : terrain, bâtiments, végétation, routes, chargement par tuiles
  render/              moteur 3D, avatar, caméras, décor d'accueil
  ride/                boucle de sortie, enregistrement, indicateurs (NP, TSS, kcal, XP)
  export/              encodeurs .fit et .gpx
  storage/             profil et sauvegarde
  ui/                  interface, tableau de bord, styles
  i18n/                textes français et anglais
scripts/               carte de France, calcul des parcours (make-route.py)
tests/                 tests unitaires (vitest)
```
