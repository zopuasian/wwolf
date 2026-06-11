import { isWolfRole, type Role } from "@/types/game";
import { generateUUID } from "@/lib/utils";
import {
  getDefaultMultiplayerRoles,
  getRoleAlignment,
  normalizeRoleConfig,
  validateRoleConfig,
} from "./roles";
import type {
  MultiplayerAction,
  MultiplayerChatMessage,
  MultiplayerGameState,
  MultiplayerPlayer,
  MultiplayerRoom,
  MultiplayerSeat,
} from "./types";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MIN_PLAYERS_TO_START = 5;
const MAX_ROOM_PLAYERS = 12;
export const DISCUSSION_DURATION_MS = 60_000;
export const VOTE_DURATION_MS = 15_000;

export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export function createRoomCode(): string {
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return out;
}

export function clampPlayerCount(value: number): number {
  if (!Number.isFinite(value)) return 10;
  return Math.min(MAX_ROOM_PLAYERS, Math.max(MIN_PLAYERS_TO_START, Math.round(value)));
}

export function createSeat(clientId: string, displayName: string, seat: number): MultiplayerSeat {
  return {
    clientId,
    seat,
    displayName: displayName.trim().slice(0, 24) || `Player ${seat + 1}`,
    avatarSeed: clientId,
    joinedAt: Date.now(),
  };
}

function randomInt(maxExclusive: number): number {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error("Invalid random range.");
  }

  const maxUint32 = 0xffffffff;
  const limit = maxUint32 - (maxUint32 % maxExclusive);
  const buffer = new Uint32Array(1);

  while (true) {
    globalThis.crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % maxExclusive;
  }
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function systemMessage(state: MultiplayerGameState, content: string): MultiplayerChatMessage {
  return {
    id: generateUUID(),
    clientId: "system",
    seat: null,
    playerName: "Host",
    content,
    timestamp: Date.now(),
    day: state.day,
    phase: state.phase,
    isSystem: true,
  };
}

function addSystemMessage(state: MultiplayerGameState, content: string): MultiplayerGameState {
  return { ...state, messages: [...state.messages, systemMessage(state, content)] };
}

function addSystemMessages(state: MultiplayerGameState, messages: string[]): MultiplayerGameState {
  return messages.reduce((next, message) => addSystemMessage(next, message), state);
}

function nightPhasePrompt(state: MultiplayerGameState): string {
  switch (state.phase) {
    case "NIGHT_DOPPELGANGER_ACTION":
      return "Doppelganger, choose one player to copy.";
    case "NIGHT_CUPID_ACTION":
      return "Cupid, choose two lovers.";
    case "NIGHT_CULT_ACTION":
      return "Cult Leader, choose one player to recruit.";
    case "NIGHT_GUARD_ACTION":
      return "Bodyguard, open your eyes.";
    case "NIGHT_WOLF_ACTION":
      return "Werewolves, open your eyes and choose a target.";
    case "NIGHT_BIG_BAD_WOLF_ACTION":
      return "Big Bad Wolf, choose an adjacent bonus target.";
    case "NIGHT_WITCH_ACTION":
      return "Witch, open your eyes.";
    case "NIGHT_SEER_ACTION":
      return "Seer, open your eyes and inspect one player.";
    case "NIGHT_SORCERER_ACTION":
      return "Sorcerer, open your eyes and search for wolves or the Seer.";
    case "NIGHT_PI_ACTION":
      return "P.I., choose a center seat to inspect three neighbors.";
    default:
      return "";
  }
}

function enterNightPhase(state: MultiplayerGameState, phase: MultiplayerGameState["phase"]): MultiplayerGameState {
  const next = clearPhaseTimer({ ...state, phase });
  const prompt = nightPhasePrompt(next);
  return prompt ? addSystemMessage(next, prompt) : next;
}

function withPhaseTimer(state: MultiplayerGameState, durationMs?: number): MultiplayerGameState {
  const phaseStartedAt = Date.now();
  return {
    ...state,
    phaseStartedAt,
    phaseDeadlineAt: durationMs ? phaseStartedAt + durationMs : undefined,
  };
}

function clearPhaseTimer(state: MultiplayerGameState): MultiplayerGameState {
  return { ...state, phaseStartedAt: Date.now(), phaseDeadlineAt: undefined };
}

function checkWinner(stateOrPlayers: MultiplayerGameState | MultiplayerPlayer[]): MultiplayerGameState["winner"] {
  const state = Array.isArray(stateOrPlayers) ? null : stateOrPlayers;
  const players = Array.isArray(stateOrPlayers) ? stateOrPlayers : stateOrPlayers.players;
  const alive = players.filter((p) => p.alive);
  const tannerDeadByVote = state
    ? Object.values(state.dayHistory).some((history) => {
        if (typeof history.executedSeat !== "number") return false;
        return players.find((player) => player.seat === history.executedSeat)?.role === "Tanner";
      })
    : false;
  if (tannerDeadByVote) return "tanner";
  if (state?.roleState?.cultMemberClientIds?.length) {
    const cult = new Set(state.roleState.cultMemberClientIds);
    if (alive.length > 0 && alive.every((player) => cult.has(player.clientId))) return "cult";
  }
  const wolves = alive.filter((p) => isWolfRole(p.role)).length;
  const village = alive.length - wolves;
  if (wolves === 0) return "village";
  if (wolves >= village) return "wolf";
  return null;
}

