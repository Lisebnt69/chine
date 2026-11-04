-- ═══════════════════════════════════════════════════════════════
-- Cerveau (reels Insta/TikTok transcrits) + assistant IA
-- À exécuter une fois dans Supabase → SQL Editor.
-- Idempotent : peut être relancé sans casse.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;
create extension if not exists unaccent;

-- 1) Le cerveau : un enregistrement = un reel (ou un lieu extrait d'un reel)
create table if not exists public.cerveau (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  source          text,             -- 'instagram' | 'tiktok' | 'autre'
  url             text,             -- lien du reel
  auteur          text,             -- @compte qui a posté
  titre           text,             -- titre court (ex: "Hot pot caché à Chongqing")
  transcription   text,             -- transcription brute de la vidéo
  resume          text,             -- résumé en 1-3 phrases
  categorie       text,             -- 'activite' | 'restaurant' | 'cafe' | 'hotel' | 'astuce' | 'transport'
  ville           text,             -- Shanghai, Chongqing, Chengdu, ...
  lieu_nom        text,             -- nom du lieu
  adresse         text,
  adresse_cn      text,             -- adresse en chinois (bien meilleure pour géocoder / Amap)
  lat             double precision,
  lng             double precision,
  prix_estime     numeric,          -- en € par personne
  duree           text,             -- '30min' | '1h' | '2h+'
  meilleur_moment text,             -- 'Matin' | 'Après-midi' | 'Soir' | 'Journée'
  tags            text[] default '{}',
  item_id         text              -- id de l'item créé dans l'app à partir de ce reel (si ajouté)
);

-- Dédoublonnage par URL de reel
create unique index if not exists cerveau_url_key on public.cerveau (url) where url is not null;
create index if not exists cerveau_ville_idx on public.cerveau (ville);

-- Recherche plein texte (français, sans accents)
create or replace function public.cerveau_fts_doc(c public.cerveau) returns tsvector
language sql stable as $$
  select to_tsvector('simple', unaccent(coalesce(c.titre,'') || ' ' || coalesce(c.lieu_nom,'') || ' ' ||
    coalesce(c.ville,'') || ' ' || coalesce(c.resume,'') || ' ' || coalesce(c.transcription,'') || ' ' ||
    coalesce(array_to_string(c.tags,' '),'') || ' ' || coalesce(c.categorie,'')))
$$;

create or replace function public.chercher_cerveau(q text default '', v text default null, lim int default 15)
returns setof public.cerveau
language sql stable as $$
  select c.* from public.cerveau c
  where (v is null or v = '' or c.ville ilike v)
    and (
      q is null or q = ''
      or public.cerveau_fts_doc(c) @@ websearch_to_tsquery('simple', unaccent(q))
      or unaccent(coalesce(c.titre,'') || ' ' || coalesce(c.lieu_nom,'') || ' ' || coalesce(c.resume,'')) ilike '%' || unaccent(q) || '%'
    )
  order by c.created_at desc
  limit greatest(1, least(lim, 50))
$$;

-- 2) Heure précise sur les créneaux du planning (ex: '14:30')
alter table public.planning_slots add column if not exists heure text;

-- 3) Lien item ← reel du cerveau
alter table public.items add column if not exists cerveau_id uuid;

-- 4) Accès : même modèle que le reste de l'app (clé publique, pas d'auth Supabase).
--    ⚠️ Ça veut dire que quiconque a la clé publique peut lire/écrire. C'est déjà le cas
--    pour items/planning/budget. À durcir si l'app devient publique.
alter table public.cerveau enable row level security;
drop policy if exists cerveau_all on public.cerveau;
create policy cerveau_all on public.cerveau for all using (true) with check (true);

-- 5) Temps réel (l'app se met à jour quand l'IA écrit)
do $$ begin
  alter publication supabase_realtime add table public.cerveau;
exception when duplicate_object then null; end $$;
