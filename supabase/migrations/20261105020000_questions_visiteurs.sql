-- ═══════════════════════════════════════════════════════════════
-- Onglet « Questions » : les visiteurs posent des questions à Roomy, Matis et Lise les relisent.
--
-- Une ligne = une question + la réponse de Roomy. Les lignes sont rangées par discussion
-- (discussion_id) : un visiteur garde la même discussion, en rouvre une ancienne ou en lance une nouvelle.
--
-- À lancer une fois : Supabase → SQL Editor, ou `supabase db push`.
-- Relançable sans risque (tout est « if not exists »).
--
-- Accès : TABLE FERMÉE à la clé publique. Contrairement aux autres tables de l'app, celle-ci contient ce
-- que des visiteurs (public non fiable) ont écrit : ils ne doivent ni la lire, ni la modifier, ni la vider.
-- Tout passe par la fonction `assistant` (clé service) :
--   • un visiteur y écrit sa question, après les limites anti-abus (mode "visiteur", sans code) ;
--   • Matis et Lise lisent, marquent « lu » et suppriment avec le code APP_SECRET (mode "questions").
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.questions_visiteurs (
  id             uuid primary key default public.uuid_ordonne(),
  created_at     timestamptz not null default now(),
  discussion_id  uuid not null,                                        -- la discussion à laquelle appartient la question
  client_id      text not null,                                        -- identifiant aléatoire de l'appareil du visiteur
  ip_hash        text,                                                 -- empreinte de l'IP (jamais l'IP), pour la limite anti-abus
  pseudo         text,                                                 -- prénom donné par le visiteur, facultatif
  question       text not null check (length(btrim(question)) between 1 and 500),
  reponse        text,                                                 -- réponse de Roomy (null tant qu'elle réfléchit, ou si elle a échoué)
  filtree        boolean not null default false,                       -- vrai : la réponse parlait d'argent, elle a été remplacée
  erreur         text,                                                 -- message d'erreur si Roomy n'a pas pu répondre
  lu             boolean not null default false                        -- passé à vrai quand Matis ou Lise ouvre la discussion
);

create index if not exists questions_visiteurs_discussion on public.questions_visiteurs (discussion_id, created_at);
create index if not exists questions_visiteurs_recent     on public.questions_visiteurs (created_at desc);
create index if not exists questions_visiteurs_client     on public.questions_visiteurs (client_id, created_at);
create index if not exists questions_visiteurs_ip         on public.questions_visiteurs (ip_hash, created_at);

-- RLS activée et AUCUNE politique : la clé publique (anon) et les comptes connectés n'ont aucun accès.
-- Seul service_role (la fonction) passe.
alter table public.questions_visiteurs enable row level security;
revoke all on table public.questions_visiteurs from anon, authenticated;
grant all on table public.questions_visiteurs to service_role;

drop policy if exists lecture on public.questions_visiteurs;
drop policy if exists maj on public.questions_visiteurs;
drop policy if exists suppression on public.questions_visiteurs;
