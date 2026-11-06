-- ═══════════════════════════════════════════════════════════════
-- Notifications push, suite : rappels à l'heure près (escale d'Helsinki, résas avec une heure comme un spectacle).
-- Un contrôle chaque minute : la fonction `push` (mode « echeances ») calcule les moments clés et n'envoie que ceux qui
-- viennent d'arriver, une seule fois chacun. Hors voyage elle ne trouve rien et ne fait rien.
--
-- À lancer APRÈS 20261106000000_push.sql (elle crée push_appeler et active pg_cron). Relançable sans risque.
-- ═══════════════════════════════════════════════════════════════
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'push-echeances';
  perform cron.schedule('push-echeances', '* * * * *',
    $c$ select public.push_appeler('{"mode":"echeances"}'::jsonb) $c$);
exception when others then
  raise notice 'pg_cron indisponible (%). Active-le dans Supabase → Database → Extensions, puis relance ce fichier.', sqlerrm;
end $$;
