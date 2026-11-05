#!/usr/bin/env python3
"""Met à jour meteo.json avec les prévisions Open-Meteo des 6 lieux du voyage.

Lancé 3 fois par jour par .github/workflows/meteo.yml, jusqu'au 22 novembre 2026.
Bibliothèque standard seulement. Si un lieu échoue, on garde sa dernière
prévision connue plutôt que d'écraser le fichier avec du vide.
"""
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

SORTIE = Path(__file__).resolve().parent.parent / "meteo.json"
CHINE = timezone(timedelta(hours=8))

# Mêmes noms que METEO_DATA dans index.html.
LIEUX = {
    "Shanghai": (31.2304, 121.4737),
    "Chongqing": (29.5630, 106.5516),
    "Chengdu": (30.5728, 104.0668),
    "Karst de Wulong": (29.3240, 107.7600),
    "Furong": (28.9500, 109.9400),
    "Zhangjiajie": (29.3300, 110.4300),
}


SEUIL_PLUIE_MM = 0.2   # en dessous, on considère l'heure comme sèche


def fenetres_de_pluie(heures):
    """heures : liste de (heure 0-23, mm). Renvoie les créneaux [début, fin[ où il pleut.

    Deux averses séparées d'une seule heure sèche forment un seul créneau.
    """
    mouillees = [h for h, mm in heures if mm >= SEUIL_PLUIE_MM]
    creneaux = []
    for h in mouillees:
        if creneaux and h - creneaux[-1][1] <= 1:
            creneaux[-1][1] = h + 1
        else:
            creneaux.append([h, h + 1])
    return creneaux


def prevision(lat, lon):
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        "hourly": "precipitation,snowfall",
        "timezone": "Asia/Shanghai",
        "forecast_days": 16,
    }
    url = "https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=30) as r:
        rep = json.load(r)
    d, hr = rep["daily"], rep["hourly"]

    par_jour = {}
    for t, mm, neige in zip(hr["time"], hr["precipitation"], hr["snowfall"]):
        jour, heure = t.split("T")
        par_jour.setdefault(jour, []).append((int(heure[:2]), mm or 0.0, neige or 0.0))

    jours = []
    for i, jour in enumerate(d["time"]):
        if d["temperature_2m_max"][i] is None or d["temperature_2m_min"][i] is None:
            continue
        heures = par_jour.get(jour, [])
        creneaux = fenetres_de_pluie([(h, mm) for h, mm, _ in heures])
        jours.append({
            "d": jour,
            "min": round(d["temperature_2m_min"][i]),
            "max": round(d["temperature_2m_max"][i]),
            "code": d["weather_code"][i],
            "pluie": d["precipitation_probability_max"][i],       # % de risque, maximum de la journée
            "mm": round(sum(mm for _, mm, _ in heures), 1),        # cumul de la journée
            "f": creneaux,                                          # créneaux de pluie [début, fin[ en heures
            "h": sum(fin - debut for debut, fin in creneaux),      # durée de pluie prévue, en heures
            "neige": round(sum(n for _, _, n in heures), 1),       # cm de neige
        })
    if not jours:
        raise ValueError("aucun jour dans la réponse")
    return jours


def main():
    ancien = {}
    if SORTIE.exists():
        try:
            ancien = json.loads(SORTIE.read_text(encoding="utf-8")).get("lieux", {})
        except ValueError:
            pass

    lieux, echecs = {}, []
    for nom, (lat, lon) in LIEUX.items():
        try:
            lieux[nom] = prevision(lat, lon)
        except Exception as e:  # noqa: BLE001
            echecs.append(f"{nom}: {e}")
            if nom in ancien:
                lieux[nom] = ancien[nom]

    if not lieux:
        print("Aucune prévision récupérée :\n" + "\n".join(echecs), file=sys.stderr)
        return 1
    if echecs:
        print("Lieux gardés sur l'ancienne prévision :\n" + "\n".join(echecs), file=sys.stderr)

    maj = datetime.now(CHINE).strftime("%Y-%m-%dT%H:%M:%S+08:00")
    SORTIE.write_text(
        json.dumps({"maj": maj, "source": "open-meteo.com", "lieux": lieux},
                   ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"meteo.json mis à jour ({len(lieux)} lieux, {maj})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
