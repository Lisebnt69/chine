-- ═══════════════════════════════════════════════════════════════
-- Schéma complet de l'app Chine 2026 + cerveau + assistant IA.
--
-- À lancer une fois : Supabase → SQL Editor, ou `supabase db push`.
-- Fonctionne sur un projet neuf comme sur un projet restauré : tout est
-- « if not exists », les données existantes ne sont jamais touchées, et le
-- script peut être relancé sans risque.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists unaccent with schema extensions;

-- Les UUID sont préfixés par l'heure : l'app trie par id (.order('id')), donc
-- budget, notes et checklist gardent leur ordre d'ajout.
create or replace function public.uuid_ordonne() returns uuid
language sql volatile as $$
  select (lpad(to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint), 12, '0')
          || substr(replace(gen_random_uuid()::text, '-', ''), 13))::uuid
$$;

-- ── Tables de l'app ──────────────────────────────────────────────
create table if not exists public.items (
  id          uuid primary key default public.uuid_ordonne(),
  created_at  timestamptz not null default now(),
  type        text not null,            -- activite | restaurant | cafe | hotel | transport
  nom         text,
  ville       text,
  quartier    text,                     -- transport : heure de départ
  description text,                     -- transport : heure d'arrivée
  adresse     text,                     -- hôtel : date de check-in ; transport : date de départ
  adresse_cn  text,
  prix        numeric default 0,
  prix_type   text,                     -- hôtel : nb de nuits ; transport : mode ; lieu : moment
  notes       text,
  matis       integer default 0,
  lise        integer default 0,
  fait        boolean default false,
  statut      text default 'idee',
  priorite    text,
  duree       text,
  lat         double precision,
  lng         double precision,
  "mapUrl"    text,
  cerveau_id  uuid
);

create table if not exists public.planning (
  id          uuid primary key default public.uuid_ordonne(),
  date_voyage date not null unique,
  jour_label  text,
  ordre       integer,
  matin_lieu  text, matin_h text,
  aprem_lieu  text, aprem_h text,
  soir_lieu   text, soir_h  text,
  notes       text,
  hotel_id    uuid references public.items(id) on delete set null
);

create table if not exists public.planning_slots (
  id          uuid primary key default public.uuid_ordonne(),
  planning_id uuid not null references public.planning(id) on delete cascade,
  item_id     uuid not null references public.items(id) on delete cascade,
  periode     text default '',
  ordre       integer default 0,
  heure       text
);

create table if not exists public.budget (
  id          uuid primary key default public.uuid_ordonne(),
  created_at  timestamptz not null default now(),
  categorie   text,
  description text,
  total       numeric default 0,
  source      text,
  personne    text default 'les deux',
  item_id     uuid references public.items(id) on delete set null
);

create table if not exists public.checklist (
  id        uuid primary key default public.uuid_ordonne(),
  label     text,
  categorie text,
  done      boolean default false
);

create table if not exists public.notes (
  id    uuid primary key default public.uuid_ordonne(),
  titre text,
  corps text
);

create table if not exists public.chat_messages (
  id         uuid primary key default public.uuid_ordonne(),
  created_at timestamptz not null default now(),
  author     text,
  content    text
);

create table if not exists public.user_pins (
  user_key   text primary key,
  pin        text not null,
  updated_at timestamptz default now()
);

-- Projet restauré : ces colonnes-là sont les seules qui manquaient.
alter table public.planning_slots add column if not exists heure text;
alter table public.items add column if not exists cerveau_id uuid;

-- ── Le cerveau : une ligne = un point (un reel peut en contenir dix) ──
create table if not exists public.cerveau (
  id              uuid primary key default public.uuid_ordonne(),
  created_at      timestamptz not null default now(),
  cle             text not null unique,  -- 'pt-51' = point 51 du cerveau ; évite les doublons à l'import
  source          text,                  -- instagram | tiktok
  url             text,                  -- lien du post : c'est la source à citer
  auteur          text,
  titre           text,
  resume          text,                  -- le détail du point
  transcription   text,                  -- légende + transcription + OCR du post
  categorie       text,                  -- activite | restaurant | cafe | hotel | pratique | astuce | itineraire | piste
  rubrique        text,                  -- ex : Shopping
  ville           text,
  lieu_nom        text,
  adresse         text,
  adresse_cn      text,
  lat             double precision,
  lng             double precision,
  geo             text,                  -- précision du pin : adresse | nom | rue | quartier
  prix_estime     numeric,
  prix_texte      text,                  -- le prix tel que dit dans le reel
  duree           text,
  meilleur_moment text,
  tags            text[] default '{}',
  confiance       text,                  -- haute | moyenne | basse
  item_id         text                   -- l'item créé dans l'app à partir de ce point
);
create index if not exists cerveau_ville_idx on public.cerveau (ville);

