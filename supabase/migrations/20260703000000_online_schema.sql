-- ─────────────────────────────────────────────────────────────
-- Online multiplayer šema (Faza 2)
-- Server autoritet: pun GameState živi u game_states (SAMO service role);
-- klijenti dobijaju redigovan pogled kroz edge funkcije.
-- ─────────────────────────────────────────────────────────────

-- ─── profiles ───
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Igrač',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- auto-kreiranje profila pri prvom sign-in-u (i anonimnom)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 'Igrač'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── games ───
-- Metapodaci partije. NB: state NIJE ovde — u game_states je (deny-all RLS).
create table public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  status text not null default 'lobby' check (status in ('lobby', 'active', 'finished', 'abandoned')),
  created_by uuid not null references auth.users (id),
  config jsonb not null default '{}'::jsonb,
  phase text,
  hand_no integer not null default 0,
  current_actor smallint check (current_actor between 0 and 2),
  version integer not null default 0,
  summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index games_created_by_idx on public.games (created_by);
create index games_status_updated_idx on public.games (status, updated_at desc);

-- ─── game_players ───
-- Sedišta 0..2; bot => user_id null, čovek => user_id not null.
create table public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  seat smallint not null check (seat between 0 and 2),
  user_id uuid references auth.users (id),
  display_name text not null,
  is_bot boolean not null default false,
  bot_difficulty text check (bot_difficulty in ('easy', 'medium', 'hard')),
  joined_at timestamptz not null default now(),
  unique (game_id, seat),
  constraint bot_xor_user check ((is_bot and user_id is null) or (not is_bot and user_id is not null))
);

create unique index game_players_user_unique on public.game_players (game_id, user_id) where user_id is not null;
create index game_players_user_idx on public.game_players (user_id) where user_id is not null;

-- ─── game_states ───
-- Pun autoritativni GameState (uklj. sve ruke i seed). RLS bez politika = deny all;
-- pristup ISKLJUČIVO kroz edge funkcije (service role) koje rade redakciju.
create table public.game_states (
  game_id uuid primary key references public.games (id) on delete cascade,
  state jsonb not null,
  version integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ─── game_actions ───
-- Append-only log svakog poteza (replay / nastavak / istorija).
-- Sadrži i skrivene informacije (škart), pa je deny-all; čitanje kroz edge funkcije.
create table public.game_actions (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  seq integer not null,
  hand_no integer not null,
  seat smallint check (seat between 0 and 2),
  action jsonb not null,
  created_at timestamptz not null default now(),
  unique (game_id, seq)
);

create index game_actions_game_idx on public.game_actions (game_id, seq);

-- ─── RLS ───
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.game_states enable row level security;
alter table public.game_actions enable row level security;

-- security definer da politika na game_players ne rekurzuje sama u sebe
create or replace function public.is_game_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from game_players gp
    where gp.game_id = gid and gp.user_id = auth.uid()
  );
$$;

create policy "Players can view their games"
  on public.games for select
  using (public.is_game_member(id));

create policy "Players can view co-players"
  on public.game_players for select
  using (public.is_game_member(game_id));

-- game_states / game_actions: NEMA politika (deny all) — samo service role.
-- Sve mutacije (insert/update) idu kroz edge funkcije — nema klijentskih politika.

-- ─── updated_at trigeri ───
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at_column();

create trigger games_updated_at
  before update on public.games
  for each row execute function public.update_updated_at_column();

create trigger game_states_updated_at
  before update on public.game_states
  for each row execute function public.update_updated_at_column();
