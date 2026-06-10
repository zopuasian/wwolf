create table if not exists public.multiplayer_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_client_id text not null,
  player_count integer not null check (player_count between 5 and 12),
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'ended')),
  seats jsonb not null default '[]'::jsonb,
  state jsonb not null default '{}'::jsonb,
  action_seq bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists multiplayer_rooms_code_idx on public.multiplayer_rooms (code);
create index if not exists multiplayer_rooms_updated_at_idx on public.multiplayer_rooms (updated_at desc);

create or replace function public.set_multiplayer_rooms_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists multiplayer_rooms_updated_at on public.multiplayer_rooms;
create trigger multiplayer_rooms_updated_at
before update on public.multiplayer_rooms
for each row execute function public.set_multiplayer_rooms_updated_at();

alter table public.multiplayer_rooms enable row level security;

-- No public table policies on purpose.
-- Room reads and writes go through Next.js API routes so hidden roles are sanitized per player.
