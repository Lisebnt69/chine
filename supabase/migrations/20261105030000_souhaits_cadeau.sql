-- ═══════════════════════════════════════════════════════════════
-- Souhaits, suite : photo du cadeau trouvé, qui a coché, et modification d'un ticket.
--
-- À lancer une fois : Supabase → SQL Editor, ou `supabase db push`. Relançable sans risque.
-- ═══════════════════════════════════════════════════════════════

alter table public.souhaits add column if not exists image_cadeau text;        -- photo du cadeau trouvé (data URL réduite)
alter table public.souhaits add column if not exists trouve_par   text;        -- matis | lise | roomy
alter table public.souhaits add column if not exists trouve_le    timestamptz; -- quand le ticket a été coché

-- L'ajout reste ouvert aux visiteurs, mais un ticket neuf ne peut rien porter de la partie « trouvé ».
drop policy if exists souhaits_ajouter on public.souhaits;
create policy souhaits_ajouter on public.souhaits for insert with check (
  trouve = false
  and image_cadeau is null and trouve_par is null and trouve_le is null
  and length(personne) <= 40 and length(envie) <= 300
  and coalesce(auteur, 'visiteur') = 'visiteur'                 -- Matis et Lise ajoutent par la fonction, jamais en direct
  and (image is null or (image ~ '^data:image/(jpeg|png|webp);base64,' and length(image) <= 450000))
);

-- Modifier : mêmes bornes qu'à l'ajout (la distinction Matis / Lise / visiteur n'existe que dans l'interface,
-- faute de comptes Supabase : voir la note de 20261105010000_souhaits.sql).
drop policy if exists souhaits_modifier on public.souhaits;
create policy souhaits_modifier on public.souhaits for update using (true) with check (
  length(btrim(personne)) > 0 and length(personne) <= 40
  and length(btrim(envie)) > 0 and length(envie) <= 300
  and (image is null or (image like 'data:image/%' and length(image) <= 450000))
  and (image_cadeau is null or (image_cadeau like 'data:image/%' and length(image_cadeau) <= 450000))
  and (trouve_par is null or trouve_par in ('matis', 'lise', 'roomy'))
);
