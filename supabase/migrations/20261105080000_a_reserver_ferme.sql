-- ═══════════════════════════════════════════════════════════════
-- Ferme la table « À réserver » à la clé publique. URGENT : une ancienne version de la table, ouverte à la
-- clé publique, existe déjà en production et contient des numéros de commande, un nom et des téléphones.
--
-- Après cette migration : RLS active, aucune politique, aucun droit pour anon / authenticated, hors temps réel.
-- Seule la fonction `assistant` (mode « a_reserver », APP_SECRET, clé de service) lit et écrit la table.
-- L'app publiée n'utilise pas encore cette table : la fermer ne casse rien. Relançable sans risque.
--
-- Vérifier ensuite : un `select` avec la clé publique sur /rest/v1/a_reserver doit être refusé (401/403/permission denied).
-- ═══════════════════════════════════════════════════════════════

alter table public.a_reserver enable row level security;
drop policy if exists acces_app on public.a_reserver;
revoke all on table public.a_reserver from anon, authenticated;
grant all on table public.a_reserver to service_role;

do $$ begin
  alter publication supabase_realtime drop table public.a_reserver;
exception when undefined_object or undefined_table then null;
end $$;
