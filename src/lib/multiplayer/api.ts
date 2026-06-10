import type { Json } from "@/types/database";
import type { MultiplayerRoom, MultiplayerSeat } from "./types";
import { isWolfRole } from "@/types/game";

export type DbRoom = {
  code: string;
  host_client_id: string;
  player_count: number;
  status: "lobby" | "playing" | "ended";
  seats: Json;
  state: Json;
  action_seq: number;
  updated_at?: string;
};

export function dbRoomToRoom(row: DbRoom): MultiplayerRoom {
  return {
    code: row.code,
    hostClientId: row.host_client_id,
    playerCount: row.player_count,
    status: row.status,
    seats: Array.isArray(row.seats) ? (row.seats as unknown as MultiplayerSeat[]) : [],
    state:
      row.state &&
      typeof row.state === "object" &&
      !Array.isArray(row.state) &&
      "phase" in row.state
        ? (row.state as unknown as MultiplayerRoom["state"])
        : null,
    actionSeq: row.action_seq,
    updatedAt: row.updated_at,
  };
}

export function roomToDbPatch(room: MultiplayerRoom) {
  return {
    host_client_id: room.hostClientId,
    player_count: room.playerCount,
    status: room.status,
    seats: room.seats as unknown as Json,
    state: (room.state ?? {}) as unknown as Json,
    action_seq: room.actionSeq,
  };
}

export function sanitizeRoomForClient(room: MultiplayerRoom, clientId: string): MultiplayerRoom {
  if (!room.state) return room;
  const viewer = room.state.players.find((p) => p.clientId === clientId) ?? null;
  return {
    ...room,
    state: {
      ...room.state,
      players: room.state.players.map((player) => {
        const canSeeRole =
          player.clientId === clientId ||
          room.state?.phase === "GAME_END" ||
          !player.alive ||
          (!!viewer && isWolfRole(viewer.role) && isWolfRole(player.role));
        if (canSeeRole) {
          return { ...player, roleRevealed: true };
        }
        return {
          ...player,
          role: "Villager",
          alignment: "village",
          roleRevealed: false,
        };
      }),
    },
  };
}
