#!/usr/bin/env python3
"""Exporte la partie Voyage/Chine du cerveau (SQLite) vers l'app.

    python tools/export_cerveau.py              # écrit cerveau.json, géocode ce qui manque
    python tools/export_cerveau.py --no-geocode # réutilise seulement le cache de géocodage
    python tools/export_cerveau.py --push       # envoie aussi dans la table Supabase `cerveau`

La base du cerveau est ouverte en lecture seule : ce script ne la modifie jamais.

Une ligne de sortie = un POINT du cerveau (un même reel peut en contenir dix), plus quelques
« pistes » : les posts sur nos villes qui n'ont pas encore été segmentés.

cerveau.json est servi publiquement par GitHub Pages : il ne contient donc que les points
(titre, détail, lieu, lien du reel), jamais les transcriptions. Elles partent seulement avec --push.
"""
import argparse
import json
import math
import re
import sqlite3
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
BASES = [
    Path(r"M:\Outils\Cerveau-Reels-Insta-TikTok\data\cerveau.db"),
    RACINE / "Cerveau des enregistrement insta titok" / "data" / "cerveau.db",
]
SORTIE = RACINE / "cerveau.json"
CACHE = RACINE / "tools" / "geocache.json"
AGENT = "chine2026-trip-app/1.0"

# Rubrique du cerveau -> type de l'app. « pratique », « astuce » et « itineraire » ne vont pas sur la carte.
CATEGORIES = {
    "Voyage > Restaurants et street-food": "restaurant",
    "Voyage > Visites et lieux": "activite",
    "Voyage > Bars et cafés": "cafe",
    "Voyage > Shopping": "activite",
    "Voyage > Hébergements": "hotel",
    "Voyage > Transport et pratique": "pratique",
    "Voyage > Budget et astuces": "astuce",
    "Voyage > Itinéraires": "itineraire",
}
A_PLACER = {"restaurant", "activite", "cafe", "hotel"}

# ville -> (lat, lng, demi-largeur de la zone de recherche en degrés)
VILLES = {
    "Shanghai": (31.2304, 121.4737, 0.55),
    "Chongqing": (29.5630, 106.5516, 0.60),
    "Chengdu": (30.5723, 104.0665, 0.50),
    "Karst de Wulong": (29.3568, 107.7560, 0.35),
    "Furong": (28.7621, 109.9561, 0.20),
    "Zhangjiajie": (29.1248, 110.4795, 0.60),
    "Suzhou": (31.2989, 120.5853, 0.40),
    "Hangzhou": (30.2741, 120.1551, 0.40),
    "Xi'an": (34.3416, 108.9398, 0.40),
    "Wuhan": (30.5928, 114.3055, 0.40),
    "Pékin": (39.9042, 116.4074, 0.50),
    "Lijiang": (26.8721, 100.2299, 0.40),
    "Guangzhou": (23.1291, 113.2644, 0.40),
}
ALIAS_VILLE = {"Furongzhen": "Furong"}

HAN = re.compile(r"[\u4e00-\u9fff][\u4e00-\u9fff0-9·]*")
# Mots qui trahissent une description plutôt qu'un nom de lieu : on ne les envoie pas au géocodeur.
PAS_UN_NOM = re.compile(
    r"\b(non donn|non pr[ée]cis|rooftop bar avec|quartier de|les |des |du |une? |pour |avec |sur |dans |"
    r"meilleur|top \d|carte|guide|viral|nom )\b",
    re.I,
)
PISTES_EXCLUES = {"lckofficial"}  # esport : matche « Chengdu » mais n'a rien à voir avec le voyage

# Chaînes aux centaines de boutiques : un pin sur une succursale au hasard ne sert à rien. Sans
# pin, l'app propose la recherche Amap, qui trouve la plus proche. « Pane » : homonyme d'un resto.
PAS_DE_PIN = re.compile(
    r"manner|hey ?tea|喜茶|chagee|霸王茶姬|auntea jenny|沪上阿姨|linlee|林里|yi dian dian|小杨生煎|yang's fried|^pane\b", re.I)

