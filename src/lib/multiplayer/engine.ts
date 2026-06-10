import { isWolfRole, type Alignment, type Role } from "@/types/game";
import { generateUUID } from "@/lib/utils";
import type {
  MultiplayerAction,
  MultiplayerChatMessage,
  MultiplayerGameState,
  MultiplayerPlayer,
  MultiplayerRoom,
  MultiplayerSeat,
} from "./types";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function getMultiplayerRoleConfiguration(playerCount: number): Role[] {
  const configs: Record<number, Role[]> = {
    8: ["Werewolf", "Werewolf", "Werewolf", "Seer", "Witch", "Hunter", "Villager", "Villager"],
    9: ["Werewolf", "Werewolf", "Werewolf", "Seer", "Witch", "Hunter", "Villager", "Villager", "Villager"],
    10: ["Werewolf", "Werewolf", "WhiteWolfKing", "Seer", "Witch", "Hunter", "Guard", "Villager", "Villager", "Villager"],
    11: ["Werewolf", "Werewolf", "Werewolf", "WhiteWolfKing", "Seer", "Witch", "Hunter", "Guard", "Idiot", "Villager", "Villager"],
    12: ["Werewolf", "Werewolf", "Werewolf", "WhiteWolfKing", "Seer", "Witch", "Hunter", "Guard", "Idiot", "Villager", "Villager", "Villager"],
  };
  return (configs[playerCount] ?? configs[10]).slice();
}

export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export function createRoomCode(): string {
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return out;
}

