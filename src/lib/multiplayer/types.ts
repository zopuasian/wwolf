import type { Alignment, Phase, Role } from "@/types/game";

export type MultiplayerRoomStatus = "lobby" | "playing" | "ended";

export type MultiplayerPhase =
  | "LOBBY"
  | "ROLE_REVEAL"
  | "NIGHT_GUARD_ACTION"
  | "NIGHT_WOLF_ACTION"
  | "NIGHT_WITCH_ACTION"
  | "NIGHT_SEER_ACTION"
  | "NIGHT_RESOLVE"
  | "DAY_DISCUSSION"
  | "DAY_VOTE"
  | "DAY_RESOLVE"
  | "GAME_END";

export interface MultiplayerSeat {
  clientId: string;
  seat: number;
  displayName: string;
  avatarSeed: string;
  joinedAt: number;
}

export interface MultiplayerPlayer extends MultiplayerSeat {
  alive: boolean;
  role: Role;
  alignment: Alignment;
  roleRevealed?: boolean;
}

export interface MultiplayerChatMessage {
  id: string;
  clientId: string;
  seat: number | null;
  playerName: string;
  content: string;
  timestamp: number;
  day: number;
  phase: MultiplayerPhase;
  isSystem?: boolean;
}

export interface MultiplayerGameState {
  phase: MultiplayerPhase;
  day: number;
  players: MultiplayerPlayer[];
  messages: MultiplayerChatMessage[];
  roleAcks: Record<string, boolean>;
  nightActions: {
    guardTarget?: number;
    lastGuardTarget?: number;
    wolfVotes: Record<string, number>;
    wolfTarget?: number;
    witchSave?: boolean;
    witchPoison?: number;
    seerChecks: Record<string, { targetSeat: number; isWolf: boolean; day: number }[]>;
  };
  roleAbilities: {
    witchHealUsed: boolean;
    witchPoisonUsed: boolean;
  };
  votes: Record<string, number>;
  dayHistory: Record<number, { executedSeat?: number | null; tied?: boolean }>;
  nightHistory: Record<number, { wolfTarget?: number; guardTarget?: number; witchSave?: boolean; witchPoison?: number; deaths: number[] }>;
  winner: Alignment | null;
}

export interface MultiplayerRoom {
  code: string;
  hostClientId: string;
  playerCount: number;
  status: MultiplayerRoomStatus;
  seats: MultiplayerSeat[];
  state: MultiplayerGameState | null;
  actionSeq: number;
  updatedAt?: string;
}

export type MultiplayerAction =
  | { type: "START_GAME"; clientId: string }
  | { type: "ACK_ROLE"; clientId: string }
  | { type: "CHAT"; clientId: string; content: string }
  | { type: "NIGHT_ACTION"; clientId: string; targetSeat: number | null; witchAction?: "save" | "poison" | "pass" }
  | { type: "START_VOTE"; clientId: string }
  | { type: "VOTE"; clientId: string; targetSeat: number }
  | { type: "NEXT_NIGHT"; clientId: string };

export function toGamePhase(phase: MultiplayerPhase): Phase {
  switch (phase) {
    case "LOBBY":
      return "LOBBY";
    case "ROLE_REVEAL":
      return "NIGHT_START";
    case "NIGHT_GUARD_ACTION":
      return "NIGHT_GUARD_ACTION";
    case "NIGHT_WOLF_ACTION":
      return "NIGHT_WOLF_ACTION";
    case "NIGHT_WITCH_ACTION":
      return "NIGHT_WITCH_ACTION";
    case "NIGHT_SEER_ACTION":
      return "NIGHT_SEER_ACTION";
    case "NIGHT_RESOLVE":
      return "NIGHT_RESOLVE";
    case "DAY_DISCUSSION":
      return "DAY_SPEECH";
    case "DAY_VOTE":
      return "DAY_VOTE";
    case "DAY_RESOLVE":
      return "DAY_RESOLVE";
    case "GAME_END":
      return "GAME_END";
  }
}
