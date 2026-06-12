import { claimedRole, observeEnglishMessages } from "./language.mjs";

const WOLF_ROLES = new Set(["Werewolf", "WhiteWolfKing", "BigBadWolf", "WolfCub"]);
const POWER_ROLE_WEIGHT = new Map([
  ["Seer", 5],
  ["Witch", 4.2],
  ["Guard", 3.4],
  ["Hunter", 2.6],
  ["PI", 2.5],
  ["Cupid", 1.4],
]);

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFor(bot, key) {
  let value = hashString(`${bot.seed}:${key}`);
  value += 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function isWolfRole(role) {
  return WOLF_ROLES.has(role);
}

function selfPlayer(bot, room) {
  return room.state?.players.find((player) => player.clientId === bot.clientId) || null;
}

function aliveCandidates(bot, room, options = {}) {
  const me = selfPlayer(bot, room);
  return (room.state?.players || []).filter((player) => {
    if (!player.alive) return false;
    if (options.excludeSelf !== false && player.clientId === bot.clientId) return false;
    if (options.excludeSeats?.has(player.seat)) return false;
    if (options.onlySeats && !options.onlySeats.has(player.seat)) return false;
    if (options.excludeWolves && isWolfRole(player.role)) return false;
    if (options.excludeWolfTeam && me?.alignment === "wolf" && player.alignment === "wolf") return false;
    return true;
  });
}

function scoreCandidate(bot, room, player, purpose) {
  const me = selfPlayer(bot, room);
  const suspicion = bot.memory.suspicion.get(player.clientId) || 0;
  const trust = bot.memory.trust.get(player.clientId) || 0;
  const claim = claimedRole(bot, player.clientId);
  const noise = (randomFor(bot, `${room.state?.day}:${purpose}:${player.clientId}`) - 0.5) * 1.2;

  if (purpose === "wolf") {
    return (POWER_ROLE_WEIGHT.get(claim) || 0) + trust * 0.9 - suspicion * 0.3 + noise;
  }
  if (purpose === "guard") {
    return (POWER_ROLE_WEIGHT.get(claim) || 0) + trust * 1.1 - suspicion * 0.45 + noise;
  }
  if (purpose === "cult") {
    return trust - Math.abs(suspicion) * 0.3 + noise;
  }
  if (purpose === "copy") {
    return (POWER_ROLE_WEIGHT.get(claim) || 0) + trust + noise;
  }
  if (purpose === "sorcerer") {
    return (claim === "Seer" ? 5 : 0) + trust + noise;
  }
  if (purpose === "poison" || purpose === "hunter" || purpose === "inspect" || purpose === "vote") {
    let score = suspicion * (0.8 + bot.persona.skepticism);
    if (me && isWolfRole(me.role)) {
      if (player.alignment === "wolf") return -100;
      score = (POWER_ROLE_WEIGHT.get(claim) || 0) + trust * 0.7 - suspicion * 0.2;
    }
    if (me?.role === "Tanner" && purpose === "vote") score = -suspicion + noise;
    return score + noise + bot.persona.aggression * 0.25;
  }
  return noise;
}

function chooseHighest(bot, room, candidates, purpose) {
  if (!candidates.length) return null;
  return candidates
    .map((player) => ({ player, score: scoreCandidate(bot, room, player, purpose) }))
    .sort((left, right) => right.score - left.score || left.player.seat - right.player.seat)[0].player;
}

function observeInvestigationResults(bot, room) {
  const state = room.state;
  if (!state) return;
  const me = selfPlayer(bot, room);
  if (!me) return;

  const seerChecks = state.nightActions?.seerChecks?.[bot.clientId] || [];
  for (const check of seerChecks) {
    const key = `seer:${check.day}:${check.targetSeat}`;
    if (bot.memory.observedResults.has(key)) continue;
    bot.memory.observedResults.add(key);
    const target = state.players.find((player) => player.seat === check.targetSeat);
    if (!target) continue;
    bot.memory.suspicion.set(target.clientId, check.isWolf ? 10 : -5);
    bot.memory.trust.set(target.clientId, check.isWolf ? -5 : 4);
  }

  const sorcererChecks = state.nightActions?.sorcererChecks?.[bot.clientId] || [];
  for (const check of sorcererChecks) {
    const key = `sorcerer:${check.day}:${check.targetSeat}`;
    if (bot.memory.observedResults.has(key)) continue;
    bot.memory.observedResults.add(key);
    const target = state.players.find((player) => player.seat === check.targetSeat);
    if (target && check.result === "seer") bot.memory.claims.set(target.clientId, "Seer");
  }

  const piChecks = state.nightActions?.piChecks?.[bot.clientId] || [];
  for (const check of piChecks) {
    const key = `pi:${check.day}:${check.centerSeat}`;
    if (bot.memory.observedResults.has(key)) continue;
    bot.memory.observedResults.add(key);
    for (const seat of check.seats || []) {
      const target = state.players.find((player) => player.seat === seat);
      if (!target) continue;
      const delta = check.hasEvil ? 1.4 : -1.2;
      bot.memory.suspicion.set(target.clientId, (bot.memory.suspicion.get(target.clientId) || 0) + delta);
    }
  }
}

export function createBot({ clientId, persona, seed }) {
  return {
    clientId,
    persona,
    seed,
    memory: {
      suspicion: new Map(),
      trust: new Map(),
      claims: new Map(),
      seenMessageIds: new Set(),
      observedResults: new Set(),
      sentChatKeys: new Set(),
      loggedUnknownPhases: new Set(),
    },
  };
}

export function observeRoom(bot, room) {
  observeEnglishMessages(bot, room);
  observeInvestigationResults(bot, room);
}

function discussionMessage(bot, room) {
  const me = selfPlayer(bot, room);
  const candidates = aliveCandidates(bot, room, { excludeWolfTeam: isWolfRole(me?.role) });
  const target = chooseHighest(bot, room, candidates, "vote");
  if (!target) return "I am still reviewing the table.";

  if (me?.role === "Seer") {
    const checks = room.state.nightActions?.seerChecks?.[bot.clientId] || [];
    const wolfCheck = [...checks].reverse().find((check) => check.isWolf);
    const checked = wolfCheck && room.state.players.find((player) => player.seat === wolfCheck.targetSeat);
    if (checked && (room.state.day > 1 || bot.persona.risk > 0.55)) {
      return `I am the Seer. I checked ${checked.displayName}, and they are a wolf. Vote ${checked.displayName}.`;
    }
  }

  const phrase = bot.persona.phrases[
    Math.floor(randomFor(bot, `phrase:${room.state.day}`) * bot.persona.phrases.length)
  ];
  const suffix = [
    " Their pressure does not match their earlier position.",
    " I want their vote explained before the timer ends.",
    " Their read changed without a clear reason.",
    " Watch how they react to direct pressure.",
  ][Math.floor(randomFor(bot, `reason:${room.state.day}`) * 4)];
  return `${phrase} ${target.displayName}.${suffix}`;
}

function wolfMessage(bot, room, target) {
  const choices = [
    `I prefer ${target.displayName} tonight. Their claim is dangerous.`,
    `Target ${target.displayName}; they are gaining too much trust.`,
    `${target.displayName} is my pick. I will follow the pack if needed.`,
  ];
  return choices[Math.floor(randomFor(bot, `wolf-chat:${room.state.day}`) * choices.length)];
}

function currentWolfVoter(bot, room, recruiting) {
  const state = room.state;
  const wolves = state.players
    .filter((player) => player.alive && isWolfRole(player.role))
    .sort((left, right) => left.seat - right.seat);
  const index = recruiting
    ? state.nightActions.bigBadWolfRecruitTurnIndex
    : state.nightActions.wolfVoteTurnIndex;
  return wolves[index ?? 0]?.clientId === bot.clientId;
}

function isRecruitNight(room) {
  const roleState = room.state?.roleState;
  return roleState?.bigBadWolfRecruitPending === true &&
    roleState.bigBadWolfRecruitNight === room.state?.day;
}

function phaseRoleHandler(role, selector, options = {}) {
  return (bot, room) => {
    const me = selfPlayer(bot, room);
    if (!me?.alive || me.role !== role) return null;
    const target = selector(bot, room);
    if (!target) return options.allowPass
      ? { type: "NIGHT_ACTION", clientId: bot.clientId, targetSeat: null, ...(options.passPayload || {}) }
      : null;
    return {
      type: "NIGHT_ACTION",
      clientId: bot.clientId,
      targetSeat: target.seat,
      ...(options.extra?.(bot, room, target) || {}),
    };
  };
}

const PHASE_HANDLERS = new Map([
  ["ROLE_REVEAL", (bot, room) => (
    room.state.roleAcks?.[bot.clientId] ? null : { type: "ACK_ROLE", clientId: bot.clientId }
  )],
  ["NIGHT_DOPPELGANGER_ACTION", phaseRoleHandler(
    "Doppelganger",
    (bot, room) => chooseHighest(bot, room, aliveCandidates(bot, room), "copy")
  )],
  ["NIGHT_CUPID_ACTION", (bot, room) => {
    const me = selfPlayer(bot, room);
    if (!me?.alive || me.role !== "Cupid") return null;
    const candidates = aliveCandidates(bot, room, { excludeSelf: false })
      .sort((left, right) => randomFor(bot, `cupid:${left.clientId}`) - randomFor(bot, `cupid:${right.clientId}`));
    if (candidates.length < 2) return null;
    return {
      type: "NIGHT_ACTION",
      clientId: bot.clientId,
      targetSeat: candidates[0].seat,
      secondTargetSeat: candidates[1].seat,
    };
  }],
  ["NIGHT_CULT_ACTION", phaseRoleHandler(
    "CultLeader",
    (bot, room) => {
      const cultIds = new Set(room.state.roleState?.cultMemberClientIds || [bot.clientId]);
      const candidates = aliveCandidates(bot, room).filter((player) => !cultIds.has(player.clientId));
      return chooseHighest(bot, room, candidates, "cult");
    }
  )],
  ["NIGHT_GUARD_ACTION", phaseRoleHandler(
    "Guard",
    (bot, room) => {
      const blocked = new Set([room.state.nightActions.lastGuardTarget].filter(Number.isInteger));
      return chooseHighest(bot, room, aliveCandidates(bot, room, { excludeSeats: blocked }), "guard");
    }
  )],
  ["NIGHT_WOLF_ACTION", (bot, room) => {
    const me = selfPlayer(bot, room);
    if (!me?.alive || !isWolfRole(me.role)) return null;
    if (room.state.nightActions.wolfTargetConfirmedAt || room.state.nightActions.bigBadWolfRecruitConfirmedAt) return null;
    const recruiting = isRecruitNight(room);
    if (!currentWolfVoter(bot, room, recruiting)) return null;
    const tieSeats = recruiting
      ? room.state.nightActions.bigBadWolfRecruitTieSeats
      : room.state.nightActions.wolfTieSeats;
    const onlySeats = tieSeats?.length ? new Set(tieSeats) : null;
    const candidates = aliveCandidates(bot, room, { excludeWolves: true, onlySeats });
    const target = chooseHighest(bot, room, candidates, "wolf");
    if (!target) return null;
    return { type: "NIGHT_ACTION", clientId: bot.clientId, targetSeat: target.seat };
  }],
  ["NIGHT_BIG_BAD_WOLF_ACTION", () => null],
  ["NIGHT_WITCH_ACTION", (bot, room) => {
    const me = selfPlayer(bot, room);
    if (!me?.alive || me.role !== "Witch") return null;
    const abilities = room.state.roleAbilities;
    const wolfTarget = room.state.nightActions.wolfTarget;
    const attacked = room.state.players.find((player) => player.seat === wolfTarget);
    if (!abilities.witchHealUsed && attacked) {
      const attackedSuspicion = bot.memory.suspicion.get(attacked.clientId) || 0;
      if (attacked.clientId === bot.clientId || attackedSuspicion < 2.5 || bot.persona.risk < 0.45) {
        return { type: "NIGHT_ACTION", clientId: bot.clientId, targetSeat: null, witchAction: "save" };
      }
    }
    if (!abilities.witchPoisonUsed) {
      const target = chooseHighest(bot, room, aliveCandidates(bot, room), "poison");
      const score = target ? (bot.memory.suspicion.get(target.clientId) || 0) : 0;
      if (target && (score > 2.2 || room.state.day >= 3 || bot.persona.aggression > 0.72)) {
        return { type: "NIGHT_ACTION", clientId: bot.clientId, targetSeat: target.seat, witchAction: "poison" };
      }
    }
    return { type: "NIGHT_ACTION", clientId: bot.clientId, targetSeat: null, witchAction: "pass" };
  }],
  ["NIGHT_SEER_ACTION", phaseRoleHandler(
    "Seer",
    (bot, room) => {
      const inspected = new Set(
        (room.state.nightActions.seerChecks?.[bot.clientId] || []).map((check) => check.targetSeat)
      );
      return chooseHighest(bot, room, aliveCandidates(bot, room, { excludeSeats: inspected }), "inspect");
    }
  )],
  ["NIGHT_SORCERER_ACTION", phaseRoleHandler(
    "Sorcerer",
    (bot, room) => {
      const inspected = new Set(
        (room.state.nightActions.sorcererChecks?.[bot.clientId] || []).map((check) => check.targetSeat)
      );
      return chooseHighest(bot, room, aliveCandidates(bot, room, { excludeSeats: inspected }), "sorcerer");
    }
  )],
  ["NIGHT_PI_ACTION", phaseRoleHandler(
    "PI",
    (bot, room) => chooseHighest(bot, room, aliveCandidates(bot, room, { excludeSelf: false }), "inspect")
  )],
  ["HUNTER_SHOOT", (bot, room) => {
    if (room.state.pendingHunterShot?.hunterClientId !== bot.clientId) return null;
    const target = chooseHighest(bot, room, aliveCandidates(bot, room), "hunter");
    return target ? { type: "HUNTER_SHOOT", clientId: bot.clientId, targetSeat: target.seat } : null;
  }],
  ["DAY_DISCUSSION", (bot, room, context) => {
    const me = selfPlayer(bot, room);
    const chatKey = `discussion:${room.state.day}`;
    if (me?.alive && !bot.memory.sentChatKeys.has(chatKey)) {
      bot.memory.sentChatKeys.add(chatKey);
      return { type: "CHAT", clientId: bot.clientId, content: discussionMessage(bot, room) };
    }
    if (room.hostClientId === bot.clientId && context.allBotsDiscussed) {
      return { type: "START_VOTE", clientId: bot.clientId };
    }
    return null;
  }],
  ["DAY_VOTE", (bot, room) => {
    const me = selfPlayer(bot, room);
    if (!me?.alive || Number.isInteger(room.state.votes?.[bot.clientId])) return null;
    const target = chooseHighest(bot, room, aliveCandidates(bot, room), "vote");
    return target ? { type: "VOTE", clientId: bot.clientId, targetSeat: target.seat } : null;
  }],
  ["LOBBY", () => null],
  ["NIGHT_RESOLVE", () => null],
  ["DAY_RESOLVE", () => null],
  ["GAME_END", () => null],
]);

export function decideBotAction(bot, room, context = {}) {
  const phase = room.state?.phase || "LOBBY";
  const handler = PHASE_HANDLERS.get(phase);
  if (!handler) {
    if (!bot.memory.loggedUnknownPhases.has(phase)) {
      bot.memory.loggedUnknownPhases.add(phase);
      context.onUnknownPhase?.(bot, phase);
    }
    return null;
  }
  return handler(bot, room, context);
}

export function describeAction(bot, room, action) {
  if (!action) return "";
  const target = Number.isInteger(action.targetSeat)
    ? room.state?.players.find((player) => player.seat === action.targetSeat)?.displayName
    : null;
  if (action.type === "CHAT") return `${bot.persona.name} says: "${action.content}"`;
  if (action.type === "VOTE") return `${bot.persona.name} votes for ${target || action.targetSeat}`;
  if (action.type === "HUNTER_SHOOT") return `${bot.persona.name} shoots ${target || action.targetSeat}`;
  if (action.type === "NIGHT_ACTION") {
    if (action.witchAction) return `${bot.persona.name} uses Witch action: ${action.witchAction}${target ? ` on ${target}` : ""}`;
    return `${bot.persona.name} acts on ${target || "no target"}`;
  }
  return `${bot.persona.name}: ${action.type}`;
}

export function createWolfChatAction(bot, room) {
  const me = selfPlayer(bot, room);
  if (!me?.alive || !isWolfRole(me.role) || room.state.phase !== "NIGHT_WOLF_ACTION") return null;
  const key = `wolf-chat:${room.state.day}`;
  if (bot.memory.sentChatKeys.has(key)) return null;
  const target = chooseHighest(bot, room, aliveCandidates(bot, room, { excludeWolves: true }), "wolf");
  if (!target) return null;
  bot.memory.sentChatKeys.add(key);
  return { type: "CHAT", clientId: bot.clientId, content: wolfMessage(bot, room, target) };
}
