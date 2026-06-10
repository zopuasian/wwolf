import { isWolfRole, type Alignment, type Role } from "@/types/game";

export const MULTIPLAYER_ROLE_LABEL: Record<Role, string> = {
  Villager: "Villager",
  Werewolf: "Werewolf",
  BigBadWolf: "Big Bad Wolf",
  WolfCub: "Wolf Cub",
  Sorcerer: "Sorcerer",
  Seer: "Seer",
  Witch: "Witch",
  Hunter: "Hunter",
  Guard: "Bodyguard",
  Diseased: "Diseased",
  Prince: "Prince",
  Cupid: "Cupid",
  PI: "P.I.",
  Lycan: "Lycan",
  Cursed: "Cursed",
  Doppelganger: "Doppelganger",
  Tanner: "Tanner",
  CultLeader: "Cult Leader",
  Idiot: "Idiot",
  WhiteWolfKing: "White Wolf King",
};

export const MULTIPLAYER_ROLE_OPTIONS: Role[] = [
  "Villager",
  "Werewolf",
  "BigBadWolf",
  "WolfCub",
  "Sorcerer",
  "Seer",
  "Witch",
  "Hunter",
  "Guard",
  "Diseased",
  "Prince",
  "Cupid",
  "PI",
  "Lycan",
  "Cursed",
  "Doppelganger",
  "Tanner",
  "CultLeader",
  "WhiteWolfKing",
  "Idiot",
];

export type MultiplayerRolePreset = "beginner" | "classic" | "advanced" | "chaos";

export const MULTIPLAYER_ROLE_PRESETS: Record<MultiplayerRolePreset, { label: string; description: string }> = {
  beginner: {
    label: "Beginner",
    description: "Simple village vs wolves setup.",
  },
  classic: {
    label: "Classic",
    description: "Seer, Witch, Hunter, Bodyguard, and wolves.",
  },
  advanced: {
    label: "Advanced",
    description: "Adds deceptive roles like Lycan, Cursed, Prince, and Wolf Cub.",
  },
  chaos: {
    label: "Chaos",
    description: "Adds neutral and swing roles for experienced groups.",
  },
};

