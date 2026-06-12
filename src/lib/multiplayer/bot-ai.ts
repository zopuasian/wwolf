import { isWolfRole, type Role } from "@/types/game";
import type {
  MultiplayerAction,
  MultiplayerChatMessage,
  MultiplayerGameState,
  MultiplayerPlayer,
  MultiplayerRoom,
  MultiplayerSeat,
} from "./types";

export const ROOM_BOT_CLIENT_PREFIX = "wolfcha-room-bot-";

const BOT_NAMES = [
  "Morgan",
  "Riley",
  "Alex",
  "Casey",
  "Jordan",
  "Taylor",
  "Quinn",
  "Avery",
  "Rowan",
  "Sage",
  "Blake",
  "Reese",
];

const POWER_ROLE_WEIGHT: Partial<Record<Role, number>> = {
  Seer: 5,
  Witch: 4,
  Guard: 3.2,
  Hunter: 2.5,
  PI: 2.2,
  Cupid: 1.2,
};

type BotRead = {
  suspicion: Map<string, number>;
  claims: Map<string, Role>;
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableNoise(room: MultiplayerRoom, bot: MultiplayerPlayer, key: string): number {
  return (hashString(`${room.code}:${room.state?.day}:${bot.clientId}:${key}`) % 1000) / 1000;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}.']/gu, " ").replace(/\s+/g, " ").trim();
}

function roleClaim(content: string): Role | null {
  const text = normalizeText(content);
  const aliases: Array<[string, Role]> = [
    ["white wolf king", "WhiteWolfKing"],
    ["big bad wolf", "BigBadWolf"],
    ["cult leader", "CultLeader"],
    ["doppelganger", "Doppelganger"],
    ["bodyguard", "Guard"],
    ["wolf cub", "WolfCub"],
    ["werewolf", "Werewolf"],
    ["villager", "Villager"],
    ["sorcerer", "Sorcerer"],
    ["seer", "Seer"],
    ["witch", "Witch"],
    ["hunter", "Hunter"],
    ["guard", "Guard"],
    ["prince", "Prince"],
    ["cupid", "Cupid"],
    ["lycan", "Lycan"],
    ["cursed", "Cursed"],
    ["tanner", "Tanner"],
    ["idiot", "Idiot"],
    ["pi", "PI"],
  ];
  for (const [alias, role] of aliases) {
    if (
      text.includes(`i am ${alias}`) ||
      text.includes(`i'm ${alias}`) ||
      text.includes(`i claim ${alias}`)
    ) {
      return role;
    }
  }
  return null;
}

function canBotReadMessage(bot: MultiplayerPlayer, message: MultiplayerChatMessage): boolean {
  return message.visibility !== "wolves" || isWolfRole(bot.role);
}

function readTable(state: MultiplayerGameState, bot: MultiplayerPlayer): BotRead {
  const suspicion = new Map<string, number>();
  const claims = new Map<string, Role>();

  for (const message of state.messages) {
    if (message.isSystem || !canBotReadMessage(bot, message)) continue;
    const speaker = state.players.find((player) => player.clientId === message.clientId);
    if (!speaker) continue;
    const text = normalizeText(message.content);
    const claim = roleClaim(message.content);
    if (claim) {
      const previous = claims.get(speaker.clientId);
      claims.set(speaker.clientId, claim);
      if (previous && previous !== claim) {
        suspicion.set(speaker.clientId, (suspicion.get(speaker.clientId) ?? 0) + 2.5);
      }
    }

    const accuses = ["wolf", "suspicious", "lying", "liar", "evil", "vote "].some((term) => text.includes(term));
    const defends = ["innocent", "safe", "clear", "trust", "do not vote", "don't vote"].some((term) => text.includes(term));
    for (const target of state.players) {
      if (target.clientId === speaker.clientId || !text.includes(normalizeText(target.displayName))) continue;
      const delta = (accuses ? 1.15 : 0) - (defends ? 0.7 : 0);
      suspicion.set(target.clientId, (suspicion.get(target.clientId) ?? 0) + delta);
    }
  }

  const seerChecks = state.nightActions.seerChecks[bot.clientId] ?? [];
  for (const check of seerChecks) {
    const target = state.players.find((player) => player.seat === check.targetSeat);
    if (target) suspicion.set(target.clientId, check.isWolf ? 10 : -4);
  }

  return { suspicion, claims };
}

