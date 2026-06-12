import type { Json } from "@/types/database";
import type { MultiplayerRoom, MultiplayerSeat } from "./types";
import { isWolfRole } from "@/types/game";
import { getDefaultMultiplayerRoles, normalizeRoleConfig, type MultiplayerRolePreset } from "./roles";

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
  const stateObject =
    row.state &&
    typeof row.state === "object" &&
    !Array.isArray(row.state)
      ? (row.state as Record<string, unknown>)
      : null;
  const rolePreset = typeof stateObject?.rolePreset === "string" ? stateObject.rolePreset as MultiplayerRolePreset : "classic";
  const statePlayers = Array.isArray(stateObject?.players) ? stateObject.players : null;
  const lobbyMessages = Array.isArray(stateObject?.lobbyMessages)
    ? stateObject.lobbyMessages as MultiplayerRoom["lobbyMessages"]
    : [];
  const storedPlayerCount = typeof stateObject?.playerCount === "number" ? stateObject.playerCount : null;
  const playerCount = statePlayers?.length ?? storedPlayerCount ?? row.player_count;
  return {
    code: row.code,
    hostClientId: row.host_client_id,
    playerCount,
    status: row.status,
    seats: Array.isArray(row.seats) ? (row.seats as unknown as MultiplayerSeat[]) : [],
    state: stateObject && "phase" in stateObject ? (row.state as unknown as MultiplayerRoom["state"]) : null,
    lobbyMessages,
    roleConfig: normalizeRoleConfig(stateObject?.roleConfig, playerCount, rolePreset),
    rolePreset,
    actionSeq: row.action_seq,
    updatedAt: row.updated_at,
  };
}

export function roomToDbPatch(room: MultiplayerRoom) {
  return {
    host_client_id: room.hostClientId,
    // Older deployed Supabase tables may still have an 8-12 check constraint.
    // Keep the true 5-12 room size in JSON state and store a DB-compatible mirror.
    player_count: Math.max(8, room.playerCount),
    status: room.status,
    seats: room.seats as unknown as Json,
    state: (room.state ?? {
      playerCount: room.playerCount,
      lobbyMessages: room.lobbyMessages ?? [],
      roleConfig: room.roleConfig ?? getDefaultMultiplayerRoles(room.playerCount, room.rolePreset),
      rolePreset: room.rolePreset ?? "classic",
    }) as unknown as Json,
    action_seq: room.actionSeq,
  };
}

export function sanitizeRoomForClient(room: MultiplayerRoom, clientId: string): MultiplayerRoom {
  if (!room.state) return room;
  const viewer = room.state.players.find((p) => p.clientId === clientId) ?? null;
  const canSeeNightTarget =
    room.state.phase === "GAME_END" ||
    (room.state.phase === "NIGHT_WITCH_ACTION" && viewer?.role === "Witch");
  const canSeeWolfVotes =
    room.state.phase === "GAME_END" ||
    ((room.state.phase === "NIGHT_WOLF_ACTION" || room.state.phase === "NIGHT_BIG_BAD_WOLF_ACTION") && !!viewer && isWolfRole(viewer.role));
  return {
    ...room,
    state: {
      ...room.state,
      messages: room.state.messages.filter((message) => {
        if (message.visibility !== "wolves") return true;
        return room.state?.phase === "GAME_END" || (!!viewer && isWolfRole(viewer.role));
      }),
      nightActions: {
        lastGuardTarget: viewer?.role === "Guard" ? room.state.nightActions.lastGuardTarget : undefined,
        wolfVotes: canSeeWolfVotes ? room.state.nightActions.wolfVotes : {},
        wolfTarget: canSeeNightTarget ? room.state.nightActions.wolfTarget : undefined,
        wolfTargets: room.state.phase === "GAME_END" ? room.state.nightActions.wolfTargets : undefined,
        bigBadWolfRecruitVotes: canSeeWolfVotes ? room.state.nightActions.bigBadWolfRecruitVotes : {},
        bigBadWolfRecruitTarget: room.state.phase === "GAME_END" ? room.state.nightActions.bigBadWolfRecruitTarget : undefined,
        witchSave: room.state.phase === "GAME_END" ? room.state.nightActions.witchSave : undefined,
        witchPoison: room.state.phase === "GAME_END" ? room.state.nightActions.witchPoison : undefined,
        seerChecks: viewer?.role === "Seer"
          ? { [clientId]: room.state.nightActions.seerChecks[clientId] ?? [] }
          : {},
        sorcererChecks: viewer?.role === "Sorcerer"
          ? { [clientId]: room.state.nightActions.sorcererChecks?.[clientId] ?? [] }
          : {},
        piChecks: viewer?.role === "PI"
          ? { [clientId]: room.state.nightActions.piChecks?.[clientId] ?? [] }
          : {},
      },
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
