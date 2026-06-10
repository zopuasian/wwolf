import { NextResponse } from "next/server";
import { sanitizeRoomForClient } from "@/lib/multiplayer/api";
import {
  createInitialMultiplayerState,
  createRoomCode,
  createSeat,
  reduceMultiplayerAction,
} from "@/lib/multiplayer/engine";
import {
  createStoredRoom,
  deleteStoredRoom,
  getStoredRoom,
  serializeStoreError,
  updateStoredRoomIfSeq,
} from "@/lib/multiplayer/room-store";
import type { Alignment, Role } from "@/types/game";
import type { MultiplayerGameState, MultiplayerPlayer, MultiplayerRoom, MultiplayerSeat } from "@/lib/multiplayer/types";

export const runtime = "nodejs";

const VISIBLE_TEST_ROLES: Array<{ name: string; role: Role; alignment: Alignment }> = [
  { name: "Aki", role: "Seer", alignment: "village" },
  { name: "Wolf", role: "Werewolf", alignment: "wolf" },
  { name: "Witch", role: "Witch", alignment: "village" },
  { name: "Guard", role: "Guard", alignment: "village" },
  { name: "Hunter", role: "Hunter", alignment: "village" },
  { name: "Villager", role: "Villager", alignment: "village" },
];

type DriverAction =
  | "setup"
  | "ack-all"
  | "seer-check"
  | "show-witch"
  | "witch-save"
  | "show-hunter"
  | "hunter-shoot"
  | "cleanup";

function isDisabledInThisRuntime() {
  return process.env.NODE_ENV === "production";
}

function botClientId(hostClientId: string, index: number) {
  return `${hostClientId}:visible-test-bot-${index}`;
}

function createVisibleTestSeats(hostClientId: string): MultiplayerSeat[] {
  return VISIBLE_TEST_ROLES.map((player, index) => (
    createSeat(index === 0 ? hostClientId : botClientId(hostClientId, index), player.name, index)
  ));
}

function forceVisibleTestState(state: MultiplayerGameState, hostClientId: string): MultiplayerGameState {
  return {
    ...state,
    day: 1,
    roleAcks: {},
    pendingHunterShot: undefined,
    winner: null,
    votes: {},
    roleAbilities: {
      witchHealUsed: false,
      witchPoisonUsed: false,
    },
    nightActions: {
      wolfVotes: {},
      seerChecks: {},
    },
    players: state.players.map<MultiplayerPlayer>((player, index) => {
      const testRole = VISIBLE_TEST_ROLES[index] ?? VISIBLE_TEST_ROLES[0];
      return {
        ...player,
        clientId: index === 0 ? hostClientId : botClientId(hostClientId, index),
        displayName: testRole.name,
        avatarSeed: index === 0 ? hostClientId : botClientId(hostClientId, index),
        alive: true,
        role: testRole.role,
        alignment: testRole.alignment,
        roleRevealed: index === 0,
      };
    }),
  };
}

function setHostRole(state: MultiplayerGameState, role: Role, alignment: Alignment): MultiplayerGameState {
  return {
    ...state,
    players: state.players.map((player, index) => (
      index === 0 ? { ...player, role, alignment, roleRevealed: true } : player
    )),
  };
}

async function loadRoom(code: string) {
  const result = await getStoredRoom(code);
  if (!result.ok) {
    return { error: NextResponse.json({ error: "Could not load room", details: serializeStoreError(result.error) }, { status: 500 }) };
  }
  if (!result.value) {
    return { error: NextResponse.json({ error: "Room not found" }, { status: 404 }) };
  }
  return { room: result.value };
}

async function saveRoom(expectedSeq: number, room: MultiplayerRoom) {
  const updated = await updateStoredRoomIfSeq(room.code, expectedSeq, room);
  if (!updated.ok) {
    return { error: NextResponse.json({ error: "Could not update room", details: serializeStoreError(updated.error) }, { status: 500 }) };
  }
  if (!updated.value) {
    return { error: NextResponse.json({ error: "Room changed, retry the test step" }, { status: 409 }) };
  }
  return { room: updated.value };
}

async function createVisibleTestRoom(hostClientId: string) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createRoomCode();
    const seats = createVisibleTestSeats(hostClientId);
    const state = forceVisibleTestState(createInitialMultiplayerState(seats), hostClientId);
    const room: MultiplayerRoom = {
      code,
      hostClientId,
      playerCount: 8,
      status: "playing",
      seats,
      state,
      actionSeq: 0,
    };
    const result = await createStoredRoom(room);
    if (result.ok) return result.value;
    lastError = result.error;
  }
  throw lastError instanceof Error ? lastError : new Error("Could not create visible test room.");
}

