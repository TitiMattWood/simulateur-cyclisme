"""Calcule un parcours vélo avec BRouter (données OpenStreetMap) et l'enregistre en .gpx.

Les points de passage tombent souvent au centre d'une commune, hors de la route
principale : BRouter fait alors un aller-retour en cul-de-sac pour l'atteindre.
Ce script détecte ces allers-retours (le tracé repasse sur ses propres points, à moins
de 3 m, en sens inverse et moins de 2,5 km plus loin) et les supprime. La tolérance
de 3 m évite de couper les virages en épingle, dont les deux branches sont distinctes.

Usage :
  python3 scripts/make-route.py <fichier.gpx> "<nom>" "lon,lat|lon,lat|..." [profil]
Profil BRouter par défaut : fastbike (vélo de route, routes revêtues).
"""
import math
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

KY = 111132.0


def fetch(lonlats: str, profile: str) -> str:
    q = urllib.parse.urlencode({
        "lonlats": lonlats, "profile": profile, "alternativeidx": 0, "format": "gpx",
    })
    text = ""
    for attempt in range(6):
        try:
            with urllib.request.urlopen(f"https://brouter.de/brouter?{q}", timeout=120) as r:
                text = r.read().decode("utf-8")
        except urllib.error.HTTPError as e:  # 403/429 : limitation de débit du serveur public
            if e.code not in (403, 429, 503):
                raise
            text = ""
        if "<trkpt" in text:
            return text
        time.sleep(5 * (attempt + 1))  # serveur public saturé : « Please, retry later! »
    return text


def parse(gpx: str):
    pts = []
    for m in re.finditer(r'<trkpt lon="([-\d.]+)" lat="([-\d.]+)">(?:<ele>([-\d.]+)</ele>)?', gpx):
        pts.append((float(m.group(1)), float(m.group(2)), float(m.group(3) or "nan")))
    if not pts:
        raise SystemExit("aucun point dans la réponse BRouter : " + gpx[:200])
    return pts


def remove_spurs(pts, max_len=2500.0, tol=3.0):
    """Supprime les allers-retours courts ; renvoie (points, longueurs supprimées en m).

    1. On cherche un point de demi-tour : le point d'avant et le point d'après sont
       confondus (BRouter repasse par les mêmes nœuds OpenStreetMap).
    2. On remonte l'aller-retour tant que l'aller et le retour restent confondus,
       jusqu'au carrefour où il a commencé.
    3. On ne le supprime que s'il fait moins de max_len au total : un aller-retour
       plus long est voulu (par exemple aller à Longvic et revenir par la même route).
    """
    kx = 111320.0 * math.cos(math.radians(pts[0][1]))
    xy = lambda p: (p[0] * kx, p[1] * KY)
    close = lambda a, b: math.dist(xy(a), xy(b)) < tol
    removed = []
    out = list(pts)
    i = 1
    while i < len(out) - 1:
        if not close(out[i - 1], out[i + 1]):
            i += 1
            continue
        a, b = i - 1, i + 1
        while a > 0 and b < len(out) - 1 and close(out[a - 1], out[b + 1]):
            a -= 1
            b += 1
        length = sum(math.dist(xy(out[k]), xy(out[k + 1])) for k in range(a, b))
        if length <= max_len:
            removed.append(round(length))
            out = out[: a + 1] + out[b + 1:]
            i = max(1, a)
        else:
            i = b
    return out, removed


def length_and_ascent(pts):
    kx = 111320.0 * math.cos(math.radians(pts[0][1]))
    d = up = 0.0
    for a, b in zip(pts, pts[1:]):
        d += math.dist((a[0] * kx, a[1] * KY), (b[0] * kx, b[1] * KY))
        if not math.isnan(a[2]) and not math.isnan(b[2]) and b[2] > a[2]:
            up += b[2] - a[2]
    return d, up


def write(path: str, name: str, pts):
    esc = name.replace("&", "&amp;").replace("<", "&lt;")
    body = "\n".join(
        f'<trkpt lat="{la:.6f}" lon="{lo:.6f}">' + ("" if math.isnan(e) else f"<ele>{e:.1f}</ele>") + "</trkpt>"
        for lo, la, e in pts
    )
    with open(path, "w", encoding="utf-8") as f:
        f.write(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<gpx version="1.1" creator="BRouter (OpenStreetMap) + make-route.py" xmlns="http://www.topografix.com/GPX/1/1">\n'
            f"<metadata><name>{esc}</name></metadata>\n<trk><name>{esc}</name><trkseg>\n{body}\n</trkseg></trk></gpx>\n"
        )


def main():
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    path, name, lonlats = sys.argv[1:4]
    profile = sys.argv[4] if len(sys.argv) > 4 else "fastbike"
    pts = parse(fetch(lonlats, profile))
    before, _ = length_and_ascent(pts)
    pts, removed = remove_spurs(pts)
    d, up = length_and_ascent(pts)
    write(path, name, pts)
    print(f"{path} : {d / 1000:.1f} km (avant nettoyage {before / 1000:.1f} km), "
          f"D+ ≈ {up:.0f} m, allers-retours supprimés : {removed}")


main()
