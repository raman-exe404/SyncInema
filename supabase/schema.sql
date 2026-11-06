-- ═══════════════════════════════════════════════════════════════════════════
-- SyncCinema — Supabase PostgreSQL schema (production)
--
-- The sandbox build ships with an identical Prisma/SQLite schema
-- (mini-services/synccinema-server/prisma/schema.prisma). Apply this file in
-- the Supabase SQL editor when moving to production, then set
-- SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY on the backend service.
--
-- Security model (spec §12, §17):
--   • Row Level Security everywhere; participants only see their rooms.
--   • The realtime backend uses the service-role key server-side ONLY.
--   • Movie files are never stored, uploaded, or logged — this schema holds
--     room metadata, membership and chat text exclusively.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 32),
  avatar_url   text,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by authenticated users"
  on public.profiles for select
  using (auth.role() = 'authenticated');

create policy "users update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ── rooms ───────────────────────────────────────────────────────────────────
create table if not exists public.rooms (
  id         uuid primary key default gen_random_uuid(),
  room_code  char(6) unique not null,
  host_id    uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'WAITING'
             check (status in ('WAITING', 'ACTIVE', 'ENDED', 'EXPIRED')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint room_code_format check (room_code ~ '^[A-Z0-9]{6}$')
);

create index if not exists rooms_status_expires_idx on public.rooms (status, expires_at);

alter table public.rooms enable row level security;

-- ── room_participants ───────────────────────────────────────────────────────
create table if not exists public.room_participants (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 32),
  is_ready     boolean not null default false,
  movie_name   text,
  movie_hash   char(64),          -- SHA-256 fingerprint; no file data, ever
  movie_size   bigint,
  movie_mime   text,
  movie_dur_ms integer,
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint max_two_participants unique (room_id, user_id)
);

-- Hard cap of two participants per room (spec §5, §17).
create or replace function public.enforce_two_participants()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.room_participants where room_id = new.room_id) > 2 then
    raise exception 'room is limited to two participants';
  end if;
  return new;
end $$;

create trigger participants_cap
  before insert on public.room_participants
  for each row execute function public.enforce_two_participants();

create index if not exists participants_room_idx on public.room_participants (room_id);

alter table public.room_participants enable row level security;

-- ── messages ────────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  room_id          uuid not null references public.rooms (id) on delete cascade,
  sender_id        uuid references auth.users (id) on delete set null,
  message_text     text not null check (char_length(message_text) between 1 and 500),
  message_type     text not null default 'TEXT' check (message_type in ('TEXT', 'REACTION', 'SYSTEM')),
  movie_position_ms integer,
  created_at       timestamptz not null default now()
);

create index if not exists messages_room_created_idx on public.messages (room_id, created_at desc);

alter table public.messages enable row level security;

-- ── RLS helper: room membership ─────────────────────────────────────────────
create or replace function public.is_room_participant(p_room uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.room_participants
    where room_id = p_room and user_id = auth.uid()
  );
$$;

-- Only participants can read their rooms' membership and messages (spec §9).
create policy "participants read own room"
  on public.rooms for select
  using (public.is_room_participant(id) or host_id = auth.uid());

create policy "participants read membership"
  on public.room_participants for select
  using (public.is_room_participant(room_id));

create policy "participants join open rooms"
  on public.room_participants for insert
  with check (
    auth.uid() = user_id
    and (select count(*) from public.room_participants where room_id = room_id) < 2
    and (select status from public.rooms where id = room_id) <> 'EXPIRED'
  );

create policy "participants update own row"
  on public.room_participants for update
  using (auth.uid() = user_id);

create policy "participants read room messages"
  on public.messages for select
  using (public.is_room_participant(room_id));

-- Only authorised participants can insert messages (spec §12).
create policy "participants insert messages"
  on public.messages for insert
  with check (auth.uid() = sender_id and public.is_room_participant(room_id));

-- NOTE: realtime playback state is intentionally NOT persisted here — it
-- lives in backend memory (spec §12: "Keep active playback state in backend
-- memory initially").