function aliveTargets(
  state: MultiplayerGameState,
  bot: MultiplayerPlayer,
  options: {
    includeSelf?: boolean;
    excludeSeats?: Set<number>;
    onlySeats?: Set<number>;
    excludeWolves?: boolean;
  } = {}
): MultiplayerPlayer[] {
  return state.players.filter((player) => {
    if (!player.alive) return false;
    if (!options.includeSelf && player.clientId === bot.clientId) return false;
    if (options.excludeSeats?.has(player.seat)) return false;
    if (options.onlySeats && !options.onlySeats.has(player.seat)) return false;
    if (options.excludeWolves && isWolfRole(player.role)) return false;
    return true;
  });
}

function chooseTarget(
  room: MultiplayerRoom,
  bot: MultiplayerPlayer,
  candidates: MultiplayerPlayer[],
  purpose: "vote" | "wolf" | "guard" | "inspect" | "poison" | "copy" | "cult"
): MultiplayerPlayer | null {
  if (!room.state || candidates.length === 0) return null;
  const reads = readTable(room.state, bot);
  return candidates
    .map((candidate) => {
      const suspicion = reads.suspicion.get(candidate.clientId) ?? 0;
      const claim = reads.claims.get(candidate.clientId);
      const noise = stableNoise(room, bot, `${purpose}:${candidate.clientId}`) * 1.2;
      let score = suspicion + noise;
      if (purpose === "wolf") score = (POWER_ROLE_WEIGHT[claim ?? "Villager"] ?? 0) - suspicion * 0.25 + noise;
      if (purpose === "guard") score = (POWER_ROLE_WEIGHT[claim ?? "Villager"] ?? 0) - suspicion * 0.5 + noise;
      if (purpose === "copy") score = (POWER_ROLE_WEIGHT[claim ?? "Villager"] ?? 0) + noise;
      if (purpose === "cult") score = -Math.abs(suspicion) + noise;
      if (bot.role === "Tanner" && purpose === "vote") score = -suspicion + noise;
      return { candidate, score };
    })
    .sort((left, right) => right.score - left.score || left.candidate.seat - right.candidate.seat)[0]?.candidate ?? null;
}

function botHasChattedThisPhase(state: MultiplayerGameState, bot: MultiplayerPlayer): boolean {
  return state.messages.some((message) => (
    message.clientId === bot.clientId &&
    message.day === state.day &&
    message.phase === state.phase
  ));
}

function discussionMessage(room: MultiplayerRoom, bot: MultiplayerPlayer): string {
  const state = room.state;
  if (!state) return "I am still reading the table.";
  const checks = state.nightActions.seerChecks[bot.clientId] ?? [];
  const wolfCheck = [...checks].reverse().find((check) => check.isWolf);
  const checkedWolf = wolfCheck && state.players.find((player) => player.seat === wolfCheck.targetSeat);
  if (bot.role === "Seer" && checkedWolf) {
    return `I am the Seer. I checked ${checkedWolf.displayName}, and they are a wolf. Vote ${checkedWolf.displayName}.`;
  }

  const candidates = aliveTargets(state, bot, { excludeWolves: isWolfRole(bot.role) });
  const target = chooseTarget(room, bot, candidates, "vote");
  if (!target) return "I need another read before I commit.";
  const openings = [
    "My strongest concern is",
    "I want a clearer explanation from",
    "The vote pressure should be on",
    "I am watching",
  ];
  const reasons = [
    "Their position changed without a clear reason.",
    "Their claim does not match the way they are voting.",
    "Watch how they react before the timer ends.",
    "Their reads are not consistent yet.",
  ];
  const opening = openings[Math.floor(stableNoise(room, bot, "opening") * openings.length)];
  const reason = reasons[Math.floor(stableNoise(room, bot, "reason") * reasons.length)];
  return `${opening} ${target.displayName}. ${reason}`;
}

