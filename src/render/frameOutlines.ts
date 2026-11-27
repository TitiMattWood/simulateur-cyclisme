/**
 * Silhouettes de cadres relevées sur les photos de profil (pixels de la photo d'origine).
 * Le modèle 3D convertit ces contours en mètres (axe de roue arrière à l'origine) et les
 * extrude avec des bords arrondis : la silhouette vue de profil est celle de la photo.
 *
 * Relevé : grille posée sur la photo, puis contrôle en superposant le tracé à la photo.
 */
export type Pt = [number, number];

export interface FrameOutline {
  /** axes des roues et boîtier de pédalier (pixels) */
  rear: Pt;
  front: Pt;
  bb: Pt;
  /** haut du tube de selle, haut et bas de la douille (pixels) */
  seatTop: Pt;
  headTop: Pt;
  headBot: Pt;
  /** photo de référence (dossier image/ du projet, non publié) et sa taille en pixels */
  photo: string;
  size: Pt;
  /** mètres par pixel (horizontal, vertical) */
  kx: number;
  ky: number;
  /** triangle avant (contour extérieur et fenêtre), haubans, bases, fourche */
  front3: Pt[];
  hole: Pt[];
  seatstay: Pt[];
  chainstay: Pt[];
  fork: Pt[];
}

export const OUTLINES: Record<'climb' | 'aero' | 'gravel' | 'tt', FrameOutline> = {
  // Cannondale SuperSix EVO (photo de profil, image/velos/route)
  climb: {
    photo: 'image/velos/route/Capture d’écran du 2026-11-27 11-43-53.png', size: [1246,726],
    rear: [268,450], front: [900,450], bb: [545,490],
    seatTop: [428,180], headTop: [800,135], headBot: [830,250],
    kx: 0.001611, ky: 0.001611,
    front3: [[412,178],[440,176],[600,158],[752,138],[800,132],[812,160],[824,205],[838,250],[800,256],[760,300],[700,350],[640,425],[600,470],[575,505],[540,515],[515,500],[500,460],[485,400],[467,350],[440,300],[427,250],[415,210]],
    hole: [[458,198],[600,179],[742,168],[750,185],[738,225],[700,300],[652,350],[590,425],[548,452],[515,420],[505,370],[478,300],[462,240]],
    seatstay: [[262,444],[280,438],[432,288],[448,300],[285,458],[268,460]],
    chainstay: [[268,444],[520,468],[530,495],[275,462]],
    fork: [[815,252],[848,250],[907,447],[898,458],[890,452]],
  },
  // Scott Foil RC (photo légèrement de biais : échelle horizontale propre, image/velos/aero)
  aero: {
    photo: 'image/velos/aero/Capture d’écran du 2026-11-27 11-40-14.png', size: [680,415],
    rear: [186,252], front: [484,252], bb: [300,270],
    seatTop: [248,118], headTop: [436,102], headBot: [447,152],
    kx: 0.003322, ky: 0.002888,
    front3: [[238,118],[258,116],[400,106],[428,100],[440,103],[447,150],[440,158],[400,190],[367,212],[330,250],[318,268],[300,275],[288,265],[283,240],[270,210],[252,180],[244,150]],
    hole: [[262,134],[400,121],[410,124],[413,148],[337,205],[307,238],[298,235],[290,210],[272,180],[262,150]],
    seatstay: [[182,248],[190,243],[258,175],[266,185],[195,255],[186,258]],
    chainstay: [[186,250],[300,262],[305,275],[190,262]],
    fork: [[440,155],[456,152],[488,248],[482,256],[476,252]],
  },
  // Specialized Crux (image/velos/gravel)
  gravel: {
    photo: 'image/velos/gravel/Capture d’écran du 2026-11-27 11-37-04.png', size: [1366,755],
    rear: [293,482], front: [996,482], bb: [583,512],
    seatTop: [497,207], headTop: [862,150], headBot: [895,258],
    kx: 0.001515, ky: 0.001515,
    front3: [[485,208],[505,203],[560,206],[700,183],[845,162],[848,148],[875,147],[888,190],[898,225],[912,258],[870,264],[780,340],[715,400],[665,455],[632,500],[610,525],[575,530],[555,505],[545,450],[533,370],[523,320],[510,270],[490,228]],
    hole: [[515,222],[700,198],[838,177],[842,215],[830,232],[740,345],[660,430],[600,490],[575,470],[565,430],[555,370],[545,320],[530,270],[515,240]],
    seatstay: [[290,474],[300,470],[512,296],[518,306],[305,484],[294,486]],
    chainstay: [[292,478],[560,488],[568,505],[298,495]],
    fork: [[878,262],[912,258],[1004,478],[996,492],[986,486]],
  },
  // Canyon Speedmax (image/velos/clm)
  tt: {
    photo: 'image/velos/clm/Capture d’écran du 2026-11-27 11-46-14.png', size: [1342,906],
    rear: [272,619], front: [1026,619], bb: [575,683],
    seatTop: [478,302], headTop: [915,297], headBot: [925,375],
    kx: 0.001626, ky: 0.001626,
    front3: [[455,305],[500,298],[700,297],[880,296],[935,296],[938,330],[945,370],[900,385],[840,425],[780,475],[720,540],[680,600],[645,650],[610,690],[575,700],[548,690],[517,550],[500,515],[482,485],[470,445],[465,400],[458,350]],
    hole: [[505,320],[800,318],[805,365],[710,470],[632,555],[545,556],[530,470],[515,380],[508,340]],
    seatstay: [[462,420],[480,438],[285,628],[265,612]],
    chainstay: [[270,610],[560,665],[565,695],[275,628]],
    fork: [[905,378],[948,372],[1040,612],[1030,632],[1012,628]],
  },
};
