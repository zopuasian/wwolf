import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { MultiplayerApiClient, MultiplayerApiError } from "./multiplayer-bots/client.mjs";
import { personaForIndex } from "./multiplayer-bots/personas.mjs";
import {
  createBot,
  createWolfChatAction,
  decideBotAction,
  describeAction,
  observeRoom,
} from "./multiplayer-bots/strategy.mjs";

const DEFAULT_BASE_URL = "http://localhost:3000";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ||= value;
  }
}

function valueAfter(args, index, fallback) {
  return index + 1 < args.length ? args[index + 1] : fallback;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    baseUrl: process.env.MULTIPLAYER_BOT_BASE_URL || DEFAULT_BASE_URL,
    room: "",
    count: 10,
    playerCount: 10,
    preset: "classic",
    rounds: 1,
    pollMs: 500,
    maxMinutes: 10,
    seed: String(Date.now()),
    keepRoom: true,
    quiet: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--base-url") options.baseUrl = valueAfter(args, index++, options.baseUrl);
    else if (arg === "--room") options.room = valueAfter(args, index++, "").trim().toUpperCase();
    else if (arg === "--count") options.count = Number(valueAfter(args, index++, options.count));
    else if (arg === "--player-count") options.playerCount = Number(valueAfter(args, index++, options.playerCount));
    else if (arg === "--preset") options.preset = valueAfter(args, index++, options.preset);
    else if (arg === "--rounds") options.rounds = Number(valueAfter(args, index++, options.rounds));
    else if (arg === "--poll-ms") options.pollMs = Number(valueAfter(args, index++, options.pollMs));
    else if (arg === "--max-minutes") options.maxMinutes = Number(valueAfter(args, index++, options.maxMinutes));
    else if (arg === "--seed") options.seed = valueAfter(args, index++, options.seed);
    else if (arg === "--cleanup") options.keepRoom = false;
    else if (arg === "--keep-room") options.keepRoom = true;
    else if (arg === "--quiet") options.quiet = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  options.count = Math.max(1, Math.min(12, Math.round(options.count)));
  options.playerCount = Math.max(5, Math.min(12, Math.round(options.playerCount)));
  options.rounds = Math.max(1, Math.round(options.rounds));
  options.pollMs = Math.max(150, Math.round(options.pollMs));
  options.maxMinutes = Math.max(1, Number(options.maxMinutes) || 10);
  if (!options.room) {
    options.count = Math.max(5, options.count);
    options.playerCount = Math.max(options.playerCount, options.count);
  }
  if (options.count > options.playerCount) options.count = options.playerCount;
  return options;
}

function printHelp() {
  console.log(`
Wolfcha adaptive multiplayer bots

Usage:
  pnpm bots:multiplayer
  pnpm bots:multiplayer -- --room ABC123 --count 9
  pnpm bots:multiplayer -- --base-url https://example.com --preset advanced

Options:
  --room CODE          Fill an existing lobby instead of creating one
  --count NUMBER       Number of bots (default: 10)
  --player-count N     Capacity when creating a room (default: 10)
  --preset NAME        beginner, classic, advanced, or chaos
  --rounds NUMBER      Games to play before stopping
  --seed VALUE         Deterministic strategy seed
  --poll-ms NUMBER     Poll interval (default: 500)
  --max-minutes N      Safety timeout (default: 10)
  --cleanup            Delete a created room when Supabase service credentials exist
  --quiet              Only print important lifecycle events
`);
}

function log(options, message, important = false) {
  if (!options.quiet || important) console.log(message);
}

function createBots(count, seed) {
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return Array.from({ length: count }, (_, index) => {
    const persona = personaForIndex(index);
    return createBot({
      clientId: `wolfcha-test-bot-${stamp}-${index + 1}`,
      persona,
      seed: `${seed}:${index}`,
    });
  });
}

async function cleanupRoom(code) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await supabase.from("multiplayer_rooms").delete().eq("code", code);
  if (error) throw new Error(`Could not clean up room ${code}: ${error.message}`);
  return true;
}

function allLivingBotsDiscussed(bots, room) {
  const day = room.state?.day;
  const livingIds = new Set(
    (room.state?.players || []).filter((player) => player.alive).map((player) => player.clientId)
  );
  return bots
    .filter((bot) => livingIds.has(bot.clientId))
    .every((bot) => bot.memory.sentChatKeys.has(`discussion:${day}`));
}

function isRecoverableActionError(error) {
  if (!(error instanceof MultiplayerApiError)) return false;
  if ([409, 425, 429].includes(error.status)) return true;
  const message = error.message.toLowerCase();
  return [
    "waiting for",
    "cannot act now",
    "already",
    "not available now",
    "voting is not active",
    "game already started",
  ].some((fragment) => message.includes(fragment));
}

