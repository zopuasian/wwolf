import type { Alignment, Phase, Role } from "@/types/game";
import type { MultiplayerRolePreset } from "./roles";

export type MultiplayerRoomStatus = "lobby" | "playing" | "ended";

export type MultiplayerPhase =
  | "LOBBY"
  | "ROLE_REVEAL"
  | "NIGHT_DOPPELGANGER_ACTION"
  | "NIGHT_CUPID_ACTION"
  | "NIGHT_CULT_ACTION"
  | "NIGHT_GUARD_ACTION"
  | "NIGHT_WOLF_ACTION"
  | "NIGHT_BIG_BAD_WOLF_ACTION"
  | "NIGHT_WITCH_ACTION"
  | "NIGHT_SEER_ACTION"
  | "NIGHT_SORCERER_ACTION"
  | "NIGHT_PI_ACTION"
  | "NIGHT_RESOLVE"
  | "HUNTER_SHOOT"
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
  isBot?: boolean;
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
  visibility?: "public" | "wolves";
}

export interface MultiplayerGameState {
  phase: MultiplayerPhase;
  phaseStartedAt?: number;
  phaseDeadlineAt?: number;
  day: number;
  players: MultiplayerPlayer[];
  messages: MultiplayerChatMessage[];
  roleAcks: Record<string, boolean>;
  nightActions: {
    guardTarget?: number;
    lastGuardTarget?: number;
    wolfVotes: Record<string, number>;
    wolfVoteTurnIndex?: number;
    wolfTieSeats?: number[];
    wolfTargetConfirmedAt?: number;
    wolfTarget?: number;
    wolfTargets?: number[];
    bigBadWolfRecruitVotes?: Record<string, number>;
    bigBadWolfRecruitTurnIndex?: number;
    bigBadWolfRecruitTieSeats?: number[];
    bigBadWolfRecruitConfirmedAt?: number;
    bigBadWolfRecruitTarget?: number;
    witchSave?: boolean;
    witchPoison?: number;
    seerChecks: Record<string, { targetSeat: number; isWolf: boolean; targetRole: Role; day: number }[]>;
    sorcererChecks?: Record<string, { targetSeat: number; result: "wolf" | "seer" | "other"; day: number }[]>;
    piChecks?: Record<string, { centerSeat: number; seats: number[]; hasEvil: boolean; day: number }[]>;
  };
  roleAbilities: {
    witchHealUsed: boolean;
    witchPoisonUsed: boolean;
  };
  pendingHunterShot?: {
    hunterClientId: string;
    hunterSeat: number;
    resumePhase: "DAY_DISCUSSION" | "DAY_RESOLVE";
  };
  roleState?: {
    lovers?: number[];
    cultMemberClientIds?: string[];
    doppelgangerTargets?: Record<string, number>;
    wolfCubRevengePending?: boolean;
    wolfCubRevengeNight?: number;
    bigBadWolfRecruitPending?: boolean;
    bigBadWolfRecruitNight?: number;
    diseasedWolvesBlockedNight?: number;
  };
  votes: Record<string, number>;
  dayHistory: Record<number, { executedSeat?: number | null; tied?: boolean; hunterShot?: { hunterSeat: number; targetSeat: number } }>;
  nightHistory: Record<number, { wolfTarget?: number; wolfTargets?: number[]; guardTarget?: number; witchSave?: boolean; witchPoison?: number; deaths: number[]; hunterShot?: { hunterSeat: number; targetSeat: number } }>;
  winner: Alignment | "tanner" | "cult" | null;
}

export interface MultiplayerRoom {
  code: string;
  hostClientId: string;
  playerCount: number;
  status: MultiplayerRoomStatus;
  seats: MultiplayerSeat[];
  state: MultiplayerGameState | null;
  lobbyMessages?: MultiplayerChatMessage[];
  roleConfig?: Role[];
  rolePreset?: MultiplayerRolePreset;
  actionSeq: number;
  updatedAt?: string;
}

export type MultiplayerAction =
  | { type: "START_GAME"; clientId: string }
  | { type: "LEAVE_ROOM"; clientId: string }
  | { type: "ADD_BOT"; clientId: string; count?: number }
  | { type: "KICK_PLAYER"; clientId: string; targetClientId: string }
  | { type: "ACK_ROLE"; clientId: string }
  | { type: "CHAT"; clientId: string; content: string }
  | { type: "UPDATE_ROLE_CONFIG"; clientId: string; roles: Role[]; preset?: MultiplayerRolePreset; playerCount?: number }
  | { type: "NIGHT_ACTION"; clientId: string; targetSeat: number | null; secondTargetSeat?: number | null; witchAction?: "save" | "poison" | "pass" }
  | { type: "HUNTER_SHOOT"; clientId: string; targetSeat: number | null }
  | { type: "START_VOTE"; clientId: string }
  | { type: "END_VOTE"; clientId: string }
  | { type: "VOTE"; clientId: string; targetSeat: number }
  | { type: "RESTART_LOBBY"; clientId: string }
  | { type: "NEXT_NIGHT"; clientId: string };

export function toGamePhase(phase: MultiplayerPhase): Phase {
  switch (phase) {
    case "LOBBY":
      return "LOBBY";
    case "ROLE_REVEAL":
      return "NIGHT_START";
    case "NIGHT_DOPPELGANGER_ACTION":
      return "NIGHT_START";
    case "NIGHT_CUPID_ACTION":
      return "NIGHT_START";
    case "NIGHT_CULT_ACTION":
      return "NIGHT_START";
    case "NIGHT_GUARD_ACTION":
      return "NIGHT_GUARD_ACTION";
    case "NIGHT_WOLF_ACTION":
      return "NIGHT_WOLF_ACTION";
    case "NIGHT_BIG_BAD_WOLF_ACTION":
      return "NIGHT_WOLF_ACTION";
    case "NIGHT_WITCH_ACTION":
      return "NIGHT_WITCH_ACTION";
    case "NIGHT_SEER_ACTION":
      return "NIGHT_SEER_ACTION";
    case "NIGHT_SORCERER_ACTION":
      return "NIGHT_SEER_ACTION";
    case "NIGHT_PI_ACTION":
      return "NIGHT_SEER_ACTION";
    case "NIGHT_RESOLVE":
      return "NIGHT_RESOLVE";
    case "HUNTER_SHOOT":
      return "HUNTER_SHOOT";
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
