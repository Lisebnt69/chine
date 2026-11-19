-- Galerie : les albums acceptent aussi des vidéos. Relançable sans risque.
-- Une vidéo = une ligne de `photos` avec type = 'video' : `image` pointe vers le fichier vidéo,
-- `mini` vers une vignette JPEG (première image de la vidéo).
-- Limite : 50 Mo par fichier (plafond global du plan gratuit Supabase).

alter table public.photos add column if not exists type text not null default 'photo';
alter table public.photos drop constraint if exists photos_type_check;
alter table public.photos add constraint photos_type_check check (type in ('photo', 'video'));

update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg', 'video/mp4', 'video/quicktime', 'video/webm']
where id = 'photos';