async function joinBots(api, options, bots) {
  let code = options.room;
  let room;
  let created = false;

  if (code) {
    room = await api.getRoom(code, bots[0].clientId);
    log(options, `Found room ${code} with ${room.seats.length}/${room.playerCount} seats.`, true);
  } else {
    room = await api.createRoom({
      clientId: bots[0].clientId,
      displayName: bots[0].persona.name,
      playerCount: options.playerCount,
      rolePreset: options.preset,
    });
    code = room.code;
    created = true;
    log(options, `Created room ${code}.`, true);
  }

  const existingIds = new Set(room.seats.map((seat) => seat.clientId));
  for (const bot of bots) {
    if (existingIds.has(bot.clientId)) continue;
    if (room.seats.length >= room.playerCount) break;
    room = await api.joinRoom(code, {
      clientId: bot.clientId,
      displayName: bot.persona.name,
    });
    existingIds.add(bot.clientId);
    log(options, `Joined ${bot.persona.name} (${room.seats.length}/${room.playerCount}).`);
  }

  const activeIds = new Set(room.seats.map((seat) => seat.clientId));
  const activeBots = bots.filter((bot) => activeIds.has(bot.clientId));
  if (!activeBots.length) throw new Error("No bot could join the room.");
  return { code, room, bots: activeBots, created };
}

async function run() {
  loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  const options = parseArgs();
  if (options.help) {
    printHelp();
    return;
  }

  const api = new MultiplayerApiClient(options.baseUrl);
  const bots = createBots(options.count, options.seed);
  const joined = await joinBots(api, options, bots);
  const { code, created } = joined;
  const activeBots = joined.bots;
  const roomUrl = `${options.baseUrl}/?room=${code}`;
  const deadline = Date.now() + options.maxMinutes * 60_000;
  let completedRounds = 0;
  let lastPhase = "";
  let lastDay = -1;
  let startedByBots = false;

  console.log(`Room URL: ${roomUrl}`);
  console.log(`Running ${activeBots.length} adaptive bots with seed "${options.seed}".`);

  try {
    while (Date.now() < deadline) {
      let referenceRoom = await api.getRoom(code, activeBots[0].clientId);

      if (referenceRoom.status === "lobby") {
        const hostBot = activeBots.find((bot) => bot.clientId === referenceRoom.hostClientId);
        const enoughPlayers = referenceRoom.seats.length >= 5;
        const createdRoomReady = created && referenceRoom.seats.length >= Math.min(options.count, referenceRoom.playerCount);
        if (hostBot && enoughPlayers && (createdRoomReady || startedByBots)) {
          referenceRoom = await api.action(code, { type: "START_GAME", clientId: hostBot.clientId });
          startedByBots = true;
          log(options, `Round ${completedRounds + 1} started.`, true);
        } else {
          if (!hostBot) {
            log(options, `Waiting for the human host to start room ${code}...`);
          }
          await sleep(options.pollMs);
          continue;
        }
      }

      if (referenceRoom.state?.phase !== lastPhase || referenceRoom.state?.day !== lastDay) {
        lastPhase = referenceRoom.state?.phase || "";
        lastDay = referenceRoom.state?.day ?? -1;
        log(options, `Day ${lastDay} · ${lastPhase}`, true);
      }

      if (referenceRoom.state?.phase === "GAME_END") {
        completedRounds += 1;
        log(options, `Round ${completedRounds} ended. Winner: ${referenceRoom.state.winner || "unknown"}.`, true);
        if (completedRounds >= options.rounds) break;
        const hostBot = activeBots.find((bot) => bot.clientId === referenceRoom.hostClientId);
        if (!hostBot) {
          log(options, "Waiting for the human host to restart the lobby.", true);
          await sleep(options.pollMs);
          continue;
        }
        await api.action(code, { type: "RESTART_LOBBY", clientId: hostBot.clientId });
        lastPhase = "";
        startedByBots = true;
        await sleep(options.pollMs);
        continue;
      }

      let actionTaken = false;
      for (const bot of activeBots) {
        let room;
        try {
          room = await api.getRoom(code, bot.clientId);
        } catch (error) {
          if (isRecoverableActionError(error)) continue;
          throw error;
        }
        if (!room.state) continue;
        observeRoom(bot, room);

        const wolfChat = createWolfChatAction(bot, room);
        if (wolfChat) {
          try {
            await api.action(code, wolfChat);
            log(options, describeAction(bot, room, wolfChat));
            actionTaken = true;
          } catch (error) {
            if (!isRecoverableActionError(error)) throw error;
          }
          continue;
        }

        const action = decideBotAction(bot, room, {
          allBotsDiscussed: allLivingBotsDiscussed(activeBots, room),
          onUnknownPhase: (unknownBot, phase) => {
            log(options, `${unknownBot.persona.name} has no handler for ${phase}; waiting for the server timer.`);
          },
        });
        if (!action) continue;

        try {
          await api.action(code, action);
          log(options, describeAction(bot, room, action));
          actionTaken = true;
        } catch (error) {
          if (!isRecoverableActionError(error)) throw error;
        }
      }

      await sleep(actionTaken ? Math.min(220, options.pollMs) : options.pollMs);
    }

    if (Date.now() >= deadline) {
      throw new Error(`Bot run exceeded ${options.maxMinutes} minute(s). Last phase: ${lastPhase || "unknown"}.`);
    }
  } finally {
    if (!options.keepRoom && created) {
      const cleaned = await cleanupRoom(code);
      log(options, cleaned ? `Deleted test room ${code}.` : `Room ${code} kept because service credentials are unavailable.`, true);
    } else {
      log(options, `Room kept for UI inspection: ${roomUrl}`, true);
    }
  }
}

run().catch((error) => {
  console.error(`Bot runner failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
