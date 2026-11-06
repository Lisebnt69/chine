-- ═══════════════════════════════════════════════════════════════
-- Notifications push, réservées à Matis et Lise.
--
-- Trois tables FERMÉES à la clé publique (RLS active, aucune politique, aucun droit pour anon) : seule la fonction `push`
-- (clé de service) les lit et les écrit. Un visiteur ne peut donc ni s'abonner, ni lire un abonnement.
--   push_abonnements : un téléphone abonné = une ligne (user_key = matis ou lise)
--   push_envoyes     : rappels déjà envoyés, pour ne jamais les envoyer deux fois
--   push_config      : l'adresse de la fonction et son code (voir la fin du fichier)
--
-- Deux déclencheurs, tous deux en base (rien ne dépend d'un téléphone ouvert) :
--   • chaque message du chat de Matis ou Lise → notif à l'autre
--   • pg_cron, deux fois par jour → rappels des transports (la veille à 19 h, le jour même à 7 h, heure de Chine)
--
-- Relançable sans risque. À lancer APRÈS avoir déployé la fonction `push`, puis remplir push_config (dernière étape).
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pg_net with schema extensions;

create table if not exists public.push_abonnements (
  id         uuid primary key default public.uuid_ordonne(),
  created_at timestamptz not null default now(),
  user_key   text not null check (user_key in ('matis', 'lise')),
  endpoint   text not null unique,       -- l'adresse du téléphone chez Apple / Google : sert d'identifiant
  p256dh     text not null,
  auth       text not null,
  appareil   text                        -- début du user-agent, pour s'y retrouver
);
create index if not exists push_abonnements_user on public.push_abonnements (user_key);

create table if not exists public.push_envoyes (
  cle        text primary key,           -- ex. « veille:<id du transport>:2026-11-09 »
  created_at timestamptz not null default now()
);

create table if not exists public.push_config (
  cle    text primary key,               -- 'url' (adresse de la fonction push) et 'secret' (PUSH_HOOK_SECRET)
  valeur text not null
);

alter table public.push_abonnements enable row level security;
alter table public.push_envoyes enable row level security;
alter table public.push_config enable row level security;

do $$
declare t text;
begin
  foreach t in array array['push_abonnements', 'push_envoyes', 'push_config'] loop
    execute format('drop policy if exists acces_app on public.%I', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

-- ── Appel de la fonction depuis la base ─────────────────────────
-- security definer : lit push_config, que la clé publique ne peut pas lire. Ne bloque jamais l'écriture qui l'a déclenchée.
create or replace function public.push_appeler(corps jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_url text; v_secret text;
begin
  select valeur into v_url from public.push_config where cle = 'url';
  select valeur into v_secret from public.push_config where cle = 'secret';
  if v_url is null or v_secret is null then return; end if;   -- pas encore configuré : on ne fait rien
  perform net.http_post(
    url     := v_url,
    body    := corps,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret)
  );
exception when others then
  raise warning 'push_appeler : %', sqlerrm;
end $$;
revoke all on function public.push_appeler(jsonb) from public, anon, authenticated;

-- ── Chat : un message de Matis ou Lise prévient l'autre ─────────
create or replace function public.push_sur_message() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.author in ('matis', 'lise') then
    -- 300 caractères suffisent : un message image fait des centaines de Ko, la fonction n'a besoin que du début
    perform public.push_appeler(jsonb_build_object(
      'mode', 'chat', 'author', new.author, 'content', left(coalesce(new.content, ''), 300)));
  end if;
  return new;
exception when others then
  return new;   -- une notif ratée ne doit jamais empêcher un message de partir
end $$;

drop trigger if exists push_chat on public.chat_messages;
create trigger push_chat after insert on public.chat_messages
  for each row execute function public.push_sur_message();

-- ── Rappels de transport (heure de Chine = UTC+8) ───────────────
-- Veille à 19 h = 11 h UTC. Jour même à 7 h = 23 h UTC la veille. Hors voyage la fonction ne trouve rien et ne fait rien.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname in ('push-rappels-veille', 'push-rappels-jour');
  perform cron.schedule('push-rappels-veille', '0 11 * * *',
    $c$ select public.push_appeler('{"mode":"rappels","moment":"veille"}'::jsonb) $c$);
  perform cron.schedule('push-rappels-jour', '0 23 * * *',
    $c$ select public.push_appeler('{"mode":"rappels","moment":"jour"}'::jsonb) $c$);
exception when others then
  raise notice 'pg_cron indisponible (%). Active-le dans Supabase → Database → Extensions, puis relance ce fichier.', sqlerrm;
end $$;

-- ═══════════════════════════════════════════════════════════════
-- DERNIÈRE ÉTAPE, À FAIRE UNE FOIS À LA MAIN (SQL Editor), avec TES valeurs. Ne pas les écrire dans ce fichier :
--
--   insert into public.push_config (cle, valeur) values
--     ('url',    'https://<ref>.supabase.co/functions/v1/push'),
--     ('secret', '<le même code que le secret PUSH_HOOK_SECRET de la fonction>')
--   on conflict (cle) do update set valeur = excluded.valeur;
-- ═══════════════════════════════════════════════════════════════
