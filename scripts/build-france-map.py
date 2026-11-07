"""Génère src/data/france-map.json : contours simplifiés des départements de
France métropolitaine (source : IGN ADMIN EXPRESS COG CARTO PE, Licence Ouverte).

Usage : python3 scripts/build-france-map.py <departements.geojson>
Le GeoJSON se télécharge depuis le WFS de la Géoplateforme IGN
(couche ADMINEXPRESS-COG-CARTO-PE.LATEST:departement, SRSNAME=EPSG:4326).
"""
import json, math, sys

LAT0 = 46.5                      # latitude de référence de la projection
KX = math.cos(math.radians(LAT0))
W = 1000.0                       # largeur du viewBox SVG
TOL = 2.0                        # tolérance de simplification (unités SVG)

def proj(lon, lat, b):
    x = (lon * KX - b[0]) * b[4]
    y = (b[3] - lat) * b[4]
    return x, y

def dp(pts, tol):
    """Simplification de Douglas-Peucker."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        n = math.hypot(dx, dy)
        best, idx = 0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            # anneau fermé (extrémités confondues) : distance au point
            d = (abs(dy * px - dx * py + bx * ay - by * ax) / n) if n > 1e-9 \
                else math.hypot(px - ax, py - ay)
            if d > best:
                best, idx = d, i
        if best > tol and idx > 0:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]

def main(path):
    data = json.load(open(path, encoding="utf-8"))
    feats = [f for f in data["features"] if len(f["properties"]["code_insee"]) == 2]
    lons, lats = [], []
    for f in feats:
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            for lon, lat, *_ in poly[0]:
                lons.append(lon * KX); lats.append(lat)
    minx, maxx, miny, maxy = min(lons), max(lons), min(lats), max(lats)
    scale = W / (maxx - minx)
    b = (minx, 0, 0, maxy, scale)
    height = (maxy - miny) * scale
    out = []
    for f in feats:
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        d = []
        for poly in polys:
            ring = [proj(p[0], p[1], b) for p in poly[0]]
            ring = dp(ring, TOL)
            if len(ring) < 4:
                continue
            d.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in ring) + "Z")
        out.append({"code": f["properties"]["code_insee"],
                    "nom": f["properties"]["nom_officiel"], "d": "".join(d)})
    out.sort(key=lambda o: o["code"])
    res = {"width": W, "height": round(height, 1), "lat0": LAT0,
           "minx": minx, "maxy": maxy, "scale": scale, "departements": out}
    json.dump(res, open("src/data/france-map.json", "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    print(len(out), "départements, hauteur", round(height))

main(sys.argv[1])