const DEFAULT_ROLE_CONFIGS: Record<MultiplayerRolePreset, Record<number, Role[]>> = {
  beginner: {
    5: ["Werewolf", "Seer", "Villager", "Villager", "Villager"],
    6: ["Werewolf", "Werewolf", "Seer", "Villager", "Villager", "Villager"],
    7: ["Werewolf", "Werewolf", "Seer", "Witch", "Villager", "Villager", "Villager"],
    8: ["Werewolf", "Werewolf", "Seer", "Witch", "Hunter", "Villager", "Villager", "Villager"],
    9: ["Werewolf", "Werewolf", "Werewolf", "Seer", "Witch", "Hunter", "Villager", "Villager", "Villager"],
    10: ["Werewolf", "Werewolf", "Werewolf", "Seer", "Witch", "Hunter", "Guard", "Villager", "Villager", "Villager"],
    11: ["Werewolf", "Werewolf", "Werewolf", "Seer", "Witch", "Hunter", "Guard", "Villager", "Villager", "Villager", "Villager"],
    12: ["Werewolf", "Werewolf", "Werewolf", "Seer", "Witch", "Hunter", "Guard", "Villager", "Villager", "Villager", "Villager", "Villager"],
  },
  classic: {
    5: ["Werewolf", "Seer", "Witch", "Villager", "Villager"],
    6: ["Werewolf", "Werewolf", "Seer", "Witch", "Villager", "Villager"],
    7: ["Werewolf", "Werewolf", "Seer", "Witch", "Hunter", "Villager", "Villager"],
    8: ["Werewolf", "Werewolf", "Seer", "Witch", "Hunter", "Guard", "Villager", "Villager"],
    9: ["Werewolf", "Werewolf", "Werewolf", "Seer", "Witch", "Hunter", "Guard", "Villager", "Villager"],
    10: ["Werewolf", "Werewolf", "WhiteWolfKing", "Seer", "Witch", "Hunter", "Guard", "Villager", "Villager", "Villager"],
    11: ["Werewolf", "Werewolf", "WhiteWolfKing", "Seer", "Witch", "Hunter", "Guard", "Prince", "Villager", "Villager", "Villager"],
    12: ["Werewolf", "Werewolf", "Werewolf", "WhiteWolfKing", "Seer", "Witch", "Hunter", "Guard", "Prince", "Villager", "Villager", "Villager"],
  },
  advanced: {
    5: ["Werewolf", "Seer", "Witch", "Lycan", "Villager"],
    6: ["Werewolf", "WolfCub", "Seer", "Witch", "Lycan", "Villager"],
    7: ["Werewolf", "WolfCub", "Seer", "Witch", "Hunter", "Cursed", "Villager"],
    8: ["Werewolf", "WolfCub", "Seer", "Witch", "Hunter", "Guard", "Cursed", "Villager"],
    9: ["Werewolf", "BigBadWolf", "WolfCub", "Seer", "Witch", "Hunter", "Guard", "Lycan", "Villager"],
    10: ["Werewolf", "BigBadWolf", "WolfCub", "Sorcerer", "Seer", "Witch", "Hunter", "Guard", "Cursed", "Villager"],
    11: ["Werewolf", "BigBadWolf", "WolfCub", "Sorcerer", "Seer", "Witch", "Hunter", "Guard", "Prince", "Lycan", "Villager"],
    12: ["Werewolf", "BigBadWolf", "WolfCub", "Sorcerer", "Seer", "Witch", "Hunter", "Guard", "Prince", "Diseased", "Lycan", "Villager"],
  },
  chaos: {
    5: ["Werewolf", "Seer", "Witch", "Tanner", "Villager"],
    6: ["Werewolf", "WolfCub", "Seer", "Witch", "Tanner", "Cursed"],
    7: ["Werewolf", "WolfCub", "Sorcerer", "Seer", "Witch", "Tanner", "Cursed"],
    8: ["Werewolf", "BigBadWolf", "WolfCub", "Seer", "Witch", "Cupid", "Tanner", "Cursed"],
    9: ["Werewolf", "BigBadWolf", "WolfCub", "Sorcerer", "Seer", "Witch", "Cupid", "Tanner", "Cursed"],
    10: ["Werewolf", "BigBadWolf", "WolfCub", "Sorcerer", "Seer", "Witch", "Cupid", "Doppelganger", "Tanner", "Cursed"],
    11: ["Werewolf", "BigBadWolf", "WolfCub", "Sorcerer", "Seer", "Witch", "Cupid", "Doppelganger", "CultLeader", "Tanner", "Cursed"],
    12: ["Werewolf", "BigBadWolf", "WolfCub", "Sorcerer", "Seer", "Witch", "Guard", "Cupid", "Doppelganger", "CultLeader", "Tanner", "Cursed"],
  },
};

export function getDefaultMultiplayerRoles(playerCount: number, preset: MultiplayerRolePreset = "classic"): Role[] {
  const normalizedCount = Math.min(12, Math.max(5, Math.round(playerCount)));
  return (DEFAULT_ROLE_CONFIGS[preset]?.[normalizedCount] ?? DEFAULT_ROLE_CONFIGS.classic[normalizedCount] ?? DEFAULT_ROLE_CONFIGS.classic[10]).slice();
}

export function getRoleAlignment(role: Role): Alignment {
  return isWolfRole(role) || role === "Sorcerer" ? "wolf" : "village";
}

export function normalizeRoleConfig(roles: unknown, fallbackCount: number, preset: MultiplayerRolePreset = "classic"): Role[] {
  if (!Array.isArray(roles)) return getDefaultMultiplayerRoles(fallbackCount, preset);
  const valid = roles.filter((role): role is Role => MULTIPLAYER_ROLE_OPTIONS.includes(role as Role));
  if (valid.length < 5 || valid.length > 12) return getDefaultMultiplayerRoles(fallbackCount, preset);
  return valid;
}

export function validateRoleConfig(roles: Role[]): string | null {
  if (roles.length < 5) return "Need at least 5 roles.";
  if (roles.length > 12) return "Use at most 12 roles.";
  if (!roles.some((role) => isWolfRole(role))) return "Add at least one wolf role.";
  const wolfCount = roles.filter((role) => isWolfRole(role)).length;
  if (wolfCount >= roles.length - wolfCount) return "Too many wolves for this player count.";
  return null;
}