-- Ce que le point dit de lui-même, sans la transcription : celle-ci appartient au
-- post entier et serait partagée par tous ses points.
create or replace function public.cerveau_texte(c public.cerveau) returns text
language sql stable as $$
  select extensions.unaccent(concat_ws(' ', c.titre, c.lieu_nom, c.ville, c.resume, c.rubrique,
    c.categorie, c.adresse, array_to_string(c.tags, ' ')))
$$;

-- Vrai si chaque mot de q apparaît dans le texte, en début de mot : « pot » ne doit
-- pas trouver « spot », ni « hot » trouver « photo ». Le chinois n'a pas d'espaces,
-- on y cherche donc une simple sous-chaîne.
create or replace function public.mots_presents(texte text, q text) returns boolean
language sql stable as $$
  select not exists (
    select 1 from unnest(regexp_split_to_array(trim(coalesce(q, '')), '\s+')) as mot
    where mot <> '' and not (
      case when mot ~ '[一-鿿]' then position(mot in texte) > 0
           else texte ~* ('\m' || regexp_replace(extensions.unaccent(mot), '([^[:alnum:]])', '\\\1', 'g'))
      end)
  )
$$;

-- Les points qui parlent eux-mêmes du sujet passent avant ceux qui ne le mentionnent
-- que dans la transcription de leur post.
create or replace function public.chercher_cerveau(q text default '', v text default null, lim int default 15)
returns setof public.cerveau
language sql stable as $$
  select c.* from public.cerveau c
  where (v is null or v = '' or c.ville ilike v)
    and public.mots_presents(public.cerveau_texte(c) || ' ' || extensions.unaccent(coalesce(c.transcription, '')), q)
  order by case when public.mots_presents(public.cerveau_texte(c), q) then 0 else 1 end,
           case c.confiance when 'haute' then 0 when 'moyenne' then 1 else 2 end,
           c.cle
  limit greatest(1, least(lim, 50))
$$;

-- ── Accès ────────────────────────────────────────────────────────
-- Même modèle que l'app d'origine : pas de comptes Supabase, la clé publique
-- donne accès à tout. Suffisant pour deux personnes, pas pour une app ouverte.
grant usage on schema public to anon, authenticated, service_role;
do $$
declare t text;
begin
  foreach t in array array['items','planning','planning_slots','budget','checklist','notes',
                           'chat_messages','user_pins','cerveau'] loop
    execute format('grant all on table public.%I to anon, authenticated, service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists acces_app on public.%I', t);
    execute format('create policy acces_app on public.%I for all using (true) with check (true)', t);
  end loop;
end $$;
grant execute on function public.chercher_cerveau(text, text, int) to anon, authenticated, service_role;

-- ── Temps réel : sans ça, les deux téléphones ne se synchronisent pas ──
do $$
declare t text;
begin
  foreach t in array array['items','planning','planning_slots','budget','checklist','notes',
                           'chat_messages','cerveau'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ── Données de départ (seulement si les tables sont vides) ───────
insert into public.planning (date_voyage, jour_label, ordre)
select d::date,
       (array['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'])[extract(dow from d)::int + 1],
       row_number() over (order by d) - 1
from generate_series('2026-11-09'::date, '2026-11-22'::date, interval '1 day') as d
where not exists (select 1 from public.planning);

-- Les mots de passe d'origine de index.html. Sans ces lignes, personne ne peut se connecter.
insert into public.user_pins (user_key, pin) values ('matis', 'matis2026'), ('lise', 'lise2026')
on conflict (user_key) do nothing;
