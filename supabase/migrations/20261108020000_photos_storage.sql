-- Galerie : les fichiers vont dans Supabase Storage (bucket « photos »), la table ne garde que les adresses.
-- Pourquoi : avec ~600 photos, les stocker en base (data URL) pèserait ~150 Mo et chaque ouverture
-- de la galerie téléchargerait des dizaines de Mo. Relançable sans risque.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 3000000, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 3000000, allowed_mime_types = array['image/jpeg'];

drop policy if exists photos_storage_lire on storage.objects;
drop policy if exists photos_storage_ajouter on storage.objects;
drop policy if exists photos_storage_supprimer on storage.objects;
create policy photos_storage_lire on storage.objects for select using (bucket_id = 'photos');
create policy photos_storage_ajouter on storage.objects for insert with check (bucket_id = 'photos');
create policy photos_storage_supprimer on storage.objects for delete using (bucket_id = 'photos');

-- La table accepte maintenant des adresses https (et plus de gros data URL).
drop policy if exists photos_ajouter on public.photos;
create policy photos_ajouter on public.photos for insert with check (
  coalesce(auteur, '') in ('matis', 'lise')
  and (album is null or length(album) <= 60)
  and mini like 'https://%' and length(mini) <= 500
  and image like 'https://%' and length(image) <= 500
);
