-- ═══════════════════════════════════════════════════════════════
-- Onglet « Souhaits » : une ligne = un ticket « telle personne veut telle chose ».
--
-- À lancer une fois : Supabase → SQL Editor, ou `supabase db push`.
-- Relançable sans risque (tout est « if not exists »).
--
-- Même modèle d'accès que le reste de l'app : la clé publique lit et écrit.
-- C'est voulu ici : le mode visiteur doit pouvoir ajouter un ticket.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.souhaits (
  id          uuid primary key default public.uuid_ordonne(),
  created_at  timestamptz not null default now(),
  personne    text not null check (length(btrim(personne)) > 0),   -- qui le veut
  envie       text not null check (length(btrim(envie)) > 0),      -- ce qu'elle veut
  image       text,                                                -- facultatif : photo réduite, en data URL
  auteur      text,                                                -- matis | lise | visiteur
  trouve      boolean not null default false                       -- coché par Matis ou Lise une fois rapporté
);

grant all on table public.souhaits to anon, authenticated, service_role;
alter table public.souhaits enable row level security;
drop policy if exists acces_app on public.souhaits;
drop policy if exists souhaits_lire on public.souhaits;
drop policy if exists souhaits_ajouter on public.souhaits;
drop policy if exists souhaits_modifier on public.souhaits;
drop policy if exists souhaits_supprimer on public.souhaits;

-- Lecture et ajout ouverts (le visiteur n'a pas de compte). L'ajout est borné : un ticket neuf n'est
-- jamais « trouvé », les textes ont une taille maximale et l'image doit être une petite image data URL.
create policy souhaits_lire on public.souhaits for select using (true);
create policy souhaits_ajouter on public.souhaits for insert with check (
  trouve = false
  and length(personne) <= 40 and length(envie) <= 300
  and coalesce(auteur, 'visiteur') in ('matis', 'lise', 'visiteur')
  and (image is null or (image like 'data:image/%' and length(image) <= 450000))
);
-- Modifier et supprimer : l'app n'a pas de comptes Supabase, Matis, Lise et les visiteurs sont tous « anon ».
-- Ces deux droits restent donc ouverts, comme sur toutes les autres tables ; la distinction éditeur / visiteur
-- n'existe que dans l'interface. Pour la rendre réelle, il faudrait de vrais comptes (auth) pour Matis et Lise.
create policy souhaits_modifier on public.souhaits for update using (true) with check (true);
create policy souhaits_supprimer on public.souhaits for delete using (true);

do $$
begin
  alter publication supabase_realtime add table public.souhaits;
exception when duplicate_object then null;
end $$;