function winnerMessage(winner: MultiplayerGameState["winner"]): string {
  if (winner === "wolf") return "Werewolves win.";
  if (winner === "tanner") return "Tanner wins.";
  if (winner === "cult") return "Cult wins.";
  return "Village wins.";
}

function killSeats(state: MultiplayerGameState, seats: number[]): MultiplayerGameState {
  if (seats.length === 0) return state;
  const dead = new Set(seats);
  const lovers = state.roleState?.lovers ?? [];
  if (lovers.some((seat) => dead.has(seat))) {
    for (const seat of lovers) dead.add(seat);
  }
  const killedPlayers = state.players.filter((player) => dead.has(player.seat));
  const doppelgangerTargets = state.roleState?.doppelgangerTargets ?? {};
  const inheritedByClientId = new Map<string, MultiplayerPlayer>();
  for (const [clientId, targetSeat] of Object.entries(doppelgangerTargets)) {
    const target = killedPlayers.find((player) => player.seat === targetSeat);
    const doppelganger = state.players.find((player) => player.clientId === clientId);
    if (target && doppelganger?.alive && doppelganger.role === "Doppelganger") {
      inheritedByClientId.set(clientId, target);
    }
  }
  const wolfCubKilled = killedPlayers.some((player) => player.role === "WolfCub");
  return {
    ...state,
    roleState: {
      ...state.roleState,
      wolfCubRevengePending: state.roleState?.wolfCubRevengePending || wolfCubKilled,
    },
    players: state.players.map((player) => {
      if (dead.has(player.seat)) return { ...player, alive: false };
      const inherited = inheritedByClientId.get(player.clientId);
      if (inherited) {
        return {
          ...player,
          role: inherited.role,
          alignment: inherited.alignment,
          roleRevealed: true,
        };
      }
      return player;
    }),
  };
}

function enterHunterShotIfNeeded(
  state: MultiplayerGameState,
  killedSeats: number[],
  resumePhase: "DAY_DISCUSSION" | "DAY_RESOLVE"
): MultiplayerGameState {
  const hunter = killedSeats
    .map((seat) => state.players.find((p) => p.seat === seat))
    .find((player): player is MultiplayerPlayer => !!player && player.role === "Hunter");
  if (!hunter) return state;
  return clearPhaseTimer({
    ...state,
    phase: "HUNTER_SHOOT",
    pendingHunterShot: {
      hunterClientId: hunter.clientId,
      hunterSeat: hunter.seat,
      resumePhase,
    },
  });
}

function firstNightPhase(state: MultiplayerGameState): MultiplayerGameState["phase"] {
  if (state.day === 0 && state.players.some((p) => p.alive && p.role === "Doppelganger")) return "NIGHT_DOPPELGANGER_ACTION";
  if (state.day === 0 && state.players.some((p) => p.alive && p.role === "Cupid")) return "NIGHT_CUPID_ACTION";
  if (state.players.some((p) => p.alive && p.role === "CultLeader")) return "NIGHT_CULT_ACTION";
  if (state.players.some((p) => p.alive && p.role === "Guard")) return "NIGHT_GUARD_ACTION";
  return "NIGHT_WOLF_ACTION";
}

function nextNight(state: MultiplayerGameState): MultiplayerGameState {
  const lastGuardTarget = state.nightActions.guardTarget ?? state.nightActions.lastGuardTarget;
  const phase = firstNightPhase(state);
  const revengeTonight = !!state.roleState?.wolfCubRevengePending;
  const next = clearPhaseTimer({
    ...state,
    phase,
    day: state.day + 1,
    votes: {},
    roleState: {
      ...state.roleState,
      wolfCubRevengePending: false,
      wolfCubRevengeNight: revengeTonight ? state.day + 1 : state.roleState?.wolfCubRevengeNight,
    },
    nightActions: {
      lastGuardTarget,
      wolfVotes: {},
      wolfTargets: [],
      seerChecks: state.nightActions.seerChecks,
      sorcererChecks: state.nightActions.sorcererChecks ?? {},
      piChecks: state.nightActions.piChecks ?? {},
    },
  });
  return addSystemMessages(next, [`Night ${next.day}. Close your eyes.`, nightPhasePrompt(next)]);
}

