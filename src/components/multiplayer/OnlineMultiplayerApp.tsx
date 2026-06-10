"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, Copy, Drop, Eye, PaperPlaneRight, Shield, SignOut, Skull, Timer } from "@phosphor-icons/react";
import { DayIcon, NightIcon, VoteIcon, WerewolfIcon } from "@/components/icons/FlatIcons";
import { GameBackground } from "@/components/game/GameBackground";
import { PlayerCardCompact } from "@/components/game/PlayerCardCompact";
import { RoleRevealOverlay } from "@/components/game/RoleRevealOverlay";
import { buildSimpleAvatarUrl } from "@/lib/avatar-config";
import { getMultiplayerClientId } from "@/lib/multiplayer/client-id";
import { isWolfRole, type Player, type Role } from "@/types/game";
import { toGamePhase, type MultiplayerAction, type MultiplayerPlayer, type MultiplayerRoom, type MultiplayerSeat } from "@/lib/multiplayer/types";

const roleLabel: Record<Role, string> = {
  Villager: "Villager",
  Werewolf: "Werewolf",
  WhiteWolfKing: "White Wolf King",
  Seer: "Seer",
  Witch: "Witch",
  Hunter: "Hunter",
  Guard: "Guard",
  Idiot: "Idiot",
};

const MIN_PLAYERS_TO_START = 5;
const PLAYER_COUNT_OPTIONS = [8, 9, 10, 11, 12];

const roleBrief: Record<Role, { subtitle: string; abilities: string[]; tips: string[]; next: string }> = {
  Villager: {
    subtitle: "No night action. Your voice and vote are your tools.",
    abilities: ["Discuss during the day", "Vote to execute suspected wolves"],
    tips: ["Track who votes late", "Protect confirmed information"],
    next: "Listen carefully and help the village find wolves.",
  },
  Werewolf: {
    subtitle: "You hunt with the wolf team under cover of night.",
    abilities: ["Private wolf chat at night", "Choose one non-wolf target"],
    tips: ["Coordinate before voting", "Do not expose wolf teammates"],
    next: "At wolf phase, select a target with your team.",
  },
  WhiteWolfKing: {
    subtitle: "Wolf team power role. Seer checks you as wolf.",
    abilities: ["Private wolf chat at night", "Play as a hidden wolf leader"],
    tips: ["Stay hidden until high value", "Push the village away from wolves"],
    next: "Coordinate the night target with the wolf team.",
  },
  Seer: {
    subtitle: "You see the truth, but must earn trust.",
    abilities: ["Check one player each night as good/wolf", "Guide votes with verified info by day"],
    tips: ["Build credibility before revealing", "Keep your check history clear"],
    next: "When it is your turn, select a player to check.",
  },
  Witch: {
    subtitle: "You hold one save and one poison for the whole game.",
    abilities: ["See who wolves attacked", "Save once or poison once"],
    tips: ["Do not waste both potions early", "Use death info to read the table"],
    next: "When it is your turn, save, poison, or pass.",
  },
  Hunter: {
    subtitle: "If executed or killed, your final shot can change the game.",
    abilities: ["Threaten wolves with a revenge shot", "Force careful votes"],
    tips: ["Claim only when it helps", "Watch who is eager to remove you"],
    next: "Discuss and vote. Your power matters when you die.",
  },
  Guard: {
    subtitle: "You protect one player each night.",
    abilities: ["Protect one alive player each night", "Cannot protect the same target twice in a row"],
    tips: ["Read likely wolf targets", "Protect confirmed roles when needed"],
    next: "When it is your turn, select a player to guard.",
  },
  Idiot: {
    subtitle: "If voted out, your identity can waste the village execution.",
    abilities: ["Survive execution by revealing", "Absorb pressure for stronger roles"],
    tips: ["Act useful, not chaotic", "Reveal pressure can expose wolves"],
    next: "Discuss and vote with the village.",
  },
};

function isNightPhase(phase: string) {
  return phase.startsWith("NIGHT") || phase === "ROLE_REVEAL";
}

function formatSeconds(ms: number) {
  return `${Math.max(0, Math.ceil(ms / 1000))}s`;
}

function getPlayerAvatar(seed: string) {
  return buildSimpleAvatarUrl(seed);
}