export async function POST(req: Request) {
  if (isDisabledInThisRuntime()) {
    return NextResponse.json({ error: "Visible multiplayer test driver is disabled in production." }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "") as DriverAction;
    const clientId = String(body.clientId || "").trim();
    const code = String(body.code || "").trim().toUpperCase();

    if (!clientId) {
      return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
    }

    if (action === "setup") {
      const room = await createVisibleTestRoom(clientId);
      return NextResponse.json({ room: sanitizeRoomForClient(room, clientId), code: room.code });
    }

    if (action === "cleanup") {
      if (!code) return NextResponse.json({ ok: true });
      const deleted = await deleteStoredRoom(code);
      if (!deleted.ok) {
        return NextResponse.json({ error: "Could not clean up room", details: serializeStoreError(deleted.error) }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (!code) {
      return NextResponse.json({ error: "Missing room code" }, { status: 400 });
    }

    const loaded = await loadRoom(code);
    if (loaded.error) return loaded.error;
    const room = loaded.room;
    if (!room.state) return NextResponse.json({ error: "Game has not started" }, { status: 400 });

    let nextRoom: MultiplayerRoom;

    if (action === "ack-all") {
      const state = forceVisibleTestState(room.state, clientId);
      nextRoom = {
        ...room,
        state: {
          ...state,
          phase: "NIGHT_SEER_ACTION",
          roleAcks: Object.fromEntries(state.players.map((player) => [player.clientId, true])),
          messages: [
            ...state.messages,
            {
              id: `visible-test-${Date.now()}`,
              clientId: "system",
              seat: null,
              playerName: "Host",
              content: "Visible test: role accepted, jumping to Seer action.",
              timestamp: Date.now(),
              day: state.day,
              phase: "NIGHT_SEER_ACTION",
              isSystem: true,
            },
          ],
        },
        actionSeq: room.actionSeq + 1,
      };
    } else if (action === "seer-check") {
      const state = {
        ...setHostRole(forceVisibleTestState(room.state, clientId), "Seer", "village"),
        phase: "NIGHT_SEER_ACTION" as const,
      };
      nextRoom = reduceMultiplayerAction({ ...room, state }, { type: "NIGHT_ACTION", clientId, targetSeat: 1 });
    } else if (action === "show-witch") {
      const state = {
        ...setHostRole(forceVisibleTestState(room.state, clientId), "Witch", "village"),
        phase: "NIGHT_WITCH_ACTION" as const,
        nightActions: {
          wolfVotes: {},
          wolfTarget: 4,
          seerChecks: room.state.nightActions.seerChecks,
        },
      };
      nextRoom = { ...room, state, actionSeq: room.actionSeq + 1 };
    } else if (action === "witch-save") {
      const state = {
        ...setHostRole(room.state, "Witch", "village"),
        phase: "NIGHT_WITCH_ACTION" as const,
        nightActions: {
          ...room.state.nightActions,
          wolfTarget: 4,
        },
      };
      nextRoom = reduceMultiplayerAction({ ...room, state }, { type: "NIGHT_ACTION", clientId, targetSeat: null, witchAction: "save" });
    } else if (action === "show-hunter") {
      const state = {
        ...setHostRole(forceVisibleTestState(room.state, clientId), "Hunter", "village"),
        phase: "HUNTER_SHOOT" as const,
        players: forceVisibleTestState(room.state, clientId).players.map((player, index) => (
          index === 0 ? { ...player, alive: false, role: "Hunter" as Role, alignment: "village" as Alignment } : player
        )),
        pendingHunterShot: {
          hunterClientId: clientId,
          hunterSeat: 0,
          resumePhase: "DAY_RESOLVE" as const,
        },
      };
      nextRoom = { ...room, state, actionSeq: room.actionSeq + 1 };
    } else if (action === "hunter-shoot") {
      const state = {
        ...setHostRole(room.state, "Hunter", "village"),
        phase: "HUNTER_SHOOT" as const,
        pendingHunterShot: {
          hunterClientId: clientId,
          hunterSeat: 0,
          resumePhase: "DAY_RESOLVE" as const,
        },
      };
      nextRoom = reduceMultiplayerAction({ ...room, state }, { type: "HUNTER_SHOOT", clientId, targetSeat: 1 });
    } else {
      return NextResponse.json({ error: "Unknown test action" }, { status: 400 });
    }

    const saved = await saveRoom(room.actionSeq, nextRoom);
    if (saved.error) return saved.error;
    return NextResponse.json({ room: sanitizeRoomForClient(saved.room, clientId), code: saved.room.code });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