function currentWolfVoter(state: MultiplayerGameState, recruit: boolean): MultiplayerPlayer | null {
  const wolves = state.players
    .filter((player) => player.alive && isWolfRole(player.role))
    .sort((left, right) => left.seat - right.seat);
  const index = recruit
    ? state.nightActions.bigBadWolfRecruitTurnIndex ?? 0
    : state.nightActions.wolfVoteTurnIndex ?? 0;
  return wolves[index] ?? null;
}

function roleActor(state: MultiplayerGameState, role: Role): MultiplayerPlayer | null {
  return state.players.find((player) => player.alive && player.role === role && isRoomBot(player)) ?? null;
}

export function isRoomBot(seat: Pick<MultiplayerSeat, "clientId" | "isBot">): boolean {
  return seat.isBot === true || seat.clientId.startsWith(ROOM_BOT_CLIENT_PREFIX);
}

export function createRoomBotSeat(room: MultiplayerRoom, seat: number, ordinal: number): MultiplayerSeat {
  const name = BOT_NAMES[ordinal % BOT_NAMES.length];
  const suffix = Math.floor(ordinal / BOT_NAMES.length);
  const displayName = suffix === 0 ? name : `${name} ${suffix + 1}`;
  const clientId = `${ROOM_BOT_CLIENT_PREFIX}${room.code.toLowerCase()}-${Date.now().toString(36)}-${ordinal}`;
  return {
    clientId,
    seat,
    displayName,
    avatarSeed: `bot-${name.toLowerCase()}-${ordinal}`,
    joinedAt: Date.now() + ordinal,
    isBot: true,
  };
}

