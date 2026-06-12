[English](./README.md) | [简体中文](./README.zh.md)

# Wolfcha

<div align="center">
  <img src="public/logo.png" alt="Wolfcha Logo" width="240" />
  <h3>Online Werewolf for Friends - Human Players, Hidden Roles, Real-Time Deception</h3>
  <p>
    <a href="https://masoi.nguynchupanh.com">Play Online</a>
  </p>
</div>

## 🙏 Sponsors

<table>
  <tr>
    <td width="120" align="center">
      <img src="public/sponsor/zenmux.png" alt="ZenMux Logo" width="100" />
    </td>
    <td>
      <strong>ZenMux</strong><br/>
      Supported the original AI edition with model routing and orchestration.
    </td>
  </tr>
  <tr>
    <td width="120" align="center">
      <img src="public/sponsor/minimax.png" alt="MiniMax Logo" width="100" />
    </td>
    <td>
      <strong>MiniMax</strong><br/>
      The original AI edition of Wolfcha was powered by MiniMax LLM and TTS.
    </td>
  </tr>
  <tr>
    <td width="120" align="center">
      <img src="public/sponsor/watcha.svg" alt="Watcha Logo" width="100" />
    </td>
    <td>
      <strong>Watcha</strong><br/>
      Supported the early showcase and community context for the project.
    </td>
  </tr>
</table>

---

> Note: Wolfcha began as an AI-native Werewolf experiment. The current main experience is online multiplayer. Rooms contain real players by default; a host may explicitly add adaptive test bots from Room Settings when they need to test or fill a private room.

## 📖 Background

Wolfcha is a social deduction game inspired by Werewolf. Players join the same online room from different devices, receive secret roles, talk, bluff, accuse, vote, and survive through alternating nights and days.

The project keeps the original Wolfcha atmosphere: parchment lobby, red seal entry, retro portraits, role reveal cards, event messages, and the day/night eye-blink fade animation. The gameplay has been reworked so real players share the table online.

## ✨ Core Features

### 1. Online Human Multiplayer

- Create or join a room with a short invite code.
- Play together from different locations and devices.
- No automatic bot participation.
- Host can explicitly add adaptive English-speaking bots from Room Settings.
- Host can remove players or bots before the game starts.
- Supports rooms from 5 to 12 players.
- Host can start once the room has enough real players.

### 2. Room Role Setup

- Choose a default preset for a quick start.
- Edit the role list before starting.
- Reopen room settings after room creation while still in the lobby.
- Role counts are validated against the number of seated players.
- Roles are shuffled before assignment each game.

### 3. Focused Role Actions

- Night and vote actions use a centered action console.
- Targets, confirm controls, timer, and result text stay in the same popup.
- The popup closes automatically when its phase ends.
- Wolf night chat remains visible below the action area so wolves do not miss messages.
- Player cards show action chips such as `Vote: Aki`, `Bite: Sarah`, or `Curse: Kevin` when relevant.

### 4. Day, Night, Chat, And Timers

- Most night phases last 15 seconds.
- Wolf phases last 60 seconds.
- Witch phases last 30 seconds.
- Day discussion lasts 60 seconds.
- Voting lasts 15 seconds.
- Day resolution advances automatically to the next night.
- Host can force-stop discussion and voting when needed.
- Day chat is public.
- Wolf night chat is private to wolves only.

### 5. Expanded Role Logic

Wolfcha includes classic and advanced Werewolf roles, including Villager, Werewolf, Seer, Witch, Hunter, Guard, Cupid, Idiot, Prince, Diseased, Cursed, Wolf Cub, and Big Bad Wolf.

Important rules implemented in the online version:

- Witch heal and poison are each limited to one use, but both can be used in the same night.
- Seer receives an investigation result.
- Hunter can shoot when eliminated.
- Big Bad Wolf has been customized: if any wolf dies and the Big Bad Wolf is still alive, the next wolf night becomes a recruit night. Wolves choose one non-wolf to join the wolf team, and they cannot bite on that night.
- If wolves must recruit on a night, the normal wolf bite is disabled for that same phase.

## 🎮 How To Play

1. Open [masoi.nguynchupanh.com](https://masoi.nguynchupanh.com).
2. Sign your name with the red seal.
3. Create a room or join with a room code/link.
4. The host chooses a role preset or custom role setup.
5. When enough players are seated, the host starts the game.
6. Read your role reveal once, acknowledge it, then play from the table.
7. Use the center action console when your role or the village needs a decision.

## 🛠️ Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- Supabase/Postgres for online room state
- Vercel for hosting

The online multiplayer flow uses Supabase-backed room snapshots and Next.js API routes. It does not require a custom WebSocket server, which makes it suitable for Vercel deployment.

## 🚀 Local Development

Install dependencies:

```bash
pnpm install
```

Create an environment file:

```bash
cp .env.example .env.local
```

Required Supabase variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

If your Supabase project exposes the newer publishable key name, this is also supported:

```bash
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=...
```

Run the development server:

```bash
pnpm dev
```

Open:

```text
http://localhost:3000
```

## 🗄️ Database

Apply the multiplayer migration in Supabase SQL Editor:

```text
supabase/migrations/20260610_multiplayer_rooms.sql
```

This creates the tables and policies needed for online rooms, seats, messages, actions, and synchronized game state.

## 🧪 Testing

Useful local checks:

```bash
pnpm test:multiplayer
pnpm test:multiplayer:ui
pnpm bots:multiplayer
pnpm build
```

The adaptive bot runner creates a room with 10 English-speaking test clients. They read public or wolf-only chat, remember claims and accusations, and choose actions through the same multiplayer API as a browser player:

```bash
# Create and run a 10-bot room
pnpm bots:multiplayer

# Fill an existing lobby so one human can inspect the live UI
pnpm bots:multiplayer -- --room ABC123 --count 9

# Exercise another preset or deployment
pnpm bots:multiplayer -- --preset chaos
pnpm bots:multiplayer -- --base-url https://masoi.nguynchupanh.com
```

The runner is capability-based. Unknown future phases are reported and left to the server timer instead of crashing the test. Add a phase handler in `scripts/multiplayer-bots/strategy.mjs` only when a new role introduces a genuinely new action contract.

The UI test mode can be opened with:

```text
http://localhost:3000/?uiTest=1
```

## ☁️ Deploy

The project can run on Vercel when Supabase environment variables are configured.

Production:

```text
https://masoi.nguynchupanh.com
```

Deploy command:

```bash
npx vercel@latest --prod --yes
```

## 📄 License

MIT License