export function createInitialMultiplayerState(seats: MultiplayerSeat[], roleConfig?: Role[]): MultiplayerGameState {
  const roles = shuffle(roleConfig?.length === seats.length ? roleConfig : getDefaultMultiplayerRoles(seats.length));
  const players = seats.map<MultiplayerPlayer>((seat, index) => {
    const role = roles[index] ?? "Villager";
    return {
      ...seat,
      alive: true,
      role,
      alignment: getRoleAlignment(role),
    };
  });

  const base: MultiplayerGameState = {
    phase: "ROLE_REVEAL",
    day: 0,
    players,
    messages: [],
    roleAcks: {},
    nightActions: {
      wolfVotes: {},
      wolfTargets: [],
      seerChecks: {},
      sorcererChecks: {},
      piChecks: {},
    },
    roleState: {
      cultMemberClientIds: players.filter((player) => player.role === "CultLeader").map((player) => player.clientId),
      doppelgangerTargets: {},
    },
    roleAbilities: {
      witchHealUsed: false,
      witchPoisonUsed: false,
    },
    votes: {},
    dayHistory: {},
    nightHistory: {},
    winner: null,
  };

  return addSystemMessages(base, ["Everyone is here. Let's begin.", "Check your role, then confirm."]);
}

function maybeSkipNightPhase(state: MultiplayerGameState): MultiplayerGameState {
  if (state.phase === "NIGHT_DOPPELGANGER_ACTION") {
    const doppelganger = state.players.find((p) => p.alive && p.role === "Doppelganger");
    if (!doppelganger || state.roleState?.doppelgangerTargets?.[doppelganger.clientId] !== undefined) {
      return maybeSkipNightPhase(enterNightPhase(state, state.players.some((p) => p.alive && p.role === "Cupid") ? "NIGHT_CUPID_ACTION" : "NIGHT_CULT_ACTION"));
    }
  }

  if (state.phase === "NIGHT_CUPID_ACTION") {
    const cupid = state.players.find((p) => p.alive && p.role === "Cupid");
    if (!cupid || state.roleState?.lovers?.length === 2 || state.day > 1) return maybeSkipNightPhase(enterNightPhase(state, "NIGHT_CULT_ACTION"));
  }

  if (state.phase === "NIGHT_CULT_ACTION") {
    const cultLeader = state.players.find((p) => p.alive && p.role === "CultLeader");
    if (!cultLeader) return maybeSkipNightPhase(enterNightPhase(state, "NIGHT_GUARD_ACTION"));
  }

  if (state.phase === "NIGHT_GUARD_ACTION") {
    const guard = state.players.find((p) => p.alive && p.role === "Guard");
    if (!guard) return maybeSkipNightPhase(enterNightPhase(state, "NIGHT_WOLF_ACTION"));
  }

  if (state.phase === "NIGHT_WOLF_ACTION") {
    if (state.roleState?.diseasedWolvesBlockedNight === state.day) {
      return maybeSkipNightPhase(enterNightPhase(state, "NIGHT_WITCH_ACTION"));
    }
    const aliveWolves = state.players.filter((p) => p.alive && isWolfRole(p.role));
    if (aliveWolves.length === 0) return maybeSkipNightPhase(enterNightPhase(state, "NIGHT_WITCH_ACTION"));
  }

  if (state.phase === "NIGHT_BIG_BAD_WOLF_ACTION") {
    const bigBadWolf = state.players.find((p) => p.alive && p.role === "BigBadWolf");
    if (!bigBadWolf) return maybeSkipNightPhase(enterNightPhase(state, "NIGHT_WITCH_ACTION"));
  }

  if (state.phase === "NIGHT_WITCH_ACTION") {
    const witch = state.players.find((p) => p.alive && p.role === "Witch");
    if (!witch || (state.roleAbilities.witchHealUsed && state.roleAbilities.witchPoisonUsed)) {
      return maybeSkipNightPhase(enterNightPhase(state, "NIGHT_SEER_ACTION"));
    }
  }

  if (state.phase === "NIGHT_SEER_ACTION") {
    const seer = state.players.find((p) => p.alive && p.role === "Seer");
    if (!seer) return maybeSkipNightPhase(enterNightPhase(state, "NIGHT_SORCERER_ACTION"));
  }

  if (state.phase === "NIGHT_SORCERER_ACTION") {
    const sorcerer = state.players.find((p) => p.alive && p.role === "Sorcerer");
    if (!sorcerer) return maybeSkipNightPhase(enterNightPhase(state, "NIGHT_PI_ACTION"));
  }

  if (state.phase === "NIGHT_PI_ACTION") {
    const pi = state.players.find((p) => p.alive && p.role === "PI");
    if (!pi) return resolveNight(state);
  }

  return state;
}

