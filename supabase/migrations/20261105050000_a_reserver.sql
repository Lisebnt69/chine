-- ═══════════════════════════════════════════════════════════════
-- Onglet « À réserver » : tout ce qu'il reste à réserver, vérifier ou acheter sur place,
-- avec où le faire, le lien, et une case à cocher. Les lignes déjà faites y figurent aussi (cochées).
--
-- À lancer une fois : `supabase db query --remote -f supabase/migrations/20261105050000_a_reserver.sql`
-- ou Supabase → SQL Editor. Relançable sans risque (tout est « if not exists » / « on conflict do nothing »).
--
-- Accès : table FERMÉE à la clé publique (elle contient des numéros de commande, un nom et des téléphones).
-- RLS active, aucune politique, aucun droit pour anon : seule la fonction `assistant` (mode « a_reserver »,
-- protégée par APP_SECRET, clé de service) la lit et l'écrit. À lancer APRÈS avoir déployé la fonction.
--
-- mode : 'resa'     à réserver à l'avance
--        'surplace' à acheter sur place (pastille grise dans le programme)
--        'verifier' billet normalement déjà pris, à confirmer (case à cocher quand c'est vérifié)
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.a_reserver (
  id          uuid primary key default public.uuid_ordonne(),
  created_at  timestamptz not null default now(),
  cle         text unique,                                   -- identifiant stable des lignes de départ
  titre       text not null check (length(btrim(titre)) between 1 and 160),
  jour        date,                                          -- le jour où ça a lieu (pour la pastille du programme)
  avant       date,                                          -- à faire avant ce jour-là
  heure       text,                                          -- « 20h », « 00h30 »…
  mode        text not null default 'resa' check (mode in ('resa', 'surplace', 'verifier')),
  ou          text,                                          -- où réserver
  lien        text,                                          -- https://… ou tel:+86…
  note        text,
  item_id     uuid references public.items(id) on delete set null,   -- la fiche (activité, hôtel, transport) concernée
  fait        boolean not null default false,
  fait_par    text,
  fait_le     timestamptz,
  ordre       int not null default 0
);
create index if not exists a_reserver_jour on public.a_reserver (jour, ordre);
create index if not exists a_reserver_item on public.a_reserver (item_id);

alter table public.a_reserver enable row level security;
drop policy if exists acces_app on public.a_reserver;
revoke all on table public.a_reserver from anon, authenticated;
grant all on table public.a_reserver to service_role;

-- Pas de temps réel (il exige le droit de lecture de la clé publique) : l'app relit par la fonction.
do $$ begin
  alter publication supabase_realtime drop table public.a_reserver;
exception when undefined_object or undefined_table then null;
end $$;

-- ── Lignes de départ ─────────────────────────────────────────────
-- item_id est retrouvé par le nom de la fiche ; une fiche absente donne simplement null.
insert into public.a_reserver (cle, titre, jour, avant, heure, mode, ou, lien, note, item_id, fait, ordre)
select v.cle, v.titre, v.jour::date, v.avant::date, v.heure, v.mode, v.ou, v.lien, v.note,
       (select i.id from public.items i where btrim(i.nom) like v.fiche and (v.typ is null or i.type = v.typ) order by i.created_at limit 1),
       v.fait, v.ordre
from (values
  -- ── À réserver ──
  ('spectacle-furong', 'Spectacle du soir à Furong', '2026-11-16', null, '20h', 'resa',
   'Trip.com ou Klook (ou la billetterie de la vieille ville, sur place)', 'https://www.trip.com/guide/attraction/furong-ancient-town.html',
   'Environ 100 à 110 ¥ selon les guides. L''horaire varie selon les sources (19h30-21h ou vers 21h) : le confirmer à la réservation, le programme met 20h. Vérifier si le billet de la vieille ville est compris.',
   'Spectacle 20h', null, false, 10),
  ('navette-vienna-arrivee', 'Navette gratuite de l''hôtel Vienna : arrivée du 20 à 00h30', '2026-11-20', '2026-11-18', '00h30', 'resa',
   'Appeler ou écrire sur WeChat au chauffeur de l''hôtel (numéro dans le fichier local)', null,
   'Donner le numéro du vol Zhangjiajie → Pudong, le terminal, et demander une confirmation écrite. Rendez-vous T1 3e étage porte 3 ou T2 3e étage porte 29. Plan B : DiDi, 15 min.',
   'Vienna International%', 'hotel', false, 20),
  ('navette-vienna-disney', 'Navette gratuite de l''hôtel Vienna vers Disney, le 20', '2026-11-20', '2026-11-19', '7h20', 'resa',
   'Appeler ou écrire sur WeChat au chauffeur de l''hôtel (numéro dans le fichier local)', null,
   'Départ à 7h20 à confirmer. À réserver avant, en prévenant du nombre de personnes.',
   'Shanghai Disney Resort', null, false, 21),
  ('zjj-porte-17', 'Billet du parc de Zhangjiajie : porte Est et créneau du 17', '2026-11-17', '2026-11-16', '13h30', 'verifier',
   'Trip.com › Mes commandes', 'https://www.trip.com/',
   'Depuis juin 2025 la première entrée se réserve avec une porte et un créneau horaire. Vérifier que le 17 est sur la porte EST, créneau 13h30-14h30. Prendre les passeports (reconnaissance faciale ou empreinte à la porte).',
   'Parc National Zhangjiajie', null, false, 30),
  ('zjj-canyon-7', 'Grand Canyon : choisir les 7 attractions du forfait', '2026-11-18', '2026-11-17', null, 'resa',
   'Trip.com › Mes commandes', 'https://www.trip.com/',
   'Le forfait donne 7 attractions au choix (cinéma volant MR, tyrolienne, toboggan, bateau du lac Rainbow, marche dans le canyon…). Confirmer lesquelles avant d''arriver.',
   'Zhangjiajie Grand Canyon%', null, false, 31),
  ('tianmen-telepherique', 'Tianmen : confirmer que la ligne C du téléphérique fonctionne', '2026-11-19', '2026-11-18', '8h', 'verifier',
   'Téléphoner au standard de Tianmen (numéro dans le fichier local)', null,
   'Les grands téléphériques A et B sont fermés depuis le 13 oct 2026 : seule la ligne C marche. Dernière admission vers 16h.',
   'Tianmen Mountain', null, false, 32),
  ('taxi-19', 'Taxi privé du 19 : Banpoli, Tianmen, 72 Towers, aéroport', '2026-11-19', '2026-11-18', '6h45', 'verifier',
   'Via l''hôtel Banpoli, ou Trip.com (voiture avec chauffeur)', 'https://www.trip.com/',
   'Le programme parle d''un taxi privé réservé pour la journée (valises dans la voiture). Si ce n''est pas fait, c''est la réservation la plus importante du 19. Noter le numéro du chauffeur.',
   null, null, false, 33),
  ('expl-deck-13', 'Exploration Deck : confirmation du billet du 13', '2026-11-13', null, null, 'verifier',
   'Trip.com › Mes commandes', 'https://www.trip.com/',
   'Billet pris, mais la confirmation était encore en cours. Vérifier qu''elle est arrivée.',
   'Exploration Deck%', null, false, 34),
  ('bailong-17', 'Ascenseur Bailong, le 17', '2026-11-17', null, '14h40', 'surplace',
   'Sur place, à la porte Est (WeChat Pay ou Alipay)', null,
   'Environ 72 ¥ par personne, souvent en supplément du billet du parc. Navette du parc ~25 min depuis la porte Est.',
   'Ascenseur Bailong', null, false, 40),
  ('72towers-19', '72 Towers : billet du soir, le 19', '2026-11-19', null, '18h', 'surplace',
   'Sur place ou en ligne (Trip.com, Klook)', 'https://www.eastchinatrip.com/china-attraction-tickets/zhangjiajie/72-wonder-towers-tickets/',
   'Billet du soir (entrée après 16h30) autour de 88 à 90 ¥, à vérifier. Le lien est une page d''information d''un revendeur, pas le site officiel. Partir à 19h55 au plus tard pour l''aéroport.',
   '72 Towers%', null, false, 41),
  -- ── Pas encore au programme (Shanghai) ──
  ('shanghai-pearl', 'Oriental Pearl Tower', null, null, null, 'resa',
   'Trip.com ou Klook (le billet coupe-file évite la file)', 'https://www.trip.com/',
   'Pas encore placée dans un jour. À réserver seulement si vous la programmez.', 'Oriental Pearl Tower', null, false, 60),
  ('shanghai-croisiere', 'Croisière sur le Huangpu (Shanghai)', null, null, null, 'resa',
   'Trip.com ou Klook', 'https://www.trip.com/',
   'Pas encore placée dans un jour. Choisir un départ de nuit pour voir le Bund illuminé.', 'Croisière Shanghai', null, false, 61),
  ('shanghai-dreamy', 'Dreamy Rooms / Starry Sky Museum', null, null, null, 'resa',
   'Trip.com ou Klook, créneau horaire', 'https://www.trip.com/',
   'Pas encore placée dans un jour. Ce genre de lieu se réserve à un créneau précis.', 'Dreamy Rooms%', null, false, 62),
  ('shanghai-flair', 'Flair Restaurant Bar : table avec vue', null, null, null, 'resa',
   'Appeler, ou réserver sur WeChat / Dianping', null,
   'Pas encore placé dans un jour. Une table près des baies vitrées se réserve à l''avance, surtout le week-end.', 'Flair Restaurant Bar', null, false, 63),
  -- ── Transports : marqués « réservé » dans l'app (fait = true) ──
  ('tr-bus-0711', 'Bus Lyon → Paris', '2026-11-07', null, '21h25', 'resa', 'Billet du bus (application du transporteur)', null,
   'Marqué réservé dans l''app. Prix au budget, horaire dans la checklist.', 'Lyon -> Paris', 'transport', true, 80),
  ('tr-vol-0811a', 'Vol Paris → Helsinki', '2026-11-08', null, '6h50', 'resa', 'Billet du vol (compagnie, enregistrement en ligne)', null,
   'Marqué réservé dans l''app. Prix au budget. Enregistrement en ligne à faire la veille.', 'Paris % Helsinki%', 'transport', true, 81),
  ('tr-vol-0811b', 'Vol Helsinki → Shanghai', '2026-11-08', null, '16h40', 'resa', 'Billet du vol (compagnie, enregistrement en ligne)', null,
   'Marqué réservé dans l''app. Arrivée à Shanghai le 9 à 7h40.', 'Helsinki -> Shanghai%', 'transport', true, 82),
  ('tr-vol-1211', 'Vol Shanghai → Chongqing', '2026-11-12', null, '7h50', 'resa', 'Trip.com ou compagnie', null,
   'Marqué réservé dans l''app. Départ de Shanghai Hongqiao (SHA), arrivée à Chongqing Jiangbei (CKG) à 11h.', 'Shanghai % Chongqing', 'transport', true, 83),
  ('tr-train-1511a', 'Train Chongqing → Chengdu', '2026-11-15', null, '6h32', 'resa', 'Trip.com ou 12306', 'https://www.trip.com/trains/',
   'Marqué réservé dans l''app. Gare de Chongqing Ouest, arrivée à Chengdu Est à 7h48.', 'Chongqing % Chengdu', 'transport', true, 84),
  ('tr-train-1511b', 'Train Chengdu → Chongqing', '2026-11-15', null, '21h02', 'resa', 'Trip.com ou 12306', 'https://www.trip.com/trains/',
   'Marqué réservé dans l''app. Retour de Chengdu Est à 21h02, arrivée à 22h17.', 'Chengdu % Chongqing', 'transport', true, 85),
  ('tr-train-1611a', 'Train Chongqing → Zhangjiajie', '2026-11-16', null, '12h55', 'resa', 'Trip.com ou 12306', 'https://www.trip.com/trains/',
   'Marqué réservé dans l''app. Gare de Chongqing Est, arrivée à Zhangjiajie Ouest à 15h27.', 'Chongqing % Zhangjiajie', 'transport', true, 86),
  ('tr-train-1611b', 'Train Zhangjiajie → Furong', '2026-11-16', null, '16h58', 'resa', 'Trip.com ou 12306', 'https://www.trip.com/trains/',
   'Marqué réservé dans l''app. Arrivée à la gare de Furongzhen à 17h21.', 'Zhangjiajie % Furong', 'transport', true, 87),
  ('tr-train-1711', 'Train Furong → Zhangjiajie', '2026-11-17', null, '11h58', 'resa', 'Trip.com ou 12306', 'https://www.trip.com/trains/',
   'Marqué réservé dans l''app. Arrivée à Zhangjiajie Ouest à 12h21.', 'Furong % Zhangjiajie', 'transport', true, 88),
  ('tr-vol-1911', 'Vol Zhangjiajie → Shanghai', '2026-11-19', null, '22h25', 'resa', 'Trip.com ou compagnie', null,
   'Marqué réservé dans l''app. Départ de l''aéroport de Zhangjiajie (DYG), arrivée à Pudong (PVG) à 0h30 le 20.', 'Zhangjiajie % Shanghai', 'transport', true, 89),
  ('tr-vol-2211a', 'Vol Shanghai → Helsinki', '2026-11-22', null, '8h40', 'resa', 'Billet du vol (compagnie, enregistrement en ligne)', null,
   'Marqué réservé dans l''app. Enregistrement tôt. Navette gratuite de l''hôtel Vienna vers l''aéroport.', 'Shanghai -> Helsinki%', 'transport', true, 90),
  ('tr-vol-2211b', 'Vol Helsinki → Paris', '2026-11-22', null, '16h05', 'resa', 'Billet du vol (compagnie)', null,
   'Marqué réservé dans l''app. Arrivée à Paris à 18h15.', 'Helsinki -> Paris%', 'transport', true, 91),
  ('tr-train-2211', 'Train Paris → Lyon', '2026-11-22', null, '20h39', 'resa', 'SNCF Connect', 'https://www.sncf-connect.com/',
   'Marqué réservé dans l''app. Arrivée à Lyon à 22h58.', 'Paris -> Lyon%', 'transport', true, 92),
  -- ── Déjà réservé ──
  ('h-wow', 'Hôtel Wow Executive, Shanghai (3 nuits)', '2026-11-09', null, null, 'resa', 'Trip.com', null, 'Réservation dans Trip.com › Mes commandes.', 'Wow Executive Hotel', 'hotel', true, 100),
  ('h-indition', 'Hôtel Indition, Chongqing (1 nuit)', '2026-11-12', null, null, 'resa', 'Trip.com', null, 'Réservation dans Trip.com › Mes commandes.', 'Chongqing Indition%', 'hotel', true, 101),
  ('h-jiefangbei', 'Hôtel Hongya Cave Houju, Chongqing (3 nuits)', '2026-11-13', null, null, 'resa', 'Trip.com', null, 'Réservation dans Trip.com › Mes commandes.', 'Chongqing Jiefangbei%', 'hotel', true, 102),
  ('h-baihe', 'Hôtel Baihe Wharf Inn, Furong (1 nuit)', '2026-11-16', null, null, 'resa', 'Trip.com', null, 'Réservation dans Trip.com › Mes commandes.', 'Baihe Wharf Inn', 'hotel', true, 103),
  ('h-banpoli', 'Hôtel Banpoli Homestay, Zhangjiajie (2 nuits)', '2026-11-17', null, null, 'resa', 'Trip.com', null, 'Réservation dans Trip.com › Mes commandes.', 'Banpoli Homestay', 'hotel', true, 104),
  ('h-vienna', 'Hôtel Vienna Pudong, Shanghai (3 nuits)', '2026-11-19', null, null, 'resa', 'Trip.com', null, 'Réservation dans Trip.com › Mes commandes.', 'Vienna International%', 'hotel', true, 105),
  ('b-chongqing1949', 'Spectacle « Chongqing 1949 »', '2026-11-12', null, null, 'resa', 'Trip.com', null, 'Visite libre le 12. Billet dans Trip.com › Mes commandes.', 'Spectacle « Chongqing 1949 »', null, true, 110),
  ('b-panda', 'Base des pandas de Chengdu', '2026-11-15', null, 'matin', 'resa', 'Trip.com', null, 'Réservation dans Trip.com › Mes commandes.', 'Chengdu Research Base%', null, true, 111),
  ('b-disney', 'Shanghai Disney Resort', '2026-11-20', null, null, 'resa', 'Trip.com', null, 'Billet 1 jour, 2 adultes. Billet dans Trip.com › Mes commandes.', 'Shanghai Disney Resort', null, true, 112),
  ('b-zjj-combine', 'Billet combiné Zhangjiajie : Tianmen, parc national, Grand Canyon', '2026-11-17', null, null, 'resa', 'Trip.com', null, '2 personnes, valable du 17 au 20. Billet dans Trip.com › Mes commandes.', 'Parc National Zhangjiajie', null, true, 113)
) as v(cle, titre, jour, avant, heure, mode, ou, lien, note, fiche, typ, fait, ordre)
on conflict (cle) do nothing;
