#!/usr/bin/env python3
"""Récupère les liens envoyés depuis l'app (onglet Cerveau > Importer, ou @ia) et les passe au cerveau.

    python tools/recuperer_liens.py            # liste seulement ce qui attend (lecture seule)
    python tools/recuperer_liens.py --file     # met les liens en file dans le cerveau (rien n'est récolté)
    python tools/recuperer_liens.py --traiter  # les met en file, les récolte (Instagram : Firefox fermé et
                                               # connecté), puis les retire de l'app

Pourquoi ce détour : l'app ne peut ni télécharger ni transcrire une vidéo (Instagram demande une session
connectée, la transcription tourne sur ce PC). Un lien collé dans l'app attend donc dans la table `cerveau`,
ligne `cle = 'lien:<url>'`, catégorie « piste ». Ce script les lit, appelle `cerveau.cmd ajouter`, puis supprime
la ligne d'attente : les vrais points arrivent ensuite avec `python tools/export_cerveau.py --push`, une fois
les fiches segmentées (preparer_lot, importer_points : voir le CLAUDE.md du cerveau).

--traiter ne récolte que ces liens (cerveau.cmd ajouter --traiter ne touche à aucun autre post de la file) et ne
doit être lancé que sur demande explicite de Matis. Les lignes d'attente ne sont supprimées que si la récolte
s'est terminée sans interruption ; un lien en échec est signalé par le rapport du cerveau et reste dans sa base.
"""
import argparse
import ipaddress
import json
import os
import re
import socket
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
CERVEAUX = [
    Path(r"M:\Outils\Cerveau-Reels-Insta-TikTok"),
    RACINE / "Cerveau des enregistrement insta titok",
]
PREFIXE = "lien:"
AGENT = "chine2026-trip-app/1.0"


def acces():
    html = (RACINE / "index.html").read_text(encoding="utf-8")
    return (re.search(r"SB_URL='([^']+)'", html).group(1), re.search(r"SB_KEY='([^']+)'", html).group(1))


def requete(methode, chemin, corps=None):
    url, cle = acces()
    r = urllib.request.Request(
        f"{url}/rest/v1/{chemin}", method=methode, data=None if corps is None else json.dumps(corps).encode(),
        headers={"apikey": cle, "Authorization": f"Bearer {cle}", "Content-Type": "application/json",
                 "Prefer": "return=representation", "User-Agent": AGENT})
    with urllib.request.urlopen(r, timeout=30) as rep:
        texte = rep.read().decode("utf-8")
    return json.loads(texte) if texte else []


def en_attente():
    filtre = urllib.parse.quote(f"like.{PREFIXE}*", safe="")
    return requete("GET", f"cerveau?cle={filtre}&select=cle,url,source,created_at&order=created_at")


def retirer(cle):
    requete("DELETE", f"cerveau?cle=eq.{urllib.parse.quote(cle, safe='')}")


def refus_lien(u):
    """None si le lien peut être confié au cerveau, sinon la raison du refus.

    La table `cerveau` est ouverte en écriture à la clé publique de l'app : n'importe qui peut y déposer une ligne
    `lien:…`. On ne fait donc pas confiance à son contenu. Un lien qui commence par « - » serait pris pour une option,
    et le cerveau lit les pages web depuis ce PC : une adresse locale ou privée (box, routeur, localhost) est refusée.
    """
    if not isinstance(u, str) or u != u.strip() or u.startswith("-") or any(c.isspace() or ord(c) < 32 for c in u):
        return "lien mal formé"
    p = urllib.parse.urlparse(u)
    if p.scheme not in ("http", "https") or not p.hostname:
        return "pas un lien http(s)"
    hote = p.hostname.lower()
    if hote == "localhost" or hote.endswith((".local", ".localhost", ".internal", ".lan")):
        return "adresse locale"
    try:
        adresses = {ipaddress.ip_address(hote)}
    except ValueError:
        try:
            adresses = {ipaddress.ip_address(i[4][0]) for i in socket.getaddrinfo(hote, None)}
        except (socket.gaierror, ValueError):
            return "nom de domaine introuvable"
    if any(a.is_private or a.is_loopback or a.is_link_local or a.is_reserved or a.is_multicast or a.is_unspecified
           for a in adresses):
        return "adresse locale ou privée"
    return None


def dossier_cerveau():
    for d in CERVEAUX:
        if (d / "env" / "venv" / "Scripts" / "python.exe").exists() and (d / "data" / "cerveau.db").exists():
            return d
    sys.exit("Cerveau introuvable (M:\\Outils\\Cerveau-Reels-Insta-TikTok ni la copie du repo).")


def ajouter(liens, traiter):
    """Lance `cerveau ajouter`, sans passer par cmd.exe : un lien peut contenir & ou %."""
    d = dossier_cerveau()
    env = {**os.environ, "PYTHONPATH": str(d / "src"), "PYTHONUTF8": "1"}
    cmd = [str(d / "env" / "venv" / "Scripts" / "python.exe"), "-m", "cerveau", "ajouter"]
    if traiter:
        cmd.append("--traiter")
    cmd += ["--", *liens]   # « -- » : plus aucune option après, même si un lien commençait par « - »
    return subprocess.run(cmd, cwd=d, env=env).returncode


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--file", action="store_true", help="met les liens en file dans le cerveau, sans récolter")
    parser.add_argument("--traiter", action="store_true", help="met en file, récolte, puis retire de l'app")
    args = parser.parse_args()

    toutes = [x for x in en_attente() if x.get("url")]
    lignes = []
    for x in toutes:
        raison = refus_lien(x["url"]) or (None if x["cle"] == PREFIXE + x["url"] else "cle et url différentes")
        if raison:
            print(f"  IGNORÉ ({raison}) : {x['url'][:120]!r}. La ligne reste dans l'app, à supprimer à la main.")
        else:
            lignes.append(x)
    if not lignes:
        print("Aucun lien valide en attente dans l'app.")
        return 0
    print(f"{len(lignes)} lien(s) en attente dans l'app :")
    for x in lignes:
        print(f"  [{x.get('source') or '?'}] {x['url']}")
    if not (args.file or args.traiter):
        print("\nRien n'a été fait. --file pour les mettre en file, --traiter pour les récolter.")
        return 0

    code = ajouter([x["url"] for x in lignes], args.traiter)
    if args.traiter and code == 0:
        for x in lignes:
            retirer(x["cle"])
        print(f"\n{len(lignes)} ligne(s) d'attente retirées de l'app. Reste à ranger les fiches (preparer_lot, "
              "importer_points), puis : python tools/export_cerveau.py --push")
    elif args.traiter:
        print(f"\nLa récolte s'est arrêtée (code {code}) : les lignes d'attente restent dans l'app.")
    return code


if __name__ == "__main__":
    sys.exit(main())