function resolveNight(state: MultiplayerGameState): MultiplayerGameState {
  let deaths: number[] = [];
  const wolfTargets = state.nightActions.wolfTargets?.length
    ? state.nightActions.wolfTargets
    : typeof state.nightActions.wolfTarget === "number"
      ? [state.nightActions.wolfTarget]
      : [];
  const guarded = state.nightActions.guardTarget;
  let nextState = state;

  for (const wolfTarget of wolfTargets) {
    const target = nextState.players.find((player) => player.seat === wolfTarget);
    if (!target) continue;
    if (target.role === "Cursed") {
      nextState = {
        ...nextState,
        players: nextState.players.map((player) => (
          player.seat === target.seat
            ? { ...player, role: "Werewolf", alignment: "wolf", roleRevealed: player.roleRevealed }
            : player
        )),
      };
      continue;
    }
    if (target.role === "Diseased") {
      nextState = {
        ...nextState,
        roleState: {
          ...nextState.roleState,
          diseasedWolvesBlockedNight: nextState.day + 1,
        },
      };
    }
    if (wolfTarget !== guarded && !nextState.nightActions.witchSave) {
      deaths.push(wolfTarget);
    }
  }

  if (typeof nextState.nightActions.bigBadWolfTarget === "number") {
    deaths.push(nextState.nightActions.bigBadWolfTarget);
  }

  if (typeof nextState.nightActions.witchPoison === "number") {
    deaths.push(nextState.nightActions.witchPoison);
  }

  deaths = [...new Set(deaths)];
  let next = killSeats(nextState, deaths);
  next = {
    ...next,
    phase: "DAY_DISCUSSION",
    nightHistory: {
      ...next.nightHistory,
      [next.day]: {
        wolfTarget: next.nightActions.wolfTarget,
        guardTarget: next.nightActions.guardTarget,
        wolfTargets,
        witchSave: next.nightActions.witchSave,
        witchPoison: next.nightActions.witchPoison,
        deaths,
      },
    },
  };
  next = withPhaseTimer(next, DISCUSSION_DURATION_MS);

  const deathText =
    deaths.length === 0
      ? "Day breaks. Nobody died last night."
      : `Day breaks. ${deaths.map((seat) => `Seat ${seat + 1}`).join(", ")} died last night.`;
  next = addSystemMessage(next, deathText);
  const withHunterShot = enterHunterShotIfNeeded(next, deaths, "DAY_DISCUSSION");
  if (withHunterShot.phase === "HUNTER_SHOOT") return withHunterShot;

  const winner = checkWinner(next);
  if (winner) {
    return addSystemMessage(clearPhaseTimer({ ...next, phase: "GAME_END", winner }), winnerMessage(winner));
  }

  return next;
}

function resolveVotes(state: MultiplayerGameState): MultiplayerGameState {
  const counts: Record<number, number> = {};
  for (const targetSeat of Object.values(state.votes)) {
    counts[targetSeat] = (counts[targetSeat] || 0) + 1;
  }

  const entries = Object.entries(counts).map(([seat, count]) => ({ seat: Number(seat), count }));
  const max = Math.max(0, ...entries.map((entry) => entry.count));
  const top = entries.filter((entry) => entry.count === max);

  let next: MultiplayerGameState = clearPhaseTimer({ ...state, phase: "DAY_RESOLVE" });
  if (top.length !== 1 || max === 0) {
    next = {
      ...next,
      dayHistory: { ...next.dayHistory, [next.day]: { executedSeat: null, tied: true } },
    };
    return addSystemMessage(next, "The vote is tied. Nobody is executed.");
  }

  const executedSeat = top[0].seat;
  const executedBeforeDeath = next.players.find((p) => p.seat === executedSeat);
  if (executedBeforeDeath?.role === "Idiot" || executedBeforeDeath?.role === "Prince") {
    next = {
      ...next,
      players: next.players.map((player) => (
        player.seat === executedSeat ? { ...player, roleRevealed: true } : player
      )),
      dayHistory: { ...next.dayHistory, [next.day]: { executedSeat: null, tied: false } },
    };
    return addSystemMessage(next, `${executedBeforeDeath.displayName} was voted out but revealed as ${executedBeforeDeath.role} and survives.`);
  }

  next = killSeats(next, [executedSeat]);
  next = {
    ...next,
    dayHistory: { ...next.dayHistory, [next.day]: { executedSeat, tied: false } },
  };

  const executed = next.players.find((p) => p.seat === executedSeat);
  next = addSystemMessage(next, `${executed?.displayName ?? `Seat ${executedSeat + 1}`} was executed.`);
  const withHunterShot = enterHunterShotIfNeeded(next, [executedSeat], "DAY_RESOLVE");
  if (withHunterShot.phase === "HUNTER_SHOOT") return withHunterShot;

  const winner = checkWinner(next);
  if (winner) {
    return addSystemMessage(
      clearPhaseTimer({ ...next, phase: "GAME_END", winner }),
      `${executed?.displayName ?? `Seat ${executedSeat + 1}`} was executed. ${winnerMessage(winner)}`
    );
  }

  return next;
}

function requireHost(room: MultiplayerRoom, clientId: string) {
  if (room.hostClientId !== clientId) {
    throw new Error("Only the host can do this.");
  }
}

function reindexSeats(seats: MultiplayerSeat[]): MultiplayerSeat[] {
  return seats.map((seat, index) => ({ ...seat, seat: index }));
}