# Une liste de plusieurs lieux n'a pas de position : un pin sur le premier nommé serait trompeur.
EST_UNE_LISTE = re.compile(
    r"^(autres lieux|attractions|incontournables|spots? photo|id[ée]es|lieux [àa] voir|balades|shopping|"
    r"shanghai\s*:|chongqing\s*:|\d+ choses)|\(liste|carte the 79", re.I)

# Mots qui ne distinguent pas une rue d'une autre : « Middle Road » ne prouve rien.
MOTS_VIDES = {"road", "rue", "street", "avenue", "middle", "east", "west", "north", "south", "the"}

# Les titres du cerveau sont en français ou en pinyin, ce qu'OSM reconnaît mal en Chine. Ce tableau
# ne donne que le terme de recherche officiel : la position vient toujours d'OSM.
# (motif sur le titre, terme, précision)
NOMS_OFFICIELS = [
    (r"north bund", "白玉兰广场", "quartier"),  # la tour White Magnolia est au cœur du North Bund
    (r"\b(le bund|skyline du bund)\b", "外滩", "quartier"),
    (r"yu ?garden|yuyuan", "豫园", "quartier"),
    (r"escalator viral|observatoires de lujiazui", "陆家嘴", "quartier"),
    (r"white magnolia", "白玉兰广场", "nom"),
    (r"peninsula", "The Peninsula Shanghai", "nom"),
    (r"the vue bar", "Hyatt on the Bund", "nom"),
    (r"eternal love", "上海千古情", "nom"),
    (r"long time ago", "Long Time Ago", "nom"),
    (r"liziba", "李子坝", "nom"),
    (r"shibati", "十八梯", "nom"),
    (r"eling", "鹅岭公园", "quartier"),
    (r"xiahao ?li", "下浩里", "nom"),
    (r"laojundong", "老君洞", "nom"),
    (r"the ring shopping|nautilus", "光环购物公园", "nom"),
    (r"jiangbeizui", "江北嘴中央公园", "nom"),
    (r"^hongyadong", "洪崖洞", "nom"),  # pas « mieux que Hongyadong », qui parle d'un autre lieu
    (r"jiefangbei", "解放碑", "quartier"),
    (r"jinli", "锦里", "nom"),
    (r"pandas? g[ée]ants?", "成都大熊猫繁育研究基地", "nom"),
    (r"heming", "鹤鸣茶社", "nom"),
    (r"wulong", "天生三桥", "nom"),
    (r"furong ancient town", "芙蓉镇", "nom"),
    (r"golden whip", "金鞭溪", "nom"),
]


def plat(texte):
    """Minuscules sans accents, pour comparer des noms."""
    t = unicodedata.normalize("NFD", texte or "")
    return "".join(c for c in t if not unicodedata.combining(c)).lower()


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def nettoie_nom(texte):
    """« Da Huchun (guide Michelin) » -> « Da Huchun »."""
    t = re.split(r"[(（:：,«»]", texte or "")[0]
    return t.strip(" -–—.")


def extrait_han(texte):
    return [m for m in HAN.findall(texte or "") if len(m) >= 2]


def ouvrir_base(chemin):
    if chemin is None:
        chemin = next((b for b in BASES if b.exists()), None)
    if chemin is None or not Path(chemin).exists():
        sys.exit("Base du cerveau introuvable (essayé : " + ", ".join(map(str, BASES)) + ")")
    # immutable=1 : aucune écriture possible, pas même les fichiers -wal / -shm.
    uri = "file:" + urllib.parse.quote(str(chemin).replace("\\", "/")) + "?mode=ro&immutable=1"
    base = sqlite3.connect(uri, uri=True)
    base.row_factory = sqlite3.Row
    print(f"Base : {chemin}")
    return base


