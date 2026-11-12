-- Galerie : les visiteurs peuvent « liker » une photo (un cœur par appareil et par photo).
-- Pas de compte pour un visiteur : on le reconnaît par un identifiant aléatoire gardé sur son appareil (client_id).
-- Même modèle d'accès que le reste de la galerie (clé publique). Relançable sans risque.

create table if not exists public.photo_likes (
  photo_id   uuid not null references public.photos(id) on delete cascade,
  client_id  text not null check (length(client_id) between 8 and 64),
  created_at timestamptz not null default now(),
  primary key (photo_id, client_id)
);

grant all on table public.photo_likes to anon, authenticated, service_role;
alter table public.photo_likes enable row level security;
drop policy if exists photo_likes_lire on public.photo_likes;
drop policy if exists photo_likes_ajouter on public.photo_likes;
drop policy if exists photo_likes_retirer on public.photo_likes;
create policy photo_likes_lire    on public.photo_likes for select using (true);
create policy photo_likes_ajouter on public.photo_likes for insert with check (true);
create policy photo_likes_retirer on public.photo_likes for delete using (true);
