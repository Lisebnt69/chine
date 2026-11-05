-- ═══════════════════════════════════════════════════════════════
-- Conversations de Roomy, rangées comme sur Claude : plusieurs conversations, une par thème.
--
-- Avant : Roomy répondait dans le chat commun (chat_messages), lisible par n'importe qui avec la clé publique.
-- Maintenant : chaque conversation est une ligne de roomy_conversations, ses messages sont dans roomy_messages.
-- Les deux tables sont FERMÉES à la clé publique (RLS active, aucune politique, aucun droit pour anon) :
-- seule la fonction `assistant` (mode « roomy », protégée par APP_SECRET, clé de service) les lit et les écrit.
-- Un visiteur n'a ni le code ni le droit de lecture : il ne peut rien voir des conversations de Matis et Lise.
-- Matis et Lise partagent toutes les conversations (une seule liste pour les deux).
--
-- Relançable sans risque. À lancer APRÈS avoir déployé la fonction `assistant` mise à jour.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.roomy_conversations (
  id          uuid primary key default public.uuid_ordonne(),
  titre       text not null default 'Nouvelle conversation' check (char_length(titre) between 1 and 80),
  titre_auto  boolean not null default true,        -- vrai tant que personne n'a renommé : Roomy peut proposer un titre
  cree_par    text check (cree_par in ('matis', 'lise')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),   -- dernier message : sert à trier la liste
  apercu      text,                                  -- début du dernier message, pour la liste
  run_id      uuid,                                  -- réponse de Roomy en cours (vide = au repos) ; « stop » le vide
  run_debut   timestamptz
);

create table if not exists public.roomy_messages (
  id              uuid primary key default public.uuid_ordonne(),
  conversation_id uuid not null references public.roomy_conversations (id) on delete cascade,
  created_at      timestamptz not null default now(),
  role            text not null check (role in ('user', 'assistant')),
  auteur          text check (auteur in ('matis', 'lise', 'roomy')),
  content         text not null,
  changes         jsonb not null default '[]'::jsonb,  -- ce que Roomy a modifié dans l'app avec ses outils
  statut          text check (statut in ('arrete', 'erreur'))  -- vide = message normal
);

create index if not exists roomy_conversations_maj on public.roomy_conversations (updated_at desc);
create index if not exists roomy_messages_fil on public.roomy_messages (conversation_id, created_at);

alter table public.roomy_conversations enable row level security;
alter table public.roomy_messages enable row level security;

-- Aucune politique pour anon / authenticated : sans politique, la lecture et l'écriture sont refusées.
-- Les droits de table sont retirés aussi, par prudence (les droits par défaut de Supabase les accordent).
drop policy if exists acces_app on public.roomy_conversations;
drop policy if exists acces_app on public.roomy_messages;
revoke all on table public.roomy_conversations from anon, authenticated;
revoke all on table public.roomy_messages from anon, authenticated;
grant all on table public.roomy_conversations to service_role;
grant all on table public.roomy_messages to service_role;

-- Pas de temps réel (il exige le droit de lecture de la clé publique) : l'app relit par la fonction toutes les quelques secondes.
do $$
begin
  alter publication supabase_realtime drop table public.roomy_conversations;
exception when undefined_object or undefined_table then null;
end $$;
do $$
begin
  alter publication supabase_realtime drop table public.roomy_messages;
exception when undefined_object or undefined_table then null;
end $$;
