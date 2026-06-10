import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_BASE_URL = "http://localhost:3000";
const TEST_PLAYERS = [
  { name: "Host", role: "Villager", alignment: "village" },
  { name: "Wolf", role: "Werewolf", alignment: "wolf" },
  { name: "Seer", role: "Seer", alignment: "village" },
  { name: "Witch", role: "Witch", alignment: "village" },
  { name: "Guard", role: "Guard", alignment: "village" },
  { name: "Hunter", role: "Hunter", alignment: "village" },
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ||= value;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { baseUrl: process.env.MULTIPLAYER_TEST_BASE_URL || DEFAULT_BASE_URL, keepRoom: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--keep-room") out.keepRoom = true;
    if (arg === "--base-url") out.baseUrl = args[index + 1] || out.baseUrl;
  }
  return out;
}

async function request(baseUrl, url, body, options = {}) {
  const res = await fetch(`${baseUrl}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!options.allowFailure && !res.ok) {
    throw new Error(`${url} failed with ${res.status}: ${json.error || JSON.stringify(json)}`);
  }
  return { res, json };
}

async function getRoom(baseUrl, code, clientId) {
  const res = await fetch(`${baseUrl}/api/multiplayer/rooms/${code}?clientId=${encodeURIComponent(clientId)}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GET room failed with ${res.status}: ${json.error || JSON.stringify(json)}`);
  return json.room;
}

async function getDbRoom(supabase, code) {
  const { data, error } = await supabase
    .from("multiplayer_rooms")
    .select("state,action_seq")
    .eq("code", code)
    .single();
  if (error) throw new Error(`Could not load DB room: ${error.message}`);
  return data;
}

async function patchState(supabase, code, patcher) {
  const row = await getDbRoom(supabase, code);
  const nextState = patcher(structuredClone(row.state));
  const { error } = await supabase
    .from("multiplayer_rooms")
    .update({ state: nextState, action_seq: row.action_seq + 1 })
    .eq("code", code);
  if (error) throw new Error(`Could not patch DB room: ${error.message}`);
  return nextState;
}

function forceRoles(state, clientIds) {
  return {
    ...state,
    day: 1,
    roleAcks: Object.fromEntries(clientIds.map((id) => [id, true])),
    players: state.players.map((player, index) => ({
      ...player,
      clientId: clientIds[index],
      displayName: TEST_PLAYERS[index].name,
      role: TEST_PLAYERS[index].role,
      alignment: TEST_PLAYERS[index].alignment,
      alive: true,
      roleRevealed: false,
    })),
    roleAbilities: {
      witchHealUsed: false,
      witchPoisonUsed: false,
    },
    nightActions: {
      wolfVotes: {},
      seerChecks: {},
    },
    votes: {},
    pendingHunterShot: undefined,
    winner: null,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function logStep(message) {
  console.log(`✓ ${message}`);
}

async function main() {
  loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  const { baseUrl, keepRoom } = parseArgs();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase env. This smoke test needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const stamp = Date.now();
  const clientIds = TEST_PLAYERS.map((player) => `smoke-${player.role.toLowerCase()}-${stamp}`);
  let code = "";

  try {
    const created = await request(baseUrl, "/api/multiplayer/rooms", {
      clientId: clientIds[0],
      displayName: TEST_PLAYERS[0].name,
      playerCount: 8,
    });
    code = created.json.room.code;
    logStep(`created room ${code}`);

    for (let index = 1; index < TEST_PLAYERS.length; index += 1) {
      await request(baseUrl, `/api/multiplayer/rooms/${code}/join`, {
        clientId: clientIds[index],
        displayName: TEST_PLAYERS[index].name,
      });
    }
    logStep(`joined ${TEST_PLAYERS.length} virtual players`);

    const started = await request(baseUrl, `/api/multiplayer/rooms/${code}/action`, {
      type: "START_GAME",
      clientId: clientIds[0],
    });
    assert(started.json.room.state.phase === "ROLE_REVEAL", "Game did not enter role reveal.");
    logStep("started game");

    await patchState(supabase, code, (state) => forceRoles(state, clientIds));
    logStep("forced deterministic test roles");

    await patchState(supabase, code, (state) => ({
      ...forceRoles(state, clientIds),
      phase: "NIGHT_WOLF_ACTION",
      messages: [],
    }));
    await request(baseUrl, `/api/multiplayer/rooms/${code}/action`, {
      type: "CHAT",
      clientId: clientIds[1],
      content: "wolf-only smoke message",
    });
    const wolfView = await getRoom(baseUrl, code, clientIds[1]);
    const villagerView = await getRoom(baseUrl, code, clientIds[0]);
    assert(
      wolfView.state.messages.some((message) => message.content === "wolf-only smoke message" && message.visibility === "wolves"),
      "Wolf could not see wolf-only chat."
    );
    assert(
      !villagerView.state.messages.some((message) => message.content === "wolf-only smoke message"),
      "Villager could see wolf-only chat."
    );
    logStep("wolf night chat is private");

    await patchState(supabase, code, (state) => ({
      ...forceRoles(state, clientIds),
      phase: "NIGHT_GUARD_ACTION",
    }));
    const guardSelf = await request(
      baseUrl,
      `/api/multiplayer/rooms/${code}/action`,
      { type: "NIGHT_ACTION", clientId: clientIds[4], targetSeat: 4 },
      { allowFailure: true }
    );
    assert(guardSelf.res.status === 400, "Guard self-protection was accepted.");
    logStep("guard cannot protect self");

    await patchState(supabase, code, (state) => ({
      ...forceRoles(state, clientIds),
      phase: "NIGHT_WITCH_ACTION",
      nightActions: {
        wolfVotes: {},
        wolfTarget: 5,
        seerChecks: {},
      },
    }));
    await request(baseUrl, `/api/multiplayer/rooms/${code}/action`, {
      type: "NIGHT_ACTION",
      clientId: clientIds[3],
      targetSeat: null,
      witchAction: "save",
    });
    await patchState(supabase, code, (state) => ({
      ...state,
      phase: "NIGHT_WITCH_ACTION",
      nightActions: {
        ...state.nightActions,
        wolfTarget: 5,
      },
    }));
    const secondHeal = await request(
      baseUrl,
      `/api/multiplayer/rooms/${code}/action`,
      { type: "NIGHT_ACTION", clientId: clientIds[3], targetSeat: null, witchAction: "save" },
      { allowFailure: true }
    );
    assert(secondHeal.res.status === 400, "Witch second heal was accepted.");
    logStep("witch potions are one-use");

    await patchState(supabase, code, (state) => ({
      ...forceRoles(state, clientIds),
      phase: "NIGHT_SEER_ACTION",
    }));
    await request(baseUrl, `/api/multiplayer/rooms/${code}/action`, {
      type: "NIGHT_ACTION",
      clientId: clientIds[2],
      targetSeat: 1,
    });
    const seerView = await getRoom(baseUrl, code, clientIds[2]);
    const check = seerView.state.nightActions.seerChecks[clientIds[2]]?.[0];
    assert(check?.isWolf && check.targetRole === "Werewolf", "Seer result was missing or incorrect.");
    logStep("seer receives alignment and wolf role result");

    await patchState(supabase, code, (state) => ({
      ...forceRoles(state, clientIds),
      phase: "DAY_VOTE",
      votes: Object.fromEntries(clientIds.slice(0, 5).map((id) => [id, 5])),
    }));
    const hunterVote = await request(baseUrl, `/api/multiplayer/rooms/${code}/action`, {
      type: "VOTE",
      clientId: clientIds[5],
      targetSeat: 1,
    });
    assert(hunterVote.json.room.state.phase === "HUNTER_SHOOT", "Hunter did not get a shot after death.");
    logStep("hunter gets a shot after dying");

    console.log("\nMultiplayer smoke test passed.");
  } finally {
    if (code && !keepRoom) {
      await supabase.from("multiplayer_rooms").delete().eq("code", code);
      console.log(`Cleaned test room ${code}.`);
    } else if (code) {
      console.log(`Kept test room ${code}.`);
    }
  }
}

main().catch((error) => {
  console.error(`\nMultiplayer smoke test failed: ${error.message}`);
  process.exit(1);
});
