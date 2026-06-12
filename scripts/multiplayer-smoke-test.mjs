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

    const withBot = await request(baseUrl, `/api/multiplayer/rooms/${code}/action`, {
      type: "ADD_BOT",
      clientId: clientIds[0],
      count: 1,
    });
    const addedBot = withBot.json.room.seats.find((seat) => seat.isBot);
    assert(addedBot, "Host could not add a room bot.");
    const unauthorizedKick = await request(
      baseUrl,
      `/api/multiplayer/rooms/${code}/action`,
      { type: "KICK_PLAYER", clientId: clientIds[1], targetClientId: addedBot.clientId },
      { allowFailure: true }
    );
    assert(unauthorizedKick.res.status === 400, "A non-host player could kick another player.");
    const withoutBot = await request(baseUrl, `/api/multiplayer/rooms/${code}/action`, {
      type: "KICK_PLAYER",
      clientId: clientIds[0],
      targetClientId: addedBot.clientId,
    });
    assert(!withoutBot.json.room.seats.some((seat) => seat.clientId === addedBot.clientId), "Host could not remove a room bot.");
    logStep("host can add and remove bots while non-host kick is rejected");

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

    await patchState(supabase, code, (state) => {
      const forced = forceRoles(state, clientIds);
      return {
        ...forced,
        phase: "NIGHT_WOLF_ACTION",
        phaseStartedAt: Date.now(),
        phaseDeadlineAt: Date.now() + 60_000,
        players: forced.players.map((player, index) => (
          index === 2 ? { ...player, role: "Werewolf", alignment: "wolf" } : player
        )),
        nightActions: {
          wolfVotes: {},
          wolfVoteTurnIndex: 0,
          wolfTargets: [],
          bigBadWolfRecruitVotes: {},
          seerChecks: {},
        },
      };
    });
    await request(baseUrl, `/api/multiplayer/rooms/${code}/action`, {
      type: "NIGHT_ACTION",
      clientId: clientIds[1],
      targetSeat: 0,
    });
    const repeatedWolfVote = await request(
      baseUrl,
      `/api/multiplayer/rooms/${code}/action`,
      { type: "NIGHT_ACTION", clientId: clientIds[1], targetSeat: 3 },
      { allowFailure: true }
    );
    assert(repeatedWolfVote.res.status === 400, "A wolf voted outside its turn.");
    await request(baseUrl, `/api/multiplayer/rooms/${code}/action`, {
      type: "NIGHT_ACTION",
      clientId: clientIds[2],
      targetSeat: 3,
    });
    const tiedWolfState = (await getDbRoom(supabase, code)).state;
    assert(
      tiedWolfState.nightActions.wolfTieSeats?.length === 2 &&
      tiedWolfState.nightActions.wolfTieSeats.includes(0) &&
      tiedWolfState.nightActions.wolfTieSeats.includes(3),
      "Wolf tie-break targets were not created."
    );
    assert(tiedWolfState.nightActions.wolfVoteTurnIndex === 0, "Wolf tie-break did not restart from the first wolf.");
    await request(baseUrl, `/api/multiplayer/rooms/${code}/action`, {
      type: "NIGHT_ACTION",
      clientId: clientIds[1],
      targetSeat: 3,
    });
    await request(baseUrl, `/api/multiplayer/rooms/${code}/action`, {
      type: "NIGHT_ACTION",
      clientId: clientIds[2],
      targetSeat: 3,
    });
    const confirmedWolfState = (await getDbRoom(supabase, code)).state;
    assert(confirmedWolfState.phase === "NIGHT_WOLF_ACTION", "Wolf result did not remain visible before the Witch phase.");
    assert(confirmedWolfState.nightActions.wolfTarget === 3, "Wolf tie-break did not confirm the target.");
    assert(typeof confirmedWolfState.nightActions.wolfTargetConfirmedAt === "number", "Wolf result confirmation timestamp is missing.");
    const confirmedWolfView = await getRoom(baseUrl, code, clientIds[1]);
    const confirmedVillagerView = await getRoom(baseUrl, code, clientIds[0]);
    assert(confirmedWolfView.state.nightActions.wolfTarget === 3, "Wolves could not see the confirmed target.");
    assert(typeof confirmedVillagerView.state.nightActions.wolfTarget !== "number", "Villager could see the confirmed wolf target.");
    await patchState(supabase, code, (state) => ({
      ...state,
      phaseStartedAt: Date.now() - 5_000,
      phaseDeadlineAt: Date.now() - 1_000,
    }));
    const afterWolfResult = await getRoom(baseUrl, code, clientIds[1]);
    assert(afterWolfResult.state.phase === "NIGHT_WITCH_ACTION", "Wolf result did not advance to the Witch phase.");
    logStep("wolves vote in sequence, break ties, and privately receive the final target");

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
    const afterWitchSave = await getRoom(baseUrl, code, clientIds[3]);
    assert(afterWitchSave.state.phase === "NIGHT_WITCH_ACTION", "Witch phase ended after using only heal.");
    assert(afterWitchSave.state.roleAbilities.witchHealUsed === true, "Witch heal was not marked used.");
    assert(afterWitchSave.state.roleAbilities.witchPoisonUsed === false, "Witch poison was marked used before poison action.");
    const secondHeal = await request(
      baseUrl,
      `/api/multiplayer/rooms/${code}/action`,
      { type: "NIGHT_ACTION", clientId: clientIds[3], targetSeat: null, witchAction: "save" },
      { allowFailure: true }
    );
    assert(secondHeal.res.status === 400, "Witch second heal was accepted.");
    await request(baseUrl, `/api/multiplayer/rooms/${code}/action`, {
      type: "NIGHT_ACTION",
      clientId: clientIds[3],
      targetSeat: 1,
      witchAction: "poison",
    });
    const afterWitchPoison = await getRoom(baseUrl, code, clientIds[3]);
    assert(afterWitchPoison.state.phase === "NIGHT_SEER_ACTION", "Witch phase did not end after both potions were used.");
    assert(afterWitchPoison.state.roleAbilities.witchPoisonUsed === true, "Witch poison was not marked used.");
    logStep("witch can use both potions in one night and potions are one-use");

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

    await patchState(supabase, code, (state) => {
      const forced = forceRoles(state, clientIds);
      return {
        ...forced,
        day: 2,
        phase: "NIGHT_WOLF_ACTION",
        players: forced.players.map((player, index) => {
          if (index === 1) return { ...player, role: "BigBadWolf", alignment: "wolf", alive: true };
          if (index === 2) return { ...player, role: "Werewolf", alignment: "wolf", alive: false };
          return player;
        }),
        roleState: {
          ...forced.roleState,
          bigBadWolfRecruitNight: 2,
        },
        nightActions: {
          wolfVotes: {},
          wolfTargets: [],
          bigBadWolfRecruitVotes: {},
          seerChecks: {},
        },
      };
    });
    await request(baseUrl, `/api/multiplayer/rooms/${code}/action`, {
      type: "NIGHT_ACTION",
      clientId: clientIds[1],
      targetSeat: 0,
    });
    const recruitedState = (await getDbRoom(supabase, code)).state;
    assert(recruitedState.players[0].role === "Werewolf", "Big Bad Wolf recruitment did not convert the target.");
    assert(recruitedState.players[0].alignment === "wolf", "Big Bad Wolf recruitment did not set wolf alignment.");
    assert(typeof recruitedState.nightActions.wolfTarget !== "number", "Big Bad Wolf recruitment night also created a wolf bite target.");
    logStep("big bad wolf recruits during wolf phase without biting");

    await patchState(supabase, code, (state) => ({
      ...forceRoles(state, clientIds),
      day: 2,
      phase: "DAY_RESOLVE",
      phaseStartedAt: Date.now() - 6_000,
      phaseDeadlineAt: Date.now() - 1_000,
      nightActions: {
        wolfVotes: {},
        wolfTargets: [],
        bigBadWolfRecruitVotes: {},
        seerChecks: {},
      },
    }));
    const autoNightState = (await getRoom(baseUrl, code, clientIds[0])).state;
    assert(autoNightState.day === 3, "Day resolve did not automatically advance to the next night.");
    assert(autoNightState.phase === "NIGHT_GUARD_ACTION", `Expected next night to start at guard phase, got ${autoNightState.phase}.`);
    assert(autoNightState.phaseDeadlineAt > Date.now(), "Auto-started night phase did not receive a deadline.");
    logStep("vote result auto-advances to the next night");

    await patchState(supabase, code, (state) => {
      const forced = forceRoles(state, clientIds);
      return {
        ...forced,
        day: 4,
        phase: "NIGHT_WOLF_ACTION",
        phaseStartedAt: Date.now() - 61_000,
        phaseDeadlineAt: Date.now() - 1_000,
        players: forced.players.map((player, index) => (
          index === 2 ? { ...player, role: "Werewolf", alignment: "wolf" } : player
        )),
        nightActions: {
          wolfVotes: {
            [clientIds[1]]: 0,
            [clientIds[2]]: 3,
          },
          wolfVoteTurnIndex: 1,
          wolfTargets: [],
          bigBadWolfRecruitVotes: {},
          seerChecks: {},
        },
      };
    });
    const timedTieState = (await getRoom(baseUrl, code, clientIds[1])).state;
    assert(timedTieState.phase === "NIGHT_WOLF_ACTION", "Wolf timeout skipped a tied vote.");
    assert(
      timedTieState.nightActions.wolfTieSeats?.includes(0) &&
      timedTieState.nightActions.wolfTieSeats?.includes(3),
      "Wolf timeout did not open a tie-break."
    );
    assert(timedTieState.phaseDeadlineAt > Date.now(), "Wolf tie-break did not receive a new deadline.");
    logStep("wolf timeout preserves ties and opens a new tie-break round");

    await patchState(supabase, code, (state) => ({
      ...forceRoles(state, clientIds),
      day: 4,
      phase: "NIGHT_WOLF_ACTION",
      phaseStartedAt: Date.now() - 20_000,
      phaseDeadlineAt: Date.now() - 1_000,
      nightActions: {
        wolfVotes: {},
        wolfTargets: [],
        bigBadWolfRecruitVotes: {},
        seerChecks: {},
      },
    }));
    const autoWolfState = (await getRoom(baseUrl, code, clientIds[1])).state;
    assert(autoWolfState.phase === "NIGHT_WITCH_ACTION", `Wolf timeout did not advance to Witch phase, got ${autoWolfState.phase}.`);
    assert(typeof autoWolfState.nightActions.wolfTarget !== "number", "Wolf timeout created a bite target without votes.");
    assert(autoWolfState.phaseDeadlineAt > Date.now(), "Next night phase after wolf timeout did not receive a deadline.");
    logStep("wolf phase timeout advances without a bite when wolves do not vote");

    await patchState(supabase, code, (state) => ({
      ...forceRoles(state, clientIds),
      phase: "DAY_VOTE",
      phaseStartedAt: Date.now(),
      phaseDeadlineAt: Date.now() + 15_000,
      votes: Object.fromEntries(clientIds.slice(0, 5).map((id) => [id, 5])),
    }));
    const hunterVote = await request(baseUrl, `/api/multiplayer/rooms/${code}/action`, {
      type: "VOTE",
      clientId: clientIds[5],
      targetSeat: 1,
    });
    assert(hunterVote.json.room.state.phase === "HUNTER_SHOOT", "Hunter did not get a shot after death.");
    logStep("hunter gets a shot after dying");

    await patchState(supabase, code, (state) => ({
      ...forceRoles(state, clientIds),
      phase: "GAME_END",
      winner: "wolf",
    }));
    const endedView = await getRoom(baseUrl, code, clientIds[0]);
    assert(endedView.state.players.some((player) => player.role === "Werewolf"), "Game end view did not reveal wolf roles.");
    assert(Object.keys(endedView.state.dayHistory).length > 0 || Object.keys(endedView.state.nightHistory).length > 0, "Game end view did not include game history.");
    const restarted = await request(baseUrl, `/api/multiplayer/rooms/${code}/action`, {
      type: "RESTART_LOBBY",
      clientId: clientIds[0],
    });
    assert(restarted.json.room.status === "lobby", "Restart did not return room to lobby.");
    assert(restarted.json.room.state === null, "Restart did not clear game state.");
    assert(restarted.json.room.seats.length === TEST_PLAYERS.length, "Restart did not keep seated players.");
    logStep("game end reveals roles and host can restart the same room back to lobby");

    await request(baseUrl, `/api/multiplayer/rooms/${code}/action`, {
      type: "UPDATE_ROLE_CONFIG",
      clientId: clientIds[0],
      playerCount: 7,
      preset: "classic",
      roles: ["Werewolf", "Werewolf", "Seer", "Witch", "Hunter", "Villager", "Villager"],
    });
    const lobbyWithBot = await request(baseUrl, `/api/multiplayer/rooms/${code}/action`, {
      type: "ADD_BOT",
      clientId: clientIds[0],
      count: 1,
    });
    const roomBot = lobbyWithBot.json.room.seats.find((seat) => seat.isBot);
    assert(roomBot, "Could not create an automated room bot.");
    await request(baseUrl, `/api/multiplayer/rooms/${code}/action`, {
      type: "START_GAME",
      clientId: clientIds[0],
    });
    let roomAfterBotAck = null;
    for (const id of clientIds) {
      const acknowledged = await request(baseUrl, `/api/multiplayer/rooms/${code}/action`, {
        type: "ACK_ROLE",
        clientId: id,
      });
      roomAfterBotAck = acknowledged.json.room;
    }
    assert(roomAfterBotAck.state.roleAcks[roomBot.clientId], "Room bot did not automatically acknowledge its role.");
    assert(roomAfterBotAck.state.phase !== "ROLE_REVEAL", "Room bot prevented the game from leaving role reveal.");
    logStep("server-managed room bot automatically acknowledges its role");

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
