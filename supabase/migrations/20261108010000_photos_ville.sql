-- Galerie : un album est rangé dans une ville (facultatif). Relançable sans risque.
alter table public.photos add column if not exists ville text;