function toGamePlayer(player: MultiplayerSeat | MultiplayerPlayer, clientId: string): Player {
  const live = isMultiplayerPlayer(player) ? player : null;
  return {
    playerId: player.clientId,
    seat: player.seat,
    displayName: player.displayName,
    avatarSeed: player.avatarSeed,
    alive: live?.alive ?? true,
    role: live?.role ?? "Villager",
    alignment: live?.alignment ?? "village",
    isHuman: player.clientId === clientId,
    agentProfile: {
      modelRef: { provider: "newapi", model: "human" },
      persona: {
        mbti: "",
        gender: "nonbinary",
        age: 18,
        voiceRules: [],
        basicInfo: player.clientId === clientId ? "You" : "Online player",
      },
    },
  };
}

function createEmptyPlayer(seat: number): Player {
  return {
    playerId: `empty-${seat}`,
    seat,
    displayName: "",
    avatarSeed: `empty-${seat}`,
    alive: true,
    role: "Villager",
    alignment: "village",
    isHuman: false,
  };
}

function getPhaseText(room: MultiplayerRoom | null): string {
  const phase = room?.state?.phase ?? "LOBBY";
  switch (phase) {
    case "LOBBY":
      return "Lobby";
    case "ROLE_REVEAL":
      return "Role reveal";
    case "NIGHT_GUARD_ACTION":
      return "Guard action";
    case "NIGHT_WOLF_ACTION":
      return "Wolf action";
    case "NIGHT_WITCH_ACTION":
      return "Witch action";
    case "NIGHT_SEER_ACTION":
      return "Seer action";
    case "DAY_DISCUSSION":
      return "Day discussion";
    case "DAY_VOTE":
      return "Voting";
    case "DAY_RESOLVE":
      return "Vote result";
    case "GAME_END":
      return "Game end";
    default:
      return "Resolving";
  }
}

function getPhaseIcon(phase: string, isNight: boolean) {
  switch (phase) {
    case "NIGHT_GUARD_ACTION":
      return <Shield size={14} />;
    case "NIGHT_WOLF_ACTION":
      return <Skull size={14} />;
    case "NIGHT_WITCH_ACTION":
      return <Drop size={14} />;
    case "NIGHT_SEER_ACTION":
      return <Eye size={14} />;
    case "DAY_VOTE":
      return <VoteIcon size={14} />;
    default:
      return isNight ? <NightIcon size={14} /> : <DayIcon size={14} />;
  }
}

function isMultiplayerPlayer(player: unknown): player is MultiplayerPlayer {
  return (
    !!player &&
    typeof player === "object" &&
    "role" in player &&
    "alive" in player &&
    "alignment" in player
  );
}

