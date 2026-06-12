const ROLE_ALIASES = new Map([
  ["villager", "Villager"],
  ["werewolf", "Werewolf"],
  ["wolf", "Werewolf"],
  ["big bad wolf", "BigBadWolf"],
  ["wolf cub", "WolfCub"],
  ["sorcerer", "Sorcerer"],
  ["seer", "Seer"],
  ["witch", "Witch"],
  ["hunter", "Hunter"],
  ["guard", "Guard"],
  ["bodyguard", "Guard"],
  ["diseased", "Diseased"],
  ["prince", "Prince"],
  ["cupid", "Cupid"],
  ["pi", "PI"],
  ["p.i.", "PI"],
  ["lycan", "Lycan"],
  ["cursed", "Cursed"],
  ["doppelganger", "Doppelganger"],
  ["tanner", "Tanner"],
  ["cult leader", "CultLeader"],
  ["idiot", "Idiot"],
  ["white wolf king", "WhiteWolfKing"],
]);

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findMentionedPlayers(text, players) {
  const normalized = normalizeText(text);
  return players
    .filter((player) => normalized.includes(normalizeText(player.displayName)))
    .sort((a, b) => b.displayName.length - a.displayName.length);
}

function findClaim(text) {
  const normalized = normalizeText(text);
  for (const [alias, role] of ROLE_ALIASES) {
    const claim = new RegExp(`\\b(?:i am|i'm|im|i claim|claiming)(?: the)? ${escaped(alias)}\\b`, "i");
    if (claim.test(normalized)) return role;
  }
  return null;
}

function mentionsAny(text, words) {
  return words.some((word) => text.includes(word));
}

export function analyzeEnglishMessage(message, players) {
  const text = normalizeText(message.content);
  const mentionedPlayers = findMentionedPlayers(text, players);
  const claim = findClaim(text);
  const suspicious = mentionsAny(text, [
    "wolf",
    "werewolf",
    "suspicious",
    "lying",
    "liar",
    "evil",
    "fake claim",
    "does not add up",
    "doesn't add up",
    "vote ",
  ]);
  const defensive = mentionsAny(text, [
    "innocent",
    "village",
    "villager",
    "safe",
    "clear",
    "trust",
    "do not vote",
    "don't vote",
  ]);
  const uncertainty = mentionsAny(text, ["maybe", "perhaps", "not sure", "uncertain", "could be"]);

  return {
    claim,
    mentionedPlayers,
    suspicious,
    defensive,
    uncertainty,
    explicitVote: /\b(?:vote|voting|execute|eliminate)\b/.test(text),
  };
}

export function observeEnglishMessages(bot, room) {
  const state = room.state;
  if (!state) return;

  for (const message of state.messages || []) {
    if (message.isSystem || bot.memory.seenMessageIds.has(message.id)) continue;
    bot.memory.seenMessageIds.add(message.id);
    if (message.clientId === bot.clientId) continue;

    const speaker = state.players.find((player) => player.clientId === message.clientId);
    if (!speaker) continue;
    const analysis = analyzeEnglishMessage(message, state.players);

    if (analysis.claim) {
      const previous = bot.memory.claims.get(speaker.clientId);
      bot.memory.claims.set(speaker.clientId, analysis.claim);
      if (previous && previous !== analysis.claim) {
        bot.memory.suspicion.set(speaker.clientId, (bot.memory.suspicion.get(speaker.clientId) || 0) + 2.4);
      }
    }

    for (const mentioned of analysis.mentionedPlayers) {
      if (mentioned.clientId === speaker.clientId) continue;
      let delta = 0;
      if (analysis.suspicious) delta += analysis.explicitVote ? 1.35 : 0.8;
      if (analysis.defensive) delta -= 0.75;
      if (analysis.uncertainty) delta *= 0.55;
      const speakerTrust = bot.memory.trust.get(speaker.clientId) || 0;
      delta *= Math.max(0.3, 1 + speakerTrust * 0.12);
      bot.memory.suspicion.set(
        mentioned.clientId,
        (bot.memory.suspicion.get(mentioned.clientId) || 0) + delta
      );
    }
  }
}

export function claimedRole(bot, clientId) {
  return bot.memory.claims.get(clientId) || null;
}
