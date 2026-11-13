-- Galerie : empreinte du fichier d'origine (nom|taille|date) pour ne pas renvoyer une photo déjà dans la galerie.
-- Relançable sans risque. Les photos déjà en base n'ont pas d'empreinte (null) : elles ne sont pas détectées.
alter table public.photos add column if not exists source text;
create index if not exists photos_source_idx on public.photos (source) where source is not null;