export function clampPlayerCount(value: number): number {
  if (!Number.isFinite(value)) return 10;
  return Math.min(12, Math.max(8, Math.round(value)));
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

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
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

function getAlignment(role: Role): Alignment {
  return isWolfRole(role) ? "wolf" : "village";
}

function checkWinner(players: MultiplayerPlayer[]): Alignment | null {
  const alive = players.filter((p) => p.alive);
  const wolves = alive.filter((p) => isWolfRole(p.role)).length;
  const village = alive.length - wolves;
  if (wolves === 0) return "village";
  if (wolves >= village) return "wolf";
  return null;
}

function killSeats(state: MultiplayerGameState, seats: number[]): MultiplayerGameState {
  if (seats.length === 0) return state;
  const dead = new Set(seats);
  return {
    ...state,
    players: state.players.map((p) => (dead.has(p.seat) ? { ...p, alive: false } : p)),
  };
}

function nextNight(state: MultiplayerGameState): MultiplayerGameState {
  const lastGuardTarget = state.nightActions.guardTarget ?? state.nightActions.lastGuardTarget;
  return addSystemMessage(
    {
      ...state,
      phase: "NIGHT_GUARD_ACTION",
      day: state.day + 1,
      votes: {},
      nightActions: {
        lastGuardTarget,
        wolfVotes: {},
        seerChecks: state.nightActions.seerChecks,
      },
    },
    `Night ${state.day + 1} begins.`
  );
}

export function createInitialMultiplayerState(seats: MultiplayerSeat[]): MultiplayerGameState {
  const roles = shuffle(getMultiplayerRoleConfiguration(seats.length));
  const players = seats.map<MultiplayerPlayer>((seat, index) => {
    const role = roles[index] ?? "Villager";
    return {
      ...seat,
      alive: true,
      role,
      alignment: getAlignment(role),
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
      seerChecks: {},
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

  return addSystemMessage(base, "Game started. Check your role, then the first night will begin.");
}

function maybeSkipNightPhase(state: MultiplayerGameState): MultiplayerGameState {
  if (state.phase === "NIGHT_GUARD_ACTION") {
    const guard = state.players.find((p) => p.alive && p.role === "Guard");
    if (!guard) return { ...state, phase: "NIGHT_WOLF_ACTION" };
  }

  if (state.phase === "NIGHT_WITCH_ACTION") {
    const witch = state.players.find((p) => p.alive && p.role === "Witch");
    if (!witch || (state.roleAbilities.witchHealUsed && state.roleAbilities.witchPoisonUsed)) {
      return { ...state, phase: "NIGHT_SEER_ACTION" };
    }
  }

  if (state.phase === "NIGHT_SEER_ACTION") {
    const seer = state.players.find((p) => p.alive && p.role === "Seer");
    if (!seer) return resolveNight(state);
  }

  return state;
}

function resolveNight(state: MultiplayerGameState): MultiplayerGameState {
  let deaths: number[] = [];
  const wolfTarget = state.nightActions.wolfTarget;
  const guarded = state.nightActions.guardTarget;

  if (
    typeof wolfTarget === "number" &&
    wolfTarget !== guarded &&
    !state.nightActions.witchSave
  ) {
    deaths.push(wolfTarget);
  }

  if (typeof state.nightActions.witchPoison === "number") {
    deaths.push(state.nightActions.witchPoison);
  }

  deaths = [...new Set(deaths)];
  let next = killSeats(state, deaths);
  next = {
    ...next,
    phase: "DAY_DISCUSSION",
    nightHistory: {
      ...next.nightHistory,
      [next.day]: {
        wolfTarget: next.nightActions.wolfTarget,
        guardTarget: next.nightActions.guardTarget,
        witchSave: next.nightActions.witchSave,
        witchPoison: next.nightActions.witchPoison,
        deaths,
      },
    },
  };

  const winner = checkWinner(next.players);
  if (winner) {
    return addSystemMessage({ ...next, phase: "GAME_END", winner }, winner === "wolf" ? "Werewolves win." : "Village wins.");
  }

  const deathText =
    deaths.length === 0
      ? "Day breaks. Nobody died last night."
      : `Day breaks. ${deaths.map((seat) => `Seat ${seat + 1}`).join(", ")} died last night.`;
  return addSystemMessage(next, deathText);
}

function resolveVotes(state: MultiplayerGameState): MultiplayerGameState {
  const counts: Record<number, number> = {};
  for (const targetSeat of Object.values(state.votes)) {
    counts[targetSeat] = (counts[targetSeat] || 0) + 1;
  }

  const entries = Object.entries(counts).map(([seat, count]) => ({ seat: Number(seat), count }));
  const max = Math.max(0, ...entries.map((entry) => entry.count));
  const top = entries.filter((entry) => entry.count === max);

  let next: MultiplayerGameState = { ...state, phase: "DAY_RESOLVE" };
  if (top.length !== 1 || max === 0) {
    next = {
      ...next,
      dayHistory: { ...next.dayHistory, [next.day]: { executedSeat: null, tied: true } },
    };
    return addSystemMessage(next, "The vote is tied. Nobody is executed.");
  }

  const executedSeat = top[0].seat;
  next = killSeats(next, [executedSeat]);
  next = {
    ...next,
    dayHistory: { ...next.dayHistory, [next.day]: { executedSeat, tied: false } },
  };

  const executed = next.players.find((p) => p.seat === executedSeat);
  const winner = checkWinner(next.players);
  if (winner) {
    return addSystemMessage(
      { ...next, phase: "GAME_END", winner },
      `${executed?.displayName ?? `Seat ${executedSeat + 1}`} was executed. ${winner === "wolf" ? "Werewolves win." : "Village wins."}`
    );
  }

  return addSystemMessage(next, `${executed?.displayName ?? `Seat ${executedSeat + 1}`} was executed.`);
}

function requireHost(room: MultiplayerRoom, clientId: string) {
  if (room.hostClientId !== clientId) {
    throw new Error("Only the host can do this.");
  }
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

export function reduceMultiplayerAction(room: MultiplayerRoom, action: MultiplayerAction): MultiplayerRoom {
  if (action.type === "START_GAME") {
    requireHost(room, action.clientId);
    if (room.status !== "lobby") throw new Error("Game already started.");
    if (room.seats.length !== room.playerCount) throw new Error("Room is not full yet.");
    return {
      ...room,
      status: "playing",
      state: createInitialMultiplayerState(room.seats),
      actionSeq: room.actionSeq + 1,
    };
  }

  const state = room.state;
  if (!state) throw new Error("Game has not started.");

  if (action.type === "CHAT") {
    const player = requirePlayer(state, action.clientId);
    const content = action.content.trim().slice(0, 800);
    if (!content) return room;
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

    if (state.phase === "NIGHT_GUARD_ACTION") {
      if (player.role !== "Guard") throw new Error("Only the Guard can act now.");
      const target = requireAliveTarget(state, action.targetSeat);
      if (target.seat === state.nightActions.lastGuardTarget) {
        throw new Error("Invalid guard target.");
      }
      return {
        ...room,
        state: maybeSkipNightPhase({
          ...state,
          phase: "NIGHT_WOLF_ACTION",
          nightActions: { ...state.nightActions, guardTarget: target.seat },
        }),
        actionSeq: room.actionSeq + 1,
      };
    }

    if (state.phase === "NIGHT_WOLF_ACTION") {
      if (!isWolfRole(player.role)) throw new Error("Only wolves can act now.");
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
      const wolfTarget = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
      return {
        ...room,
        state: maybeSkipNightPhase({
          ...state,
          phase: "NIGHT_WITCH_ACTION",
          nightActions: { ...state.nightActions, wolfVotes, wolfTarget },
        }),
        actionSeq: room.actionSeq + 1,
      };
    }

    if (state.phase === "NIGHT_WITCH_ACTION") {
      if (player.role !== "Witch") throw new Error("Only the Witch can act now.");
      const nextAbilities = { ...state.roleAbilities };
      const nextNightActions = { ...state.nightActions };

      if (action.witchAction === "save" && !nextAbilities.witchHealUsed) {
        nextAbilities.witchHealUsed = true;
        nextNightActions.witchSave = true;
      } else if (action.witchAction === "poison" && !nextAbilities.witchPoisonUsed && typeof action.targetSeat === "number") {
        const target = requireAliveTarget(state, action.targetSeat);
        nextAbilities.witchPoisonUsed = true;
        nextNightActions.witchPoison = target.seat;
      } else {
        nextNightActions.witchSave = false;
      }

      return {
        ...room,
        state: maybeSkipNightPhase({
          ...state,
          phase: "NIGHT_SEER_ACTION",
          roleAbilities: nextAbilities,
          nightActions: nextNightActions,
        }),
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
          { targetSeat: target.seat, isWolf: isWolfRole(target.role), day: state.day },
        ],
      };

      return {
        ...room,
        state: resolveNight({
          ...state,
          nightActions: { ...state.nightActions, seerChecks },
        }),
        actionSeq: room.actionSeq + 1,
      };
    }
  }

  if (action.type === "START_VOTE") {
    requireHost(room, action.clientId);
    if (state.phase !== "DAY_DISCUSSION") throw new Error("Cannot start voting now.");
    return {
      ...room,
      state: addSystemMessage({ ...state, phase: "DAY_VOTE", votes: {} }, "Voting has started."),
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
