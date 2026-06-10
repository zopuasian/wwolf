# Wolfcha Online Multiplayer

The root route `/` now runs the online human-vs-human multiplayer client.

## Deployment Shape

This implementation is Vercel-compatible because Vercel only serves the Next.js app and short-lived API routes. Room sync uses sanitized API polling against Supabase/Postgres, not a WebSocket server running inside Vercel Functions.

If you prefer a VPS, the same app can be hosted with `next start`; no separate realtime server is required as long as Supabase is still used.

## Required Environment Variables

Set these in Vercel or your VPS environment:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` can be used instead of `NEXT_PUBLIC_SUPABASE_ANON_KEY` if that is how your Supabase project is configured.

## Database Migration

Run the migration in:

```text
supabase/migrations/20260610_multiplayer_rooms.sql
```

It creates `public.multiplayer_rooms`. The table intentionally has no public read/write policy; all access goes through API routes so hidden roles are never returned to the wrong player.

## Current Gameplay Scope

- Human-only rooms, 8-12 seats.
- Room code and invite link.
- Host starts once the room is full.
- Roles are assigned server-side.
- Each player sees their own role. Wolves can see wolf teammates.
- Guard, wolves, witch, and seer night actions.
- Day chat, host-controlled vote start, all-player voting.
- Basic win checks: wolves win when wolves are at least equal to non-wolves; village wins when all wolves are dead.

Advanced tabletop events such as Hunter shot, Idiot reveal, sheriff/badge, and White Wolf King explosion are not wired into the online reducer yet.