export function getNextRoomBotAction(room: MultiplayerRoom): MultiplayerAction | null {
  const state = room.state;
  if (!state) return null;
  const bots = state.players.filter((player) => isRoomBot(player)).sort((left, right) => left.seat - right.seat);
  if (bots.length === 0) return null;

  if (state.phase === "ROLE_REVEAL") {
    const bot = bots.find((candidate) => !state.roleAcks[candidate.clientId]);
    return bot ? { type: "ACK_ROLE", clientId: bot.clientId } : null;
  }

  if (state.phase === "DAY_DISCUSSION") {
    const bot = bots.find((candidate) => candidate.alive && !botHasChattedThisPhase(state, candidate));
    return bot ? { type: "CHAT", clientId: bot.clientId, content: discussionMessage(room, bot) } : null;
  }

  if (state.phase === "DAY_VOTE") {
    const bot = bots.find((candidate) => candidate.alive && typeof state.votes[candidate.clientId] !== "number");
    if (!bot) return null;
    const target = chooseTarget(room, bot, aliveTargets(state, bot), "vote");
    return target ? { type: "VOTE", clientId: bot.clientId, targetSeat: target.seat } : null;
  }

  if (state.phase === "HUNTER_SHOOT") {
    const bot = bots.find((candidate) => state.pendingHunterShot?.hunterClientId === candidate.clientId);
    if (!bot) return null;
    const target = chooseTarget(room, bot, aliveTargets(state, bot), "vote");
    return target ? { type: "HUNTER_SHOOT", clientId: bot.clientId, targetSeat: target.seat } : null;
  }

  if (state.phase === "NIGHT_DOPPELGANGER_ACTION") {
    const bot = roleActor(state, "Doppelganger");
    const target = bot && chooseTarget(room, bot, aliveTargets(state, bot), "copy");
    return bot && target ? { type: "NIGHT_ACTION", clientId: bot.clientId, targetSeat: target.seat } : null;
  }

  if (state.phase === "NIGHT_CUPID_ACTION") {
    const bot = roleActor(state, "Cupid");
    if (!bot) return null;
    const targets = aliveTargets(state, bot, { includeSelf: true })
      .sort((left, right) => (
        stableNoise(room, bot, `cupid:${left.clientId}`) - stableNoise(room, bot, `cupid:${right.clientId}`)
      ));
    return targets.length >= 2
      ? { type: "NIGHT_ACTION", clientId: bot.clientId, targetSeat: targets[0].seat, secondTargetSeat: targets[1].seat }
      : null;
  }

  if (state.phase === "NIGHT_CULT_ACTION") {
    const bot = roleActor(state, "CultLeader");
    if (!bot) return null;
    const cultIds = new Set(state.roleState?.cultMemberClientIds ?? [bot.clientId]);
    const target = chooseTarget(
      room,
      bot,
      aliveTargets(state, bot).filter((candidate) => !cultIds.has(candidate.clientId)),
      "cult"
    );
    return target ? { type: "NIGHT_ACTION", clientId: bot.clientId, targetSeat: target.seat } : null;
  }

  if (state.phase === "NIGHT_GUARD_ACTION") {
    const bot = roleActor(state, "Guard");
    const excluded = new Set([state.nightActions.lastGuardTarget].filter((seat): seat is number => typeof seat === "number"));
    const target = bot && chooseTarget(room, bot, aliveTargets(state, bot, { excludeSeats: excluded }), "guard");
    return bot && target ? { type: "NIGHT_ACTION", clientId: bot.clientId, targetSeat: target.seat } : null;
  }

  if (state.phase === "NIGHT_WOLF_ACTION") {
    const recruit = state.roleState?.bigBadWolfRecruitNight === state.day;
    const bot = currentWolfVoter(state, recruit);
    if (!bot || !isRoomBot(bot) || state.nightActions.wolfTargetConfirmedAt || state.nightActions.bigBadWolfRecruitConfirmedAt) {
      return null;
    }
    const tieSeats = recruit ? state.nightActions.bigBadWolfRecruitTieSeats : state.nightActions.wolfTieSeats;
    const target = chooseTarget(
      room,
      bot,
      aliveTargets(state, bot, {
        excludeWolves: true,
        onlySeats: tieSeats?.length ? new Set(tieSeats) : undefined,
      }),
      "wolf"
    );
    return target ? { type: "NIGHT_ACTION", clientId: bot.clientId, targetSeat: target.seat } : null;
  }

  if (state.phase === "NIGHT_WITCH_ACTION") {
    const bot = roleActor(state, "Witch");
    if (!bot) return null;
    const attacked = state.players.find((player) => player.seat === state.nightActions.wolfTarget);
    if (!state.roleAbilities.witchHealUsed && attacked && state.nightActions.witchSave !== true) {
      const shouldSave = attacked.clientId === bot.clientId || stableNoise(room, bot, `save:${attacked.clientId}`) > 0.28;
      if (shouldSave) return { type: "NIGHT_ACTION", clientId: bot.clientId, targetSeat: null, witchAction: "save" };
    }
    if (!state.roleAbilities.witchPoisonUsed) {
      const target = chooseTarget(room, bot, aliveTargets(state, bot), "poison");
      const suspicion = target ? readTable(state, bot).suspicion.get(target.clientId) ?? 0 : 0;
      if (target && (suspicion > 1.5 || state.day >= 3)) {
        return { type: "NIGHT_ACTION", clientId: bot.clientId, targetSeat: target.seat, witchAction: "poison" };
      }
    }
    return { type: "NIGHT_ACTION", clientId: bot.clientId, targetSeat: null, witchAction: "pass" };
  }

  if (state.phase === "NIGHT_SEER_ACTION") {
    const bot = roleActor(state, "Seer");
    if (!bot) return null;
    const checked = new Set((state.nightActions.seerChecks[bot.clientId] ?? []).map((result) => result.targetSeat));
    const target = chooseTarget(room, bot, aliveTargets(state, bot, { excludeSeats: checked }), "inspect");
    return target ? { type: "NIGHT_ACTION", clientId: bot.clientId, targetSeat: target.seat } : null;
  }

  if (state.phase === "NIGHT_SORCERER_ACTION") {
    const bot = roleActor(state, "Sorcerer");
    if (!bot) return null;
    const checked = new Set((state.nightActions.sorcererChecks?.[bot.clientId] ?? []).map((result) => result.targetSeat));
    const target = chooseTarget(room, bot, aliveTargets(state, bot, { excludeSeats: checked }), "inspect");
    return target ? { type: "NIGHT_ACTION", clientId: bot.clientId, targetSeat: target.seat } : null;
  }

  if (state.phase === "NIGHT_PI_ACTION") {
    const bot = roleActor(state, "PI");
    const target = bot && chooseTarget(room, bot, aliveTargets(state, bot, { includeSelf: true }), "inspect");
    return bot && target ? { type: "NIGHT_ACTION", clientId: bot.clientId, targetSeat: target.seat } : null;
  }

  return null;
}
