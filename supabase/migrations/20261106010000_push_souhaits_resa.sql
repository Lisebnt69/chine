-- ═══════════════════════════════════════════════════════════════
-- Notifications push, suite : nouveaux souhaits et réservations faites.
-- (Les rappels « à réserver avant tel jour » et « hôtel aujourd'hui » n'ont pas besoin de SQL : ce sont les mêmes tâches
-- pg_cron que les transports, la fonction `push` fait le tri.)
--
-- À lancer APRÈS 20261106000000_push.sql (elle crée push_appeler). Relançable sans risque.
--   • nouveau ticket dans Souhaits (visiteur, Matis ou Lise) → notif à Matis et Lise (sauf l'auteur)
--   • une ligne de « À réserver » cochée → notif à l'autre (« Lise a réservé … »)
-- Les déclencheurs ne bloquent jamais l'écriture : si l'appel échoue, le ticket ou la case passe quand même.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.push_sur_souhait() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.push_appeler(jsonb_build_object(
    'mode', 'souhait', 'auteur', coalesce(new.auteur, 'visiteur'),
    'personne', left(coalesce(new.personne, ''), 40), 'envie', left(coalesce(new.envie, ''), 200)));
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists push_souhait on public.souhaits;
create trigger push_souhait after insert on public.souhaits
  for each row execute function public.push_sur_souhait();

create or replace function public.push_sur_resa() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.fait and not coalesce(old.fait, false) then
    perform public.push_appeler(jsonb_build_object(
      'mode', 'resa_faite', 'par', coalesce(new.fait_par, ''), 'titre', left(coalesce(new.titre, ''), 120)));
  end if;
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists push_resa on public.a_reserver;
create trigger push_resa after update of fait on public.a_reserver
  for each row execute function public.push_sur_resa();
