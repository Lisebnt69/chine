-- ═══════════════════════════════════════════════════════════════
-- Souhaits : la table est fermée à la clé publique, sauf l'AJOUT.
--
-- Avant : la clé publique (anon) lisait, modifiait et supprimait tous les tickets, la différence
-- Matis / Lise / visiteur n'existait que dans l'interface.
-- Maintenant : un visiteur peut seulement ajouter un ticket. Lire, modifier, cocher et supprimer passent par
-- la fonction `assistant` (mode « souhaits », protégée par APP_SECRET, clé de service qui ignore ces règles).
--
-- À lancer APRÈS 20261105030000_souhaits_cadeau.sql, et APRÈS avoir déployé la fonction `assistant` mise à jour
-- et l'app : sinon l'ancienne app ne peut plus lire la liste. Relançable sans risque.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists souhaits_lire on public.souhaits;
drop policy if exists souhaits_modifier on public.souhaits;
drop policy if exists souhaits_supprimer on public.souhaits;
drop policy if exists acces_app on public.souhaits;

revoke all on table public.souhaits from anon, authenticated;
grant insert on table public.souhaits to anon;                 -- le visiteur envoie un ticket, rien d'autre
grant all on table public.souhaits to service_role;

-- La politique d'ajout (bornée, un ticket neuf n'est jamais « trouvé ») reste celle de 20261105030000.

-- Plus de temps réel pour la clé publique (il exige le droit de lecture) : l'app relit la liste à l'ouverture de l'onglet.
do $$
begin
  alter publication supabase_realtime drop table public.souhaits;
exception when undefined_object then null;
end $$;