export function OnlineMultiplayerApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRoom = searchParams.get("room") ?? "";
  const [clientId, setClientId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [joinCode, setJoinCode] = useState(initialRoom);
  const [playerCount, setPlayerCount] = useState(10);
  const [room, setRoom] = useState<MultiplayerRoom | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatText, setChatText] = useState("");
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [transitionCue, setTransitionCue] = useState<{ id: number; isNight: boolean; title: string; subtitle: string } | null>(null);
  const previousIsNightRef = useRef<boolean | null>(null);

  useEffect(() => {
    const id = getMultiplayerClientId();
    setClientId(id);
    setDisplayName(window.localStorage.getItem("wolfcha.multiplayer.name") || "");
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  const me = useMemo(() => {
    if (!room?.state || !clientId) return null;
    return room.state.players.find((p) => p.clientId === clientId) ?? null;
  }, [clientId, room]);

  const mySeat = useMemo(() => {
    if (!room || !clientId) return null;
    return room.seats.find((seat) => seat.clientId === clientId) ?? null;
  }, [clientId, room]);

  const isHost = !!room && room.hostClientId === clientId;
  const state = room?.state ?? null;
  const alivePlayers = state?.players.filter((p) => p.alive) ?? [];
  const phase = state?.phase ?? "LOBBY";
  const currentPlayerTotal = state?.players.length ?? room?.seats.length ?? 0;
  const canStartLobby = room?.status === "lobby" && room.seats.length >= MIN_PLAYERS_TO_START;
  const visualIsNight = isNightPhase(phase);
  const timerLeftMs = state?.phaseDeadlineAt ? state.phaseDeadlineAt - now : 0;
  const timerProgress = state?.phaseStartedAt && state.phaseDeadlineAt
    ? Math.max(0, Math.min(100, ((state.phaseDeadlineAt - now) / (state.phaseDeadlineAt - state.phaseStartedAt)) * 100))
    : 0;
  const wolfTarget = typeof state?.nightActions.wolfTarget === "number"
    ? state.players.find((player) => player.seat === state.nightActions.wolfTarget) ?? null
    : null;
  const tablePlayers = useMemo(() => {
    if (!room) return [];
    if (state?.players) return state.players.map((player) => toGamePlayer(player, clientId));
    return Array.from({ length: room.playerCount }, (_, seat) => {
      const seated = room.seats.find((player) => player.seat === seat);
      return seated ? toGamePlayer(seated, clientId) : createEmptyPlayer(seat);
    });
  }, [clientId, room, state?.players]);
  const leftPlayers = useMemo(() => tablePlayers.slice(0, Math.ceil(tablePlayers.length / 2)), [tablePlayers]);
  const rightPlayers = useMemo(() => tablePlayers.slice(Math.ceil(tablePlayers.length / 2)), [tablePlayers]);
  const legacyMe = useMemo(() => (me ? toGamePlayer(me, clientId) : null), [clientId, me]);
  const isWolfNightChat = phase === "NIGHT_WOLF_ACTION" && !!me && isWolfRole(me.role);
  const canUseChat = phase === "DAY_DISCUSSION" || phase === "DAY_VOTE" || isWolfNightChat;
  const aliveVoteStatus = useMemo(
    () => state?.players.filter((player) => player.alive).map((player) => ({
      player,
      voted: typeof state.votes[player.clientId] === "number",
    })) ?? [],
    [state]
  );
  const latestSystemMessages = useMemo(
    () => (state?.messages ?? []).filter((message) => message.isSystem).slice(-4),
    [state?.messages]
  );

  useEffect(() => {
    const previous = previousIsNightRef.current;
    if (previous === null) {
      previousIsNightRef.current = visualIsNight;
      return;
    }
    if (previous === visualIsNight) return;
    previousIsNightRef.current = visualIsNight;
    setTransitionCue({
      id: Date.now(),
      isNight: visualIsNight,
      title: visualIsNight ? "Night falls" : "Dawn breaks",
      subtitle: visualIsNight ? "Close your eyes" : "Open your eyes",
    });
    const timer = window.setTimeout(() => setTransitionCue(null), 1700);
    return () => window.clearTimeout(timer);
  }, [visualIsNight]);

  const fetchRoom = useCallback(async (code: string, id = clientId) => {
    if (!id) return;
    const res = await fetch(`/api/multiplayer/rooms/${encodeURIComponent(code)}?clientId=${encodeURIComponent(id)}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to load room");
    setRoom(json.room);
    router.replace(`/?room=${encodeURIComponent(json.room.code)}`);
  }, [clientId, router]);

  useEffect(() => {
    if (!initialRoom || !clientId) return;
    void fetchRoom(initialRoom, clientId).catch(() => {});
  }, [clientId, fetchRoom, initialRoom]);

  useEffect(() => {
    if (!room?.code || !clientId) return;
    const timer = window.setInterval(() => {
      void fetchRoom(room.code, clientId).catch(() => {});
    }, 1500);
    return () => window.clearInterval(timer);
  }, [clientId, fetchRoom, room?.code]);

  const persistName = (name: string) => {
    setDisplayName(name);
    window.localStorage.setItem("wolfcha.multiplayer.name", name);
  };

  const createRoom = async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/multiplayer/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, displayName, playerCount }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create room");
      setRoom(json.room);
      setJoinCode(json.room.code);
      router.replace(`/?room=${encodeURIComponent(json.room.code)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create room");
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async () => {
    if (!clientId || !joinCode.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/multiplayer/rooms/${encodeURIComponent(joinCode)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, displayName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to join room");
      setRoom(json.room);
      router.replace(`/?room=${encodeURIComponent(json.room.code)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not join room");
    } finally {
      setLoading(false);
    }
  };

  const sendAction = async (action: MultiplayerAction) => {
    if (!room) return;
    try {
      const res = await fetch(`/api/multiplayer/rooms/${encodeURIComponent(room.code)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Action failed");
      setRoom(json.room);
      setSelectedSeat(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    }
  };

  const leaveRoom = async () => {
    if (!room || !clientId) return;
    if (room.status === "lobby") {
      await sendAction({ type: "LEAVE_ROOM", clientId });
    }
    setRoom(null);
    setSelectedSeat(null);
    router.replace("/");
  };

  const copyInvite = async () => {
    if (!room) return;
    const url = `${window.location.origin}/?room=${room.code}`;
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  };

  const submitChat = async () => {
    const content = chatText.trim();
    if (!content || !clientId) return;
    setChatText("");
    await sendAction({ type: "CHAT", clientId, content });
  };

  const submitSelectedAction = async () => {
    if (!clientId || selectedSeat === null) return;
    if (phase === "DAY_VOTE") {
      await sendAction({ type: "VOTE", clientId, targetSeat: selectedSeat });
      return;
    }
    await sendAction({ type: "NIGHT_ACTION", clientId, targetSeat: selectedSeat });
  };

  const canSelectSeat = (player: MultiplayerPlayer) => {
    if (!me || !player.alive) return false;
    if (phase === "DAY_VOTE") return me.alive && player.clientId !== me.clientId;
    if (phase === "NIGHT_GUARD_ACTION") return me.role === "Guard";
    if (phase === "NIGHT_WOLF_ACTION") return isWolfRole(me.role) && !isWolfRole(player.role);
    if (phase === "NIGHT_WITCH_ACTION") return me.role === "Witch";
    if (phase === "NIGHT_SEER_ACTION") return me.role === "Seer" && player.clientId !== me.clientId;
    return false;
  };

  const canSelectGamePlayer = (player: Player) => {
    const livePlayer = state?.players.find((candidate) => candidate.seat === player.seat) ?? null;
    return !!livePlayer && canSelectSeat(livePlayer);
  };

  const actionHint = useMemo(() => {
    if (!state || !me) return "";
    if (phase === "ROLE_REVEAL") return state.roleAcks[clientId] ? "Waiting for everyone to confirm roles." : "Check your role, then confirm.";
    if (phase === "NIGHT_GUARD_ACTION") return me.role === "Guard" ? "Choose one player to protect." : "Waiting for the Guard.";
    if (phase === "NIGHT_WOLF_ACTION") return isWolfRole(me.role) ? "Wolves choose a target." : "Waiting for the wolves.";
    if (phase === "NIGHT_WITCH_ACTION") {
      if (me.role !== "Witch") return "Waiting for the Witch.";
      return wolfTarget ? `${wolfTarget.displayName} was attacked tonight. Save, poison, or pass.` : "No wolf target is visible tonight. Poison or pass.";
    }
    if (phase === "NIGHT_SEER_ACTION") return me.role === "Seer" ? "Choose one player to inspect." : "Waiting for the Seer.";
    if (phase === "DAY_DISCUSSION") return isHost ? "Discuss, then start voting when ready." : "Discuss and wait for host to start voting.";
    if (phase === "DAY_VOTE") return state.votes[clientId] !== undefined ? "Vote submitted." : "Vote for one alive player.";
    if (phase === "DAY_RESOLVE") return isHost ? "Advance to the next night." : "Waiting for host.";
    if (phase === "GAME_END") return state.winner === "wolf" ? "Werewolves win." : "Village wins.";
    return "";
  }, [clientId, isHost, me, phase, state, wolfTarget]);

  if (!room) {
    return (
      <main className="min-h-screen wc-contract-screen flex items-center justify-center px-5 selection:bg-[var(--color-accent)] selection:text-white">
        <div className="wc-contract-fog" aria-hidden="true" />
        <div className="wc-contract-vignette" aria-hidden="true" />
        <section className="relative z-10 wc-contract-paper w-full max-w-[460px]">
          <div className="wc-contract-borders" aria-hidden="true" />
          <div className="mt-2 text-center">
            <div className="wc-contract-title">WOLFCHA</div>
            <div className="wc-contract-subtitle">Online multiplayer</div>
          </div>
          <div className="mt-7 space-y-4">
            <label className="block text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Your name</label>
            <input
              value={displayName}
              onChange={(e) => persistName(e.target.value)}
              placeholder="Enter your name"
              className="wc-signature-input"
              autoFocus
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs text-[var(--text-muted)]">
                Players
                <select
                  value={playerCount}
                  onChange={(e) => setPlayerCount(Number(e.target.value))}
                  className="w-full rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                >
                  {PLAYER_COUNT_OPTIONS.map((count) => (
                    <option key={count} value={count}>{count}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={createRoom}
                disabled={loading || !displayName.trim()}
                className="self-end rounded-md border-2 border-[var(--color-accent)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Create room
              </button>
            </div>
            <div className="flex gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Room code"
                className="min-w-0 flex-1 rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm uppercase text-[var(--text-primary)]"
              />
              <button
                type="button"
                onClick={joinRoom}
                disabled={loading || !displayName.trim() || !joinCode.trim()}
                className="rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-50"
              >
                Join
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!mySeat) {
    return (
      <main className="min-h-screen wc-contract-screen flex items-center justify-center px-5 selection:bg-[var(--color-accent)] selection:text-white">
        <div className="wc-contract-fog" aria-hidden="true" />
        <div className="wc-contract-vignette" aria-hidden="true" />
        <section className="relative z-10 wc-contract-paper w-full max-w-[460px]">
          <div className="wc-contract-borders" aria-hidden="true" />
          <div className="mt-2 text-center">
            <div className="wc-contract-title">WOLFCHA</div>
            <div className="wc-contract-subtitle">Join room {room.code}</div>
          </div>
          <div className="mt-7 space-y-4">
            <div className="rounded-md border-2 border-[var(--border-color)] bg-white/50 px-3 py-2 text-sm text-[var(--text-secondary)]">
              {room.status === "lobby"
                ? `${room.seats.length}/${room.playerCount} players seated.`
                : "This game has already started."}
            </div>
            <input
              value={displayName}
              onChange={(e) => persistName(e.target.value)}
              placeholder="Enter your name"
              className="wc-signature-input"
              autoFocus
            />
            <button
              type="button"
              onClick={joinRoom}
              disabled={loading || !displayName.trim() || room.status !== "lobby"}
              className="w-full rounded-md border-2 border-[var(--color-accent)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Join this room
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main data-theme={visualIsNight ? "dark" : undefined} className="game-stage wc-multiplayer-game min-h-screen overflow-hidden text-[var(--text-primary)]">
      <GameBackground isNight={visualIsNight} isBlinking={!!transitionCue} />
      <div className="h-screen flex flex-col">
        <header className="wc-topbar wc-topbar--responsive shrink-0">
          <div className="wc-topbar__row-1 flex items-center justify-between w-full md:w-auto md:contents">
            <div className="wc-topbar__title">
              <WerewolfIcon size={22} className="text-[var(--color-blood)]" />
              <span>WOLFCHA</span>
            </div>
          </div>
          <div className="wc-topbar__info">
            <div className="wc-topbar__item">
              <span className="text-xs uppercase tracking-wider opacity-60">Room</span>
              <span className="font-serif text-lg font-bold">{room.code}</span>
            </div>
            <div className="wc-topbar__item">
              <span className="text-xs uppercase tracking-wider opacity-60">Day</span>
              <span className="font-serif text-lg font-bold">{state?.day ?? 0}</span>
            </div>
            <div className="wc-topbar__item">
              <span className="text-xs uppercase tracking-wider opacity-60">Alive</span>
              <span className="font-serif text-lg font-bold">{alivePlayers.length}/{currentPlayerTotal || room.playerCount}</span>
            </div>
            <div className="wc-phase-badge">
              {getPhaseIcon(phase, visualIsNight)}
              <span>{getPhaseText(room)}</span>
              {state?.phaseDeadlineAt && (
                <span className="inline-flex items-center gap-1 text-[var(--color-gold)]">
                  <Timer size={13} />
                  {formatSeconds(timerLeftMs)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {me && (
              <div className="hidden md:flex wc-topbar__item wc-topbar__item--role">
                <span className="text-xs uppercase tracking-wider opacity-60">Role</span>
                <span className="font-bold text-[var(--color-gold)]">{roleLabel[me.role]}</span>
              </div>
            )}
            <button
              type="button"
              onClick={copyInvite}
              className="inline-flex items-center gap-2 rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1 text-xs"
            >
              <Copy size={15} />
              Invite
            </button>
            <button
              type="button"
              onClick={leaveRoom}
              className="inline-flex items-center gap-2 rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
            >
              <SignOut size={15} />
              Out
            </button>
          </div>
        </header>

        <div className="flex-1 flex gap-4 lg:gap-6 lg:px-6 lg:py-6 overflow-hidden w-full justify-center min-h-0">
          <div className="hidden md:flex w-[220px] lg:w-[240px] xl:w-[260px] 2xl:w-[300px] flex-col gap-3 shrink-0 overflow-y-auto overflow-x-visible scrollbar-hide pt-2 pb-2 px-1 -mx-1">
            {leftPlayers.map((player, index) => (
              <PlayerCardCompact
                key={player.playerId}
                player={player}
                isSpeaking={false}
                canClick={!!state && player.alive && !player.playerId.startsWith("empty-") && canSelectGamePlayer(player)}
                isSelected={selectedSeat === player.seat}
                onClick={() => setSelectedSeat(player.seat)}
                animationDelay={index * 0.04}
                isNight={visualIsNight}
                humanPlayer={legacyMe}
                showRoleBadge={!!me && (player.isHuman || phase === "GAME_END" || (isWolfRole(me.role) && isWolfRole(player.role)))}
                selectionTone={phase === "DAY_VOTE" ? "vote" : isWolfRole(me?.role) ? "wolf" : me?.role === "Witch" ? "witch" : me?.role === "Seer" ? "seer" : "guard"}
                isInSelectionPhase={!!state}
              />
            ))}
          </div>

          <section className="wc-mp-center flex-1 flex flex-col min-w-0 min-h-0 h-full max-w-[980px] lg:max-w-[1100px] xl:max-w-[1200px] 2xl:max-w-[1280px] overflow-hidden">
            <div className="wc-mp-events">
              {latestSystemMessages.map((message) => (
                <div key={message.id} className="wc-mp-event-chip">{message.content}</div>
              ))}
            </div>

            <div className="wc-mp-action-stage">
              <div className="wc-mp-phase-orb">
                {getPhaseIcon(phase, visualIsNight)}
              </div>
              <div className="wc-mp-phase-title">{getPhaseText(room)}</div>
              <div className="wc-mp-phase-subtitle">{actionHint}</div>
              {state?.phaseDeadlineAt && (
                <div className="wc-mp-countdown" style={{ "--timer-progress": `${timerProgress}%` } as CSSProperties}>
                  <Timer size={15} />
                  <span>{formatSeconds(timerLeftMs)}</span>
                </div>
              )}

              {me && phase !== "LOBBY" && (
                <div className="wc-mp-role-brief">
                  <div className="wc-mp-role-brief__head">
                    <span>Your role</span>
                    <strong>{roleLabel[me.role]}</strong>
                    <p>{roleBrief[me.role].subtitle}</p>
                  </div>
                  <div className="wc-mp-role-brief__grid">
                    <div>
                      <span>Abilities</span>
                      {roleBrief[me.role].abilities.map((ability) => (
                        <p key={ability}>{ability}</p>
                      ))}
                    </div>
                    <div>
                      <span>Next</span>
                      <p>{roleBrief[me.role].next}</p>
                      {roleBrief[me.role].tips.slice(0, 1).map((tip) => (
                        <p key={tip}>{tip}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                {room.status === "lobby" && isHost && (
                  <button
                    type="button"
                    disabled={!canStartLobby}
                    onClick={() => sendAction({ type: "START_GAME", clientId })}
                    className="wc-mp-primary-btn disabled:opacity-50"
                  >
                    Start
                  </button>
                )}
                {phase === "DAY_DISCUSSION" && isHost && (
                  <button type="button" onClick={() => sendAction({ type: "START_VOTE", clientId })} className="wc-mp-primary-btn">
                    Force stop discuss
                  </button>
                )}
                {phase === "DAY_VOTE" && isHost && (
                  <button type="button" onClick={() => sendAction({ type: "END_VOTE", clientId })} className="wc-mp-primary-btn">
                    Force stop vote
                  </button>
                )}
                {phase === "DAY_RESOLVE" && isHost && (
                  <button type="button" onClick={() => sendAction({ type: "NEXT_NIGHT", clientId })} className="wc-mp-primary-btn">
                    Next night
                  </button>
                )}
              </div>

              {phase === "DAY_VOTE" && (
                <div className="wc-mp-vote-status">
                  {aliveVoteStatus.map(({ player, voted }) => (
                    <span key={player.clientId} className={voted ? "is-voted" : ""}>
                      {voted ? <CheckCircle size={12} weight="fill" /> : <Timer size={12} />}
                      Seat {player.seat + 1}
                    </span>
                  ))}
                </div>
              )}

              {phase === "NIGHT_WITCH_ACTION" && me?.role === "Witch" && (
                <div className="wc-mp-witch-target">
                  Wolf target: {wolfTarget ? `Seat ${wolfTarget.seat + 1}. ${wolfTarget.displayName}` : "No target visible"}
                </div>
              )}
            </div>

            <div className="wc-mp-dialog-box">
              <div className="wc-mp-dialog-title">
                {isWolfNightChat ? "Wolf night chat" : visualIsNight ? "Night log" : "Table chat"}
              </div>
              <div className="wc-mp-message-scroll">
                {(state?.messages ?? []).filter((message) => !message.isSystem).map((message) => (
                  <div
                    key={message.id}
                    className={[
                      "wc-mp-chat-line",
                      message.clientId === clientId ? "wc-mp-chat-line--mine" : "",
                      message.visibility === "wolves" ? "wc-mp-chat-line--wolves" : "",
                    ].join(" ")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={getPlayerAvatar(message.clientId)} alt="" />
                    <div>
                      <div className="wc-mp-chat-meta">
                        {message.playerName}
                        {message.visibility === "wolves" && <span>Wolf only</span>}
                      </div>
                      <div className="wc-speaker-bubble"><div className="wc-dialog-text">{message.content}</div></div>
                    </div>
                  </div>
                ))}
              </div>
              {canUseChat && (
                <div className="wc-mp-chat-input">
                  <input
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void submitChat();
                      }
                    }}
                    placeholder={isWolfNightChat ? "Wolf chat. Villagers cannot see this." : "Say something"}
                  />
                  <button type="button" onClick={submitChat}><PaperPlaneRight size={16} /></button>
                </div>
              )}
            </div>

            {selectedSeat !== null && (
              <div className="wc-mp-selection-bar">
                <span>Selected seat {selectedSeat + 1}</span>
                <button type="button" onClick={submitSelectedAction}>
                  {phase === "DAY_VOTE" ? <CheckCircle size={15} /> : <Shield size={15} />}
                  Confirm
                </button>
              </div>
            )}

            {phase === "NIGHT_WITCH_ACTION" && me?.role === "Witch" && (
              <div className="wc-mp-witch-actions">
                <button type="button" onClick={() => sendAction({ type: "NIGHT_ACTION", clientId, targetSeat: null, witchAction: "save" })}>
                  Save wolf target
                </button>
                <button type="button" disabled={selectedSeat === null} onClick={() => sendAction({ type: "NIGHT_ACTION", clientId, targetSeat: selectedSeat, witchAction: "poison" })}>
                  <Skull size={15} /> Poison selected
                </button>
                <button type="button" onClick={() => sendAction({ type: "NIGHT_ACTION", clientId, targetSeat: null, witchAction: "pass" })}>
                  Pass
                </button>
              </div>
            )}
          </section>

          <div className="hidden md:flex w-[220px] lg:w-[240px] xl:w-[260px] 2xl:w-[300px] flex-col gap-3 shrink-0 overflow-y-auto overflow-x-visible scrollbar-hide pt-2 pb-2 px-1 -mx-1">
            {rightPlayers.map((player, index) => (
              <PlayerCardCompact
                key={player.playerId}
                player={player}
                isSpeaking={false}
                canClick={!!state && player.alive && !player.playerId.startsWith("empty-") && canSelectGamePlayer(player)}
                isSelected={selectedSeat === player.seat}
                onClick={() => setSelectedSeat(player.seat)}
                animationDelay={index * 0.04}
                isNight={visualIsNight}
                humanPlayer={legacyMe}
                showRoleBadge={!!me && (player.isHuman || phase === "GAME_END" || (isWolfRole(me.role) && isWolfRole(player.role)))}
                selectionTone={phase === "DAY_VOTE" ? "vote" : isWolfRole(me?.role) ? "wolf" : me?.role === "Witch" ? "witch" : me?.role === "Seer" ? "seer" : "guard"}
                isInSelectionPhase={!!state}
              />
            ))}
          </div>
        </div>
      </div>
      {legacyMe && (
        <RoleRevealOverlay
          open={phase === "ROLE_REVEAL" && !state?.roleAcks[clientId]}
          player={legacyMe}
          phase={toGamePhase(phase)}
          onContinue={() => sendAction({ type: "ACK_ROLE", clientId })}
        />
      )}
      <AnimatePresence>
        {transitionCue && (
          <motion.div
            key={transitionCue.id}
            className="wc-mp-eye-transition"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="wc-mp-eye-transition__text">
              <div className="wc-transition-title">{transitionCue.title}</div>
              <div className="wc-transition-subtitle">{transitionCue.subtitle}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