def lire_points(base):
    lignes = base.execute(
        """select p.id, p.titre, p.detail, p.lieu, p.ville, p.adresse, p.prix, p.lien, p.tags, p.confiance,
                  k.chemin, po.url, po.auteur, po.plateforme, po.legende, po.transcription, po.ocr
           from points p
           join categories k on k.id = p.categorie_id
           join posts po on po.id = p.post_id
           where p.pays = 'Chine' and k.chemin like 'Voyage%'
           order by p.id"""
    ).fetchall()
    sortie = []
    for r in lignes:
        categorie = CATEGORIES.get(r["chemin"])
        if categorie is None:
            print(f"  ! rubrique ignorée : {r['chemin']}")
            continue
        ville = ALIAS_VILLE.get(r["ville"], r["ville"])
        if re.search(r"wulong", (r["titre"] or ""), re.I):
            ville = "Karst de Wulong"
        chinois = extrait_han(r["adresse"]) or extrait_han(r["lieu"]) or extrait_han(r["titre"])
        sortie.append({
            "cle": f"pt-{r['id']}",
            "source": r["plateforme"],
            "url": r["url"],
            "auteur": r["auteur"],
            "titre": r["titre"],
            "resume": r["detail"],
            "categorie": categorie,
            "rubrique": r["chemin"].split(" > ")[-1],
            "ville": ville,
            "lieu_nom": r["lieu"],
            "adresse": r["adresse"],
            "adresse_cn": chinois[0] if chinois else None,
            "prix_texte": r["prix"],
            "tags": [t.strip() for t in (r["tags"] or "").split(",") if t.strip()],
            "confiance": r["confiance"],
            "lat": None,
            "lng": None,
            "geo": None,
            "_transcription": "\n\n".join(x for x in (r["legende"], r["transcription"], r["ocr"]) if x),
        })
    return sortie


def lire_pistes(base):
    """Posts sur nos villes pas encore segmentés. On n'a que leur légende : ce sont des pistes."""
    motif = re.compile(r"shanghai|chongqing|chengdu|zhangjiajie|wulong|furong", re.I)
    lignes = base.execute(
        "select shortcode, url, plateforme, auteur, legende, hashtags from posts where segmente_le is null"
    ).fetchall()
    sortie = []
    for r in lignes:
        texte = (r["legende"] or "") + " " + (r["hashtags"] or "")
        trouve = motif.search(texte)
        if not trouve or r["auteur"] in PISTES_EXCLUES:
            continue
        ville = {"shanghai": "Shanghai", "chongqing": "Chongqing", "chengdu": "Chengdu",
                 "zhangjiajie": "Zhangjiajie", "wulong": "Karst de Wulong", "furong": "Furong"}[trouve.group(0).lower()]
        legende = (r["legende"] or "").strip()
        sortie.append({
            "cle": f"post-{r['shortcode']}",
            "source": r["plateforme"],
            "url": r["url"],
            "auteur": r["auteur"],
            "titre": legende.split("\n")[0][:90] or "Post à relire",
            "resume": legende[:600],
            "categorie": "piste",
            "rubrique": "Piste à vérifier",
            "ville": ville,
            "lieu_nom": None,
            "adresse": None,
            "adresse_cn": None,
            "prix_texte": None,
            "tags": [],
            "confiance": "basse",
            "lat": None,
            "lng": None,
            "geo": None,
            "_transcription": legende,
        })
    return sortie