function requirePlayer(state: MultiplayerGameState, clientId: string): MultiplayerPlayer {
  const player = state.players.find((p) => p.clientId === clientId);
  if (!player) throw new Error("You are not seated in this room.");
  return player;
}

function requireAliveTarget(state: MultiplayerGameState, targetSeat: number | null): MultiplayerPlayer {
  if (targetSeat === null) throw new Error("Invalid target.");
  const target = state.players.find((p) => p.seat === targetSeat && p.alive);
  if (!target) throw new Error("Invalid target.");
  return target;
}

function adjacentSeats(centerSeat: number, playerCount: number): number[] {
  if (playerCount <= 1) return [];
  return [
    (centerSeat - 1 + playerCount) % playerCount,
    (centerSeat + 1) % playerCount,
  ];
}

function piSeats(centerSeat: number, playerCount: number): number[] {
  return [...adjacentSeats(centerSeat, playerCount), centerSeat].sort((a, b) => a - b);
}

function roleLooksEvilToInvestigator(role: Role): boolean {
  return isWolfRole(role) || role === "Sorcerer" || role === "Lycan";
}

function beginVote(state: MultiplayerGameState, message: string): MultiplayerGameState {
  return addSystemMessage(withPhaseTimer({ ...state, phase: "DAY_VOTE", votes: {} }, VOTE_DURATION_MS), message);
}

export function autoAdvanceMultiplayerRoom(room: MultiplayerRoom, now = Date.now()): MultiplayerRoom {
  const state = room.state;
  if (!state?.phaseDeadlineAt || now < state.phaseDeadlineAt) return room;

  if (state.phase === "DAY_DISCUSSION") {
    return {
      ...room,
      state: beginVote(state, "Discussion time ended. Voting has started."),
      actionSeq: room.actionSeq + 1,
    };
  }

  if (state.phase === "DAY_VOTE") {
    const resolvedState = resolveVotes(state);
    return {
      ...room,
      status: resolvedState.phase === "GAME_END" ? "ended" : room.status,
      state: resolvedState,
      actionSeq: room.actionSeq + 1,
    };
  }

  return room;
}

