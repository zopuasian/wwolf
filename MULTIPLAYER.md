# Wolves House Online Multiplayer

Wolves House now runs as an online human-vs-human Werewolf game on the root route `/`.

The multiplayer build uses real-player seats by default. Hosts may explicitly add adaptive test bots from Room Settings; bots never join a room automatically. The server only returns the information each viewer is allowed to know.

## Product Shape

- Human-only online rooms.
- 5 to 12 players per room.
- Short room code and invite link.
- Host-controlled lobby settings.
- Role preset selection for quick starts.
- Custom role setup before the match begins.
- Real-time-feeling sync through Supabase-backed polling.
- No custom WebSocket server is required.

## Deployment Shape

The app is Vercel-compatible because Vercel only serves:

- the Next.js frontend
- short-lived Next.js API routes
- sanitized room snapshots

Persistent room state lives in Supabase/Postgres. This avoids keeping a long-running multiplayer process inside Vercel Functions.

If you prefer a VPS, the same app can run with `next start` as long as it can reach the same Supabase project.

Production custom domain:

```text
https://masoi.nguynchupanh.com
```

## Required Environment Variables

Set these locally, on Vercel, or in your VPS process environment:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Supabase projects that expose the newer publishable key can use this public key name as well:

```bash
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=...
```

The service role key must stay server-side only. It is used by API routes to read and update authoritative room state.

## Database Migration

Run the migration in Supabase SQL Editor:

```text
supabase/migrations/20260610_multiplayer_rooms.sql
```

The migration creates the multiplayer room storage used by the online client. Hidden data such as roles, night choices, and private wolf chat should not be queried directly by the browser. All browser reads should go through API routes that sanitize the snapshot for the current player.

## Room Lifecycle

1. Player signs a name on the entry card.
2. Player creates a room or joins with a room code.
3. Host chooses a default role preset or customizes the room roles.
4. Other players join from their own devices.
5. Host starts when at least 5 real players are seated.
6. Server shuffles the selected role list and assigns roles.
7. Each player receives a one-time role reveal card.
8. The match cycles through night, discussion, vote, and resolution until a win condition is reached.

## Role Setup

Role setup is intentionally editable before the game starts so groups can tune the table for their own style.

Default presets are meant for newer groups. Custom setup is for groups that already know which mix of village, wolf, and special roles they want.

Rules for setup:

- Role count must match seated player count.
- The room must contain at least one wolf-team role.
- The room must contain enough village-team roles for a playable game.
- Roles are shuffled server-side when the match starts.

## Gameplay Flow

### Night

Most night actions run in 15-second phases. Wolf phases last 60 seconds, and Witch phases last 30 seconds. The current player's available action appears in a centered action console.

The action console contains:

- phase title
- timer
- target list
- relevant role note
- confirm button
- result/status text

The console closes automatically when the phase ends.

### Day Discussion

Discussion lasts 60 seconds. Players use the public day chat to accuse, defend, and coordinate.

The host can force-stop discussion if the table is ready to vote.

### Vote

Voting lasts 15 seconds. Vote selection and confirmation happen inside the same center action console.

Player cards show vote status chips such as:

```text
Vote: Aki
```

The host can force-stop voting if needed.

### Resolution

The game resolves deaths, role effects, and win conditions. If the game continues, the match automatically advances to the next night. The host does not need to press a separate next-night button.

## Chat Visibility

Wolves House separates chat by phase and team:

- Day chat is public to all players.
- Wolf night chat is visible only to wolves.
- Village players must never receive wolf night messages in their sanitized room snapshot.

The wolf night chat stays available below the role action console so wolves can coordinate while choosing a target.

## Implemented Role Notes

The online reducer supports classic and expanded Werewolf roles. Important current behavior:

- Villager has no night action.
- Werewolves choose the night bite together.
- Seer investigates one player and receives a result.
- Witch sees who was attacked and can heal once and poison once. Both potions can be used in the same night if both are still available.
- Guard can protect a player.
- Hunter can shoot when eliminated.
- Idiot/Prince-style survival reveal roles can prevent a normal vote death when their rule applies.
- Cursed-style roles can join the wolf team when their rule converts them.
- Wolf Cub death can empower the wolf team on the following night.
- Diseased-style penalties can affect the next wolf bite when implemented by room state.
- Big Bad Wolf is customized for this project.

## Big Bad Wolf Rule

The project-specific Big Bad Wolf behavior is:

1. If any wolf dies by any reason, the wolf team becomes eligible for a recruit night.
2. The recruit night only happens if Big Bad Wolf is still alive.
3. On that next wolf phase, wolves choose one non-wolf player to become a wolf.
4. Wolves cannot bite on the same night they must recruit.
5. The recruit choice uses the same wolf phase UI rather than a separate phase.

This keeps the night flow compact and avoids making players wait through an extra wolf-only stage.

## Timers

Current phase timers:

```text
Most night phases: 15s
Wolf phase:        60s
Witch phase:       30s
Discussion:        60s
Vote:              15s
```

Timed phases auto-advance when the server resolves the room state. Host force-stop controls are still available for discussion and voting.

## Local Development

Install dependencies:

```bash
pnpm install
```

Run locally:

```bash
pnpm dev
```

Open:

```text
http://localhost:3000
```

Open UI test mode:

```text
http://localhost:3000/?uiTest=1
```

## Test Commands

Recommended checks:

```bash
pnpm test:multiplayer
pnpm test:multiplayer:ui
pnpm bots:multiplayer
pnpm build
```

Adaptive bot testing:

```bash
# Start a complete 10-bot game through the public multiplayer API
pnpm bots:multiplayer

# Add nine bots to a human-created lobby for live UI and mechanic testing
pnpm bots:multiplayer -- --room ABC123 --count 9

# Reproduce decisions with a fixed strategy seed
pnpm bots:multiplayer -- --seed regression-42 --preset advanced
```

These are developer-controlled test clients, not automatic AI seats. Each bot has a distinct play style, parses English role claims and accusations, remembers investigation results, and uses a phase capability registry. New passive roles work without bot changes; a new interactive phase only needs a focused handler in `scripts/multiplayer-bots/strategy.mjs`.

Manual test checklist:

- create a room
- join from another browser/session
- edit role setup before game start
- start with exactly 5 players
- verify role reveal appears once, then hides after acknowledgement
- verify night action console appears and closes by phase
- verify seer result appears after investigation
- verify witch heal/poison are each one-use
- verify wolf night chat is hidden from non-wolves
- verify day discussion auto-advances to vote
- verify vote auto-resolves after the timer
- verify day result advances to the next night
- verify Big Bad Wolf recruit night disables normal wolf bite

## Vercel Deployment

Deploy production:

```bash
npx vercel@latest --prod --yes
```

The Vercel project must include the Supabase environment variables listed above.

If a Vercel preview URL is protected by Vercel authentication, test with the configured custom production domain instead.

## Security Notes

- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.
- Do not read raw room rows directly from client code.
- Keep hidden roles, wolf chat, night actions, and private results behind API sanitization.
- Prefer server-side role assignment and role shuffling.
- Treat the room snapshot returned to each player as the product boundary for secrecy.