def requetes(p):
    """Requêtes à tenter, de la plus fiable à la plus large : (texte, précision, nom attendu)."""
    if "non donn" in plat(p["titre"]) or "non precis" in plat(p["titre"]):
        return []
    if PAS_DE_PIN.search(p["titre"] or "") or EST_UNE_LISTE.search(p["titre"] or ""):
        return []
    sortie = []
    for motif, terme, precision in NOMS_OFFICIELS:
        if re.search(motif, p["titre"] or "", re.I):
            # En chinois, pas de nom attendu : OSM répond souvent en anglais, et le terme est précis.
            sortie.append((terme, precision, None if HAN.search(terme) else terme))
    for h in extrait_han(p["adresse"]):
        if re.search(r"[路街巷弄道][0-9]*号?$", h):  # « 海门路店 » est un nom de boutique, pas une adresse
            sortie.append((h, "adresse", None))
    for h in extrait_han(p["titre"]) + extrait_han(p["lieu_nom"]):
        sortie.append((h, "nom", h))
    adresse = nettoie_nom(p["adresse"])
    if re.search(r"\b(road|rd|street|st|lu|avenue|ave)\b", adresse, re.I) and not re.search(r"m[ée]tro|station|sortie", adresse, re.I):
        rue = re.sub(r"\b(no|road|rd|street|st|lu|avenue|ave)\b|\d+", " ", plat(adresse))
        sortie.append((adresse, "adresse", rue))
    titre = nettoie_nom(p["titre"])
    if titre and len(titre.split()) <= 5 and not PAS_UN_NOM.search(titre + " "):
        sortie.append((titre, "nom", titre))
    lieu = nettoie_nom(p["lieu_nom"])
    # « Nanjing Road » fait 5 km, entre l'Est et l'Ouest : un pin dessus ne dit rien de la boutique.
    if lieu and lieu != titre and plat(lieu) != "nanjing road" and len(lieu.split()) <= 5 and not PAS_UN_NOM.search(lieu + " "):
        # Souvent une rue ou un quartier : le pin sera bon à quelques centaines de mètres, pas à la porte.
        sortie.append((lieu, "quartier", lieu))
    vus, uniques = set(), []
    for q in sortie:
        if q[0] not in vus:
            vus.add(q[0])
            uniques.append(q)
    return uniques


class Geocodeur:
    def __init__(self, reseau=True):
        self.reseau = reseau
        self.cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
        self.appels = 0
        self.dernier = 0.0

    def sauver(self):
        CACHE.write_text(json.dumps(self.cache, ensure_ascii=False, indent=0, sort_keys=True), encoding="utf-8")

    def chercher(self, requete, ville):
        cle = f"{ville}|{requete}"
        if cle in self.cache:
            return self.cache[cle]
        if not self.reseau:
            return None
        lat, lng, d = VILLES[ville]
        params = urllib.parse.urlencode({
            "q": requete, "format": "jsonv2", "limit": 1, "countrycodes": "cn", "bounded": 1,
            "viewbox": f"{lng - d},{lat + d},{lng + d},{lat - d}", "accept-language": "fr,en,zh",
        })
        attente = 1.1 - (time.time() - self.dernier)  # règle OSM : 1 requête par seconde maximum
        if attente > 0:
            time.sleep(attente)
        requete_http = urllib.request.Request(
            "https://nominatim.openstreetmap.org/search?" + params, headers={"User-Agent": AGENT})
        for essai in range(3):
            try:
                self.dernier = time.time()
                with urllib.request.urlopen(requete_http, timeout=25) as reponse:
                    donnees = json.load(reponse)
                break
            except (urllib.error.URLError, TimeoutError) as e:
                if essai == 2:
                    print(f"  ! réseau ({e}) sur « {requete} » : ignoré pour ce lancement")
                    return None
                time.sleep(5 * (essai + 1))
        self.appels += 1
        resultat = None
        if donnees:
            r = donnees[0]
            resultat = {"lat": float(r["lat"]), "lng": float(r["lon"]), "nom": r.get("name") or "",
                        "complet": r.get("display_name", ""), "classe": r.get("category", ""),
                        "rang": r.get("place_rank", 0)}
        self.cache[cle] = resultat
        if self.appels % 25 == 0:
            self.sauver()
        return resultat


def valide(resultat, ville, attendu):
    """Refuse les pins qui ne valent rien : ville entière, hors zone, ou nom qui ne correspond pas."""
    if not resultat or resultat["rang"] < 18:
        return False
    lat, lng, d = VILLES[ville]
    if km((lat, lng), (resultat["lat"], resultat["lng"])) > d * 111 * 1.5:
        return False
    if attendu:
        if HAN.search(attendu):
            return attendu in resultat["complet"]
        # Mots entiers, et seulement le nom et la rue : sur l'adresse complète, « Shang » ou
        # « Huang » trouvaient toujours quelque chose dans « Shanghai » ou « Huangdu ».
        debut = set(re.findall(r"[a-z0-9]+", plat(" ".join(resultat["complet"].split(",")[:3]))))
        tous = re.findall(r"[a-z0-9]+", plat(attendu))
        if any(m.isdigit() and m not in debut for m in tous):  # « Théâtre 1949 » n'est pas un autre théâtre
            return False
        mots = [m for m in tous if len(m) > 2 and m not in MOTS_VIDES]
        return bool(mots) and sum(m in debut for m in mots) / len(mots) >= 0.6
    return True


