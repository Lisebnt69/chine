-- ═══════════════════════════════════════════════════════════════
-- Récap du soir : chaque jour à 21 h (heure de Chine) la fonction `push` envoie à Matis et Lise
-- « Aujourd'hui : X dépensés, 3/4 lieux faits. Demain : … ». Elle ne fait rien hors du voyage en Chine (9 → 21 nov.)
-- et jamais deux fois le même jour.
--
-- À lancer APRÈS 20261106000000_push.sql (elle crée push_appeler et active pg_cron). Relançable sans risque.
-- 21 h en Chine (UTC+8) = 13 h UTC.
-- ═══════════════════════════════════════════════════════════════
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'push-recap';
  perform cron.schedule('push-recap', '0 13 * * *',
    $c$ select public.push_appeler('{"mode":"recap"}'::jsonb) $c$);
exception when others then
  raise notice 'pg_cron indisponible (%). Active-le dans Supabase → Database → Extensions, puis relance ce fichier.', sqlerrm;
end $$;
