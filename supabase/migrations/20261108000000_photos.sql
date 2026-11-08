-- ═══════════════════════════════════════════════════════════════
-- Galerie : une ligne = une photo. Les photos envoyées ensemble partagent le même « lot » (= un album).
--
-- À lancer une fois : Supabase → SQL Editor, ou `supabase db push`. Relançable sans risque.
--
-- Même modèle d'accès que le reste de l'app : la clé publique lit et écrit, la différence
-- éditeur / visiteur n'existe que dans l'interface. Une photo « privée » est donc cachée par l'app
-- aux visiteurs, pas protégée par la base. Pour une vraie protection, il faudrait de vrais comptes (auth).
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.photos (
  id         uuid primary key default public.uuid_ordonne(),
  created_at timestamptz not null default now(),
  auteur     text,                          -- matis | lise
  lot        uuid not null,                 -- toutes les photos d'un même envoi
  album      text,                          -- titre de l'album (facultatif)
  prive      boolean not null default false,
  mini       text not null,                 -- vignette ~400 px, data URL : c'est la seule chargée dans la grille
  image      text not null                  -- photo réduite ~1400 px, data URL : chargée à l'ouverture
);

create index if not exists photos_lot_idx on public.photos (lot, created_at);

grant all on table public.photos to anon, authenticated, service_role;
alter table public.photos enable row level security;
drop policy if exists photos_lire on public.photos;
drop policy if exists photos_ajouter on public.photos;
drop policy if exists photos_modifier on public.photos;
drop policy if exists photos_supprimer on public.photos;

create policy photos_lire on public.photos for select using (true);
create policy photos_ajouter on public.photos for insert with check (
  coalesce(auteur, '') in ('matis', 'lise')
  and (album is null or length(album) <= 60)
  and mini  like 'data:image/%' and length(mini)  <= 120000
  and image like 'data:image/%' and length(image) <= 1500000
);
create policy photos_modifier on public.photos for update using (true) with check (true);
create policy photos_supprimer on public.photos for delete using (true);

do $$
begin
  alter publication supabase_realtime add table public.photos;
exception when duplicate_object then null;
end $$;