def geocoder(points, reseau, revue=None):
    g = Geocodeur(reseau)
    a_faire = [p for p in points if p["categorie"] in A_PLACER and p["ville"] in VILLES]
    journal = []
    for i, p in enumerate(a_faire, 1):
        for texte, precision, attendu in requetes(p):
            r = g.chercher(texte, p["ville"])
            if not valide(r, p["ville"], attendu):
                continue
            if precision != "quartier" and (r["classe"] == "highway" or (precision == "adresse" and r["rang"] < 30)):
                precision = "rue"
            p["lat"], p["lng"], p["geo"] = round(r["lat"], 6), round(r["lng"], 6), precision
            journal.append(f"{precision:9} {p['ville'][:10]:10} {p['titre'][:48]:48} <- {texte[:24]:24} => {r['complet'][:70]}")
            break
        if i % 40 == 0:
            print(f"  {i}/{len(a_faire)} ({sum(1 for x in a_faire if x['lat'])} placés)", flush=True)
    g.sauver()
    if revue:
        Path(revue).write_text("\n".join(journal), encoding="utf-8")
    place = sum(1 for p in a_faire if p["lat"])
    print(f"Carte : {place}/{len(a_faire)} lieux placés ({g.appels} requêtes OSM ce lancement)")
    return a_faire


def public(p):
    return {k: v for k, v in p.items() if not k.startswith("_") and v not in (None, "", [])}


def pousser(points):
    """Envoie dans Supabase. N'écrase pas item_id : la colonne n'est pas dans le lot."""
    html = (RACINE / "index.html").read_text(encoding="utf-8")
    url = re.search(r"SB_URL='([^']+)'", html).group(1)
    cle = re.search(r"SB_KEY='([^']+)'", html).group(1)
    for debut in range(0, len(points), 100):
        lot = [{**{k: v for k, v in p.items() if not k.startswith("_")}, "transcription": p["_transcription"]}
               for p in points[debut:debut + 100]]
        requete = urllib.request.Request(
            f"{url}/rest/v1/cerveau?on_conflict=cle",
            data=json.dumps(lot, ensure_ascii=False).encode("utf-8"), method="POST",
            headers={"apikey": cle, "Authorization": f"Bearer {cle}", "Content-Type": "application/json",
                     "Prefer": "resolution=merge-duplicates,return=minimal", "User-Agent": AGENT})
        urllib.request.urlopen(requete, timeout=60).read()
        print(f"  envoyés : {min(debut + 100, len(points))}/{len(points)}")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", type=Path, help="chemin de cerveau.db (sinon M: puis la copie du repo)")
    parser.add_argument("--no-geocode", action="store_true", help="n'interroge pas OSM, utilise le cache")
    parser.add_argument("--push", action="store_true", help="envoie aussi dans Supabase (avec les transcriptions)")
    parser.add_argument("--revue", help="écrit la liste des pins dans ce fichier, pour relecture")
    args = parser.parse_args()

    base = ouvrir_base(args.db)
    points = lire_points(base) + lire_pistes(base)
    print(f"{len(points)} entrées, dont {sum(p['categorie'] == 'piste' for p in points)} pistes")
    geocoder(points, reseau=not args.no_geocode, revue=args.revue)
    SORTIE.write_text(json.dumps([public(p) for p in points], ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"Écrit : {SORTIE} ({SORTIE.stat().st_size // 1024} Ko)")
    if args.push:
        pousser(points)


if __name__ == "__main__":
    main()