export function reduceMultiplayerAction(room: MultiplayerRoom, action: MultiplayerAction): MultiplayerRoom {
  if (action.type === "LEAVE_ROOM") {
    if (room.status !== "lobby") throw new Error("Cannot leave after the game has started.");
    const nextSeats = reindexSeats(room.seats.filter((seat) => seat.clientId !== action.clientId));
    if (nextSeats.length === room.seats.length) return room;
    return {
      ...room,
      hostClientId: room.hostClientId === action.clientId ? (nextSeats[0]?.clientId ?? action.clientId) : room.hostClientId,
      seats: nextSeats,
      actionSeq: room.actionSeq + 1,
    };
  }

  if (action.type === "START_GAME") {
    requireHost(room, action.clientId);
    if (room.status !== "lobby") throw new Error("Game already started.");
    if (room.seats.length < MIN_PLAYERS_TO_START) throw new Error(`Need at least ${MIN_PLAYERS_TO_START} players to start.`);
    const configuredRoles = normalizeRoleConfig(room.roleConfig, room.seats.length, room.rolePreset);
    const roles = configuredRoles.length === room.seats.length ? configuredRoles : getDefaultMultiplayerRoles(room.seats.length, room.rolePreset);
    const configError = validateRoleConfig(roles);
    if (configError) throw new Error(configError);
    return {
      ...room,
      status: "playing",
      roleConfig: roles,
      state: clearPhaseTimer(createInitialMultiplayerState(reindexSeats(room.seats), roles)),
      actionSeq: room.actionSeq + 1,
    };
  }

  if (action.type === "UPDATE_ROLE_CONFIG") {
    requireHost(room, action.clientId);
    if (room.status !== "lobby") throw new Error("Cannot change roles after the game starts.");
    const roles = normalizeRoleConfig(action.roles, action.roles.length, action.preset ?? room.rolePreset);
    const configError = validateRoleConfig(roles);
    if (configError) throw new Error(configError);
    return {
      ...room,
      roleConfig: roles,
      rolePreset: action.preset ?? room.rolePreset ?? "classic",
      actionSeq: room.actionSeq + 1,
    };
  }

  const state = room.state;
  if (!state) throw new Error("Game has not started.");

  if (action.type === "CHAT") {
    const player = requirePlayer(state, action.clientId);
    if (!player.alive) throw new Error("Dead players cannot chat.");
    const canChatInPhase =
      state.phase === "DAY_DISCUSSION" ||
      state.phase === "DAY_VOTE" ||
      (state.phase === "NIGHT_WOLF_ACTION" && isWolfRole(player.role));
    if (!canChatInPhase) throw new Error("Chat is not available now.");
    const content = action.content.trim().slice(0, 800);
    if (!content) return room;
    const visibility = state.phase === "NIGHT_WOLF_ACTION" && isWolfRole(player.role) ? "wolves" : "public";
    return {
      ...room,
      state: {
        ...state,
        messages: [
          ...state.messages,
          {
            id: generateUUID(),
            clientId: action.clientId,
            seat: player.seat,
            playerName: player.displayName,
            content,
            timestamp: Date.now(),
            day: state.day,
            phase: state.phase,
            visibility,
          },
        ],
      },
      actionSeq: room.actionSeq + 1,
    };
  }

  if (action.type === "ACK_ROLE") {
    requirePlayer(state, action.clientId);
    if (state.phase !== "ROLE_REVEAL") return room;
    const roleAcks = { ...state.roleAcks, [action.clientId]: true };
    const allReady = state.players.every((p) => roleAcks[p.clientId]);
    if (!allReady) {
      return {
        ...room,
        state: { ...state, roleAcks },
        actionSeq: room.actionSeq + 1,
      };
    }
    return {
      ...room,
      state: maybeSkipNightPhase(nextNight({ ...state, roleAcks })),
      actionSeq: room.actionSeq + 1,
    };
  }

  if (action.type === "NIGHT_ACTION") {
    const player = requirePlayer(state, action.clientId);
    if (!player.alive) throw new Error("Dead players cannot act.");

    if (state.phase === "NIGHT_DOPPELGANGER_ACTION") {
      if (player.role !== "Doppelganger") throw new Error("Only the Doppelganger can act now.");
      const target = requireAliveTarget(state, action.targetSeat);
      if (target.clientId === player.clientId) throw new Error("Doppelganger cannot copy self.");
      return {
        ...room,
        state: maybeSkipNightPhase({
          ...state,
          roleState: {
            ...state.roleState,
            doppelgangerTargets: {
              ...state.roleState?.doppelgangerTargets,
              [player.clientId]: target.seat,
            },
          },
        }),
        actionSeq: room.actionSeq + 1,
      };
    }

    if (state.phase === "NIGHT_CUPID_ACTION") {
      if (player.role !== "Cupid") throw new Error("Only Cupid can act now.");
      const first = requireAliveTarget(state, action.targetSeat);
      const second = requireAliveTarget(state, action.secondTargetSeat ?? null);
      if (first.clientId === second.clientId) throw new Error("Cupid must choose two different players.");
      return {
        ...room,
        state: maybeSkipNightPhase({
          ...state,
          roleState: {
            ...state.roleState,
            lovers: [first.seat, second.seat],
          },
        }),
        actionSeq: room.actionSeq + 1,
      };
    }

    if (state.phase === "NIGHT_CULT_ACTION") {
      if (player.role !== "CultLeader") throw new Error("Only the Cult Leader can act now.");
      const target = requireAliveTarget(state, action.targetSeat);
      const cult = new Set(state.roleState?.cultMemberClientIds ?? [player.clientId]);
      cult.add(player.clientId);
      cult.add(target.clientId);
      return {
        ...room,
        state: maybeSkipNightPhase(enterNightPhase({
          ...state,
          roleState: {
            ...state.roleState,
            cultMemberClientIds: [...cult],
          },
        }, "NIGHT_GUARD_ACTION")),
        actionSeq: room.actionSeq + 1,
      };
    }

    if (state.phase === "NIGHT_GUARD_ACTION") {
      if (player.role !== "Guard") throw new Error("Only the Guard can act now.");
      const target = requireAliveTarget(state, action.targetSeat);
      if (target.clientId === player.clientId) {
        throw new Error("Guard must protect another player.");
      }
      if (target.seat === state.nightActions.lastGuardTarget) {
        throw new Error("Invalid guard target.");
      }
      return {
        ...room,
        state: maybeSkipNightPhase(enterNightPhase({
          ...state,
          nightActions: { ...state.nightActions, guardTarget: target.seat },
        }, "NIGHT_WOLF_ACTION")),
        actionSeq: room.actionSeq + 1,
      };
    }

    if (state.phase === "NIGHT_WOLF_ACTION") {
      if (!isWolfRole(player.role)) throw new Error("Only wolves can act now.");
      if (state.roleState?.diseasedWolvesBlockedNight === state.day) {
        throw new Error("Wolves are diseased tonight and cannot kill.");
      }
      const target = requireAliveTarget(state, action.targetSeat);
      if (isWolfRole(target.role)) throw new Error("Wolves cannot target wolves.");
      const wolfVotes = { ...state.nightActions.wolfVotes, [player.clientId]: target.seat };
      const aliveWolves = state.players.filter((p) => p.alive && isWolfRole(p.role));
      const allWolvesVoted = aliveWolves.every((wolf) => typeof wolfVotes[wolf.clientId] === "number");
      if (!allWolvesVoted) {
        return {
          ...room,
          state: { ...state, nightActions: { ...state.nightActions, wolfVotes } },
          actionSeq: room.actionSeq + 1,
        };
      }

      const counts: Record<number, number> = {};
      for (const seat of Object.values(wolfVotes)) counts[seat] = (counts[seat] || 0) + 1;
      const wolfKillCount = state.roleState?.wolfCubRevengeNight === state.day ? 2 : 1;
      const wolfTargets = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, wolfKillCount)
        .map(([seat]) => Number(seat));
      const wolfTarget = wolfTargets[0];
      const bigBadWolf = state.players.find((candidate) => candidate.alive && candidate.role === "BigBadWolf");
      const canBigBadWolfAct =
        !!bigBadWolf &&
        typeof wolfTarget === "number" &&
        adjacentSeats(bigBadWolf.seat, state.players.length).includes(wolfTarget);
      return {
        ...room,
        state: maybeSkipNightPhase(enterNightPhase({
          ...state,
          nightActions: { ...state.nightActions, wolfVotes, wolfTarget, wolfTargets },
        }, canBigBadWolfAct ? "NIGHT_BIG_BAD_WOLF_ACTION" : "NIGHT_WITCH_ACTION")),
        actionSeq: room.actionSeq + 1,
      };
    }

    if (state.phase === "NIGHT_BIG_BAD_WOLF_ACTION") {
      if (player.role !== "BigBadWolf") throw new Error("Only the Big Bad Wolf can act now.");
      if (action.targetSeat === null) {
        return {
          ...room,
          state: maybeSkipNightPhase(enterNightPhase(state, "NIGHT_WITCH_ACTION")),
          actionSeq: room.actionSeq + 1,
        };
      }
      const target = requireAliveTarget(state, action.targetSeat);
      if (!adjacentSeats(player.seat, state.players.length).includes(target.seat)) {
        throw new Error("Big Bad Wolf must choose an adjacent target.");
      }
      if (target.clientId === player.clientId || isWolfRole(target.role)) throw new Error("Invalid Big Bad Wolf target.");
      return {
        ...room,
        state: maybeSkipNightPhase(enterNightPhase({
          ...state,
          nightActions: { ...state.nightActions, bigBadWolfTarget: target.seat },
        }, "NIGHT_WITCH_ACTION")),
        actionSeq: room.actionSeq + 1,
      };
    }

    if (state.phase === "NIGHT_WITCH_ACTION") {
      if (player.role !== "Witch") throw new Error("Only the Witch can act now.");
      const nextAbilities = { ...state.roleAbilities };
      const nextNightActions = { ...state.nightActions };

      if (action.witchAction === "save") {
        if (nextAbilities.witchHealUsed) throw new Error("The healing potion has already been used.");
        if (typeof state.nightActions.wolfTarget !== "number") throw new Error("There is no wolf target to save.");
        nextAbilities.witchHealUsed = true;
        nextNightActions.witchSave = true;
      } else if (action.witchAction === "poison") {
        if (nextAbilities.witchPoisonUsed) throw new Error("The poison potion has already been used.");
        if (typeof action.targetSeat !== "number") throw new Error("Choose a target to poison.");
        const target = requireAliveTarget(state, action.targetSeat);
        nextAbilities.witchPoisonUsed = true;
        nextNightActions.witchPoison = target.seat;
      } else if (action.witchAction === "pass") {
        nextNightActions.witchSave = false;
      } else {
        throw new Error("Choose save, poison, or pass.");
      }

      return {
        ...room,
        state: maybeSkipNightPhase(enterNightPhase({
          ...state,
          roleAbilities: nextAbilities,
          nightActions: nextNightActions,
        }, "NIGHT_SEER_ACTION")),
        actionSeq: room.actionSeq + 1,
      };
    }

    if (state.phase === "NIGHT_SEER_ACTION") {
      if (player.role !== "Seer") throw new Error("Only the Seer can act now.");
      const target = requireAliveTarget(state, action.targetSeat);
      if (target.clientId === player.clientId) throw new Error("Seer cannot inspect self.");
      const seerChecks = {
        ...state.nightActions.seerChecks,
        [player.clientId]: [
          ...(state.nightActions.seerChecks[player.clientId] || []),
          { targetSeat: target.seat, isWolf: roleLooksEvilToInvestigator(target.role), targetRole: target.role, day: state.day },
        ],
      };

      return {
        ...room,
        state: maybeSkipNightPhase(enterNightPhase({
          ...state,
          nightActions: { ...state.nightActions, seerChecks },
        }, "NIGHT_SORCERER_ACTION")),
        actionSeq: room.actionSeq + 1,
      };
    }

    if (state.phase === "NIGHT_SORCERER_ACTION") {
      if (player.role !== "Sorcerer") throw new Error("Only the Sorcerer can act now.");
      const target = requireAliveTarget(state, action.targetSeat);
      if (target.clientId === player.clientId) throw new Error("Sorcerer cannot inspect self.");
      const result: "wolf" | "seer" | "other" = isWolfRole(target.role) ? "wolf" : target.role === "Seer" ? "seer" : "other";
      const sorcererChecks = {
        ...(state.nightActions.sorcererChecks ?? {}),
        [player.clientId]: [
          ...(state.nightActions.sorcererChecks?.[player.clientId] || []),
          { targetSeat: target.seat, result, day: state.day },
        ],
      };
      return {
        ...room,
        state: maybeSkipNightPhase(enterNightPhase({
          ...state,
          nightActions: { ...state.nightActions, sorcererChecks },
        }, "NIGHT_PI_ACTION")),
        actionSeq: room.actionSeq + 1,
      };
    }

    if (state.phase === "NIGHT_PI_ACTION") {
      if (player.role !== "PI") throw new Error("Only the P.I. can act now.");
      const target = requireAliveTarget(state, action.targetSeat);
      const seats = piSeats(target.seat, state.players.length);
      const hasEvil = seats.some((seat) => {
        const checked = state.players.find((candidate) => candidate.seat === seat);
        return checked ? roleLooksEvilToInvestigator(checked.role) : false;
      });
      const piChecks = {
        ...(state.nightActions.piChecks ?? {}),
        [player.clientId]: [
          ...(state.nightActions.piChecks?.[player.clientId] || []),
          { centerSeat: target.seat, seats, hasEvil, day: state.day },
        ],
      };
      return {
        ...room,
        state: resolveNight({
          ...state,
          nightActions: { ...state.nightActions, piChecks },
        }),
        actionSeq: room.actionSeq + 1,
      };
    }
  }

  if (action.type === "HUNTER_SHOOT") {
    const player = requirePlayer(state, action.clientId);
    if (state.phase !== "HUNTER_SHOOT" || !state.pendingHunterShot) {
      throw new Error("Hunter cannot shoot now.");
    }
    if (state.pendingHunterShot.hunterClientId !== player.clientId || player.role !== "Hunter") {
      throw new Error("Only the dead Hunter can shoot now.");
    }
    const target = requireAliveTarget(state, action.targetSeat);
    if (target.clientId === player.clientId) throw new Error("Hunter cannot shoot self.");

    let next = killSeats(state, [target.seat]);
    next = {
      ...next,
      phase: state.pendingHunterShot.resumePhase,
      pendingHunterShot: undefined,
      nightHistory: state.pendingHunterShot.resumePhase === "DAY_DISCUSSION"
        ? {
            ...next.nightHistory,
            [next.day]: {
              ...next.nightHistory[next.day],
              hunterShot: { hunterSeat: player.seat, targetSeat: target.seat },
            },
          }
        : next.nightHistory,
      dayHistory: state.pendingHunterShot.resumePhase === "DAY_RESOLVE"
        ? {
            ...next.dayHistory,
            [next.day]: {
              ...next.dayHistory[next.day],
              hunterShot: { hunterSeat: player.seat, targetSeat: target.seat },
            },
          }
        : next.dayHistory,
    };
    next = state.pendingHunterShot.resumePhase === "DAY_DISCUSSION"
      ? withPhaseTimer(next, DISCUSSION_DURATION_MS)
      : clearPhaseTimer(next);
    next = addSystemMessage(next, `Hunter ${player.displayName} shot ${target.displayName}.`);

    const winner = checkWinner(next);
    return {
      ...room,
      status: winner ? "ended" : room.status,
      state: winner
        ? addSystemMessage(clearPhaseTimer({ ...next, phase: "GAME_END", winner }), winnerMessage(winner))
        : next,
      actionSeq: room.actionSeq + 1,
    };
  }

  if (action.type === "START_VOTE") {
    requireHost(room, action.clientId);
    if (state.phase !== "DAY_DISCUSSION") throw new Error("Cannot start voting now.");
    return {
      ...room,
      state: beginVote(state, "Host ended discussion. Voting has started."),
      actionSeq: room.actionSeq + 1,
    };
  }

  if (action.type === "END_VOTE") {
    requireHost(room, action.clientId);
    if (state.phase !== "DAY_VOTE") throw new Error("Voting is not active.");
    return {
      ...room,
      state: resolveVotes(state),
      actionSeq: room.actionSeq + 1,
    };
  }

  if (action.type === "VOTE") {
    const player = requirePlayer(state, action.clientId);
    if (!player.alive) throw new Error("Dead players cannot vote.");
    if (state.phase !== "DAY_VOTE") throw new Error("Voting is not active.");
    const target = state.players.find((p) => p.seat === action.targetSeat && p.alive);
    if (!target) throw new Error("Invalid vote target.");
    const votes = { ...state.votes, [player.clientId]: action.targetSeat };
    const alivePlayers = state.players.filter((p) => p.alive);
    const allVoted = alivePlayers.every((p) => typeof votes[p.clientId] === "number");
    return {
      ...room,
      state: allVoted ? resolveVotes({ ...state, votes }) : { ...state, votes },
      actionSeq: room.actionSeq + 1,
    };
  }

  if (action.type === "NEXT_NIGHT") {
    requireHost(room, action.clientId);
    if (state.phase !== "DAY_RESOLVE") throw new Error("Cannot advance now.");
    return {
      ...room,
      state: maybeSkipNightPhase(nextNight(state)),
      actionSeq: room.actionSeq + 1,
    };
  }

  return room;
}
