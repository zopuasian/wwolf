"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, Copy, Crosshair, Drop, Eye, FingerprintSimple, Gear, PaperPlaneRight, Robot, Shield, SignOut, Skull, Timer, UserMinus, UserPlus, UsersThree, X } from "@phosphor-icons/react";
import { DayIcon, NightIcon, VoteIcon, WerewolfIcon } from "@/components/icons/FlatIcons";
import { GameBackground } from "@/components/game/GameBackground";
import LoadingMiniGame from "@/components/game/MiniGame/LoadingMiniGame";
import { PlayerCardCompact } from "@/components/game/PlayerCardCompact";
import { RoleRevealOverlay } from "@/components/game/RoleRevealOverlay";
import { buildSimpleAvatarUrl } from "@/lib/avatar-config";
import { getMultiplayerClientId } from "@/lib/multiplayer/client-id";
import { isWolfRole, type Player, type Role } from "@/types/game";
import { toGamePhase, type MultiplayerAction, type MultiplayerPlayer, type MultiplayerRoom, type MultiplayerSeat } from "@/lib/multiplayer/types";
import {
  getDefaultMultiplayerRoles,
  getRoleAlignment,
  MULTIPLAYER_ROLE_LABEL,
  MULTIPLAYER_ROLE_OPTIONS,
  MULTIPLAYER_ROLE_PRESETS,
  validateRoleConfig,
  type MultiplayerRolePreset,
} from "@/lib/multiplayer/roles";

const roleLabel = MULTIPLAYER_ROLE_LABEL;

const MIN_PLAYERS_TO_START = 5;
const DEFAULT_CREATE_PLAYER_COUNT = 10;
const PLAYER_COUNT_OPTIONS = [5, 6, 7, 8, 9, 10, 11, 12];
const VISIBLE_TEST_STEP_DELAY_MS = 2600;

type PlayerActionChip = {
  label: string;
  tone?: "vote" | "wolf" | "curse";
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
      modelRef: { provider: "newapi", model: player.isBot ? "room-bot" : "human" },
      persona: {
        mbti: "",
        gender: "nonbinary",
        age: 18,
        voiceRules: [],
        basicInfo: player.clientId === clientId ? "You" : player.isBot ? "Adaptive room bot" : "Online player",
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
  const state = room?.state;
  const phase = state?.phase ?? "LOBBY";
  switch (phase) {
    case "LOBBY":
      return "Lobby";
    case "ROLE_REVEAL":
      return "Role reveal";
    case "NIGHT_DOPPELGANGER_ACTION":
      return "Doppelganger action";
    case "NIGHT_CUPID_ACTION":
      return "Cupid action";
    case "NIGHT_CULT_ACTION":
      return "Cult action";
    case "NIGHT_GUARD_ACTION":
      return "Guard action";
    case "NIGHT_WOLF_ACTION":
      if (state?.roleState?.bigBadWolfRecruitNight === state?.day) return "Wolf recruitment";
      return "Wolf action";
    case "NIGHT_BIG_BAD_WOLF_ACTION":
      return "Wolf recruitment";
    case "NIGHT_WITCH_ACTION":
      return "Witch action";
    case "NIGHT_SEER_ACTION":
      return "Seer action";
    case "NIGHT_SORCERER_ACTION":
      return "Sorcerer action";
    case "NIGHT_PI_ACTION":
      return "P.I. action";
    case "DAY_DISCUSSION":
      return "Day discussion";
    case "DAY_VOTE":
      return "Voting";
    case "HUNTER_SHOOT":
      return "Hunter shot";
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
    case "NIGHT_BIG_BAD_WOLF_ACTION":
      return <Skull size={14} />;
    case "NIGHT_WITCH_ACTION":
      return <Drop size={14} />;
    case "NIGHT_SEER_ACTION":
    case "NIGHT_SORCERER_ACTION":
    case "NIGHT_PI_ACTION":
      return <Eye size={14} />;
    case "HUNTER_SHOOT":
      return <Crosshair size={14} />;
    case "DAY_VOTE":
      return <VoteIcon size={14} />;
    default:
      return isNight ? <NightIcon size={14} /> : <DayIcon size={14} />;
  }
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

type RoleEditorProps = {
  roles: Role[];
  preset: MultiplayerRolePreset;
  disabled?: boolean;
  compact?: boolean;
  onPresetChange: (preset: MultiplayerRolePreset) => void;
  onRoleChange: (index: number, role: Role) => void;
  onApply?: () => void;
};

function RoleEditor({ roles, preset, disabled, compact, onPresetChange, onRoleChange, onApply }: RoleEditorProps) {
  const configError = validateRoleConfig(roles);
  const wolfCount = roles.filter((role) => isWolfRole(role)).length;
  const specialCount = roles.filter((role) => role !== "Villager" && !isWolfRole(role)).length;

  return (
    <div className={compact ? "wc-role-editor wc-role-editor--compact" : "wc-role-editor"}>
      <div className="wc-role-editor__head">
        <div>
          <span>Role setup</span>
          <strong>{roles.length} players</strong>
        </div>
        <div className="wc-role-editor__counts">
          <span>{wolfCount} wolf</span>
          <span>{specialCount} special</span>
        </div>
      </div>

      <div className="wc-role-editor__presets">
        {(Object.keys(MULTIPLAYER_ROLE_PRESETS) as MultiplayerRolePreset[]).map((key) => (
          <button
            key={key}
            type="button"
            disabled={disabled}
            className={preset === key ? "is-active" : ""}
            onClick={() => onPresetChange(key)}
            title={MULTIPLAYER_ROLE_PRESETS[key].description}
          >
            {MULTIPLAYER_ROLE_PRESETS[key].label}
          </button>
        ))}
      </div>

      <div className="wc-role-editor__grid">
        {roles.map((role, index) => (
          <label key={`${index}-${role}`} className="wc-role-editor__slot">
            <span>{index + 1}</span>
            <select
              value={role}
              disabled={disabled}
              onChange={(event) => onRoleChange(index, event.target.value as Role)}
            >
              {MULTIPLAYER_ROLE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {roleLabel[option]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="wc-role-editor__foot">
        <span className={configError ? "is-error" : "is-ok"}>{configError ?? "Role setup is ready."}</span>
        {onApply && (
          <button type="button" disabled={disabled || !!configError} onClick={onApply}>
            Save roles
          </button>
        )}
      </div>
    </div>
  );
}

export function OnlineMultiplayerApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRoom = searchParams.get("room") ?? "";
  const isVisibleTestMode = searchParams.get("uiTest") === "1";
  const [clientId, setClientId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [joinCode, setJoinCode] = useState(initialRoom);
  const [playerCount, setPlayerCount] = useState(DEFAULT_CREATE_PLAYER_COUNT);
  const [rolePreset, setRolePreset] = useState<MultiplayerRolePreset>("classic");
  const [roleEditorRoles, setRoleEditorRoles] = useState<Role[]>(() => getDefaultMultiplayerRoles(10, "classic"));
  const [room, setRoom] = useState<MultiplayerRoom | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatText, setChatText] = useState("");
  const [roomSettingsOpen, setRoomSettingsOpen] = useState(false);
  const [memberActionPending, setMemberActionPending] = useState<string | null>(null);
  const [endReportOpen, setEndReportOpen] = useState(false);
  const [previewRole, setPreviewRole] = useState<Role | null>(null);
  const [createTransition, setCreateTransition] = useState<{ code: string } | null>(null);
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);
  const [now, setNow] = useState(Date.now());
  const [transitionCue, setTransitionCue] = useState<{ id: number; isNight: boolean; title: string; subtitle: string } | null>(null);
  const [visibleTestLogs, setVisibleTestLogs] = useState<string[]>([]);
  const [visibleTestRunning, setVisibleTestRunning] = useState(false);
  const [visibleTestDone, setVisibleTestDone] = useState(false);
  const visibleTestStartedRef = useRef(false);
  const previousIsNightRef = useRef<boolean | null>(null);
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const endReportAutoOpenRef = useRef("");

  useEffect(() => {
    const id = getMultiplayerClientId();
    setClientId(id);
    setDisplayName(window.localStorage.getItem("wolfcha.multiplayer.name") || "");
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (room) return;
    setRoleEditorRoles(getDefaultMultiplayerRoles(DEFAULT_CREATE_PLAYER_COUNT, "classic"));
  }, [room]);

  useEffect(() => {
    if (room?.status !== "lobby") return;
    if (roomSettingsOpen && room.hostClientId === clientId) return;
    const lobbyRoleCount = room.playerCount;
    setPlayerCount(room.playerCount);
    setRolePreset(room.rolePreset ?? "classic");
    setRoleEditorRoles(
      room.roleConfig?.length === lobbyRoleCount
        ? room.roleConfig
        : getDefaultMultiplayerRoles(lobbyRoleCount, room.rolePreset ?? "classic")
    );
  }, [clientId, room?.actionSeq, room?.code, room?.hostClientId, room?.playerCount, room?.roleConfig, room?.rolePreset, room?.seats.length, room?.status, roomSettingsOpen]);

  const me = useMemo(() => {
    if (!room?.state || !clientId) return null;
    return room.state.players.find((p) => p.clientId === clientId) ?? null;
  }, [clientId, room]);

  const mySeat = useMemo(() => {
    if (!room || !clientId) return null;
    return room.seats.find((seat) => seat.clientId === clientId) ?? null;
  }, [clientId, room]);

  const isHost = !!room && room.hostClientId === clientId;
  const canEditRoomSettings = !!room && room.status === "lobby" && isHost;
  const state = room?.state ?? null;
  const alivePlayers = state?.players.filter((p) => p.alive) ?? [];
  const phase = state?.phase ?? "LOBBY";
  const currentPlayerTotal = state?.players.length ?? room?.seats.length ?? 0;
  const canStartLobby = room?.status === "lobby" && room.seats.length >= MIN_PLAYERS_TO_START;
  const visualIsNight = isNightPhase(phase) || (phase === "HUNTER_SHOOT" && state?.pendingHunterShot?.resumePhase === "DAY_DISCUSSION");
  const timerLeftMs = state?.phaseDeadlineAt ? state.phaseDeadlineAt - now : 0;
  const timerProgress = state?.phaseStartedAt && state.phaseDeadlineAt
    ? Math.max(0, Math.min(100, ((state.phaseDeadlineAt - now) / (state.phaseDeadlineAt - state.phaseStartedAt)) * 100))
    : 0;
  const wolfTarget = typeof state?.nightActions.wolfTarget === "number"
    ? state.players.find((player) => player.seat === state.nightActions.wolfTarget) ?? null
    : null;
  const isWolfActionPhase = phase === "NIGHT_WOLF_ACTION" || phase === "NIGHT_BIG_BAD_WOLF_ACTION";
  const wolfTurnOrder = state?.players
    .filter((player) => player.alive && isWolfRole(player.role))
    .sort((a, b) => a.seat - b.seat) ?? [];
  const isRecruitWolfNight = phase === "NIGHT_WOLF_ACTION" && !!state && (
    state.roleState?.bigBadWolfRecruitNight === state.day ||
    typeof state.nightActions.bigBadWolfRecruitConfirmedAt === "number"
  );
  const wolfActionConfirmed = isRecruitWolfNight
    ? typeof state?.nightActions.bigBadWolfRecruitConfirmedAt === "number"
    : typeof state?.nightActions.wolfTargetConfirmedAt === "number";
  const wolfTieSeats = isRecruitWolfNight
    ? state?.nightActions.bigBadWolfRecruitTieSeats ?? []
    : state?.nightActions.wolfTieSeats ?? [];
  const wolfVoteTurnIndex = isRecruitWolfNight
    ? state?.nightActions.bigBadWolfRecruitTurnIndex ?? 0
    : state?.nightActions.wolfVoteTurnIndex ?? 0;
  const currentWolfVoter = wolfTurnOrder[Math.min(wolfVoteTurnIndex, Math.max(0, wolfTurnOrder.length - 1))] ?? null;
  const isMyWolfTurn = !!me && isWolfRole(me.role) && currentWolfVoter?.clientId === clientId && !wolfActionConfirmed;
  const confirmedWolfTargets = useMemo(() => (
    isRecruitWolfNight
      ? typeof state?.nightActions.bigBadWolfRecruitTarget === "number"
        ? [state.nightActions.bigBadWolfRecruitTarget]
        : []
      : state?.nightActions.wolfTargets?.length
        ? state.nightActions.wolfTargets
        : typeof state?.nightActions.wolfTarget === "number"
          ? [state.nightActions.wolfTarget]
          : []
  ), [isRecruitWolfNight, state?.nightActions.bigBadWolfRecruitTarget, state?.nightActions.wolfTarget, state?.nightActions.wolfTargets]);
  const mySeerChecks = me?.role === "Seer" ? state?.nightActions.seerChecks[clientId] ?? [] : [];
  const latestSeerCheck = mySeerChecks.length > 0 ? mySeerChecks[mySeerChecks.length - 1] : null;
  const latestSeerTarget = typeof latestSeerCheck?.targetSeat === "number"
    ? state?.players.find((player) => player.seat === latestSeerCheck.targetSeat) ?? null
    : null;
  const mySorcererChecks = me?.role === "Sorcerer" ? state?.nightActions.sorcererChecks?.[clientId] ?? [] : [];
  const latestSorcererCheck = mySorcererChecks.length > 0 ? mySorcererChecks[mySorcererChecks.length - 1] : null;
  const latestSorcererTarget = typeof latestSorcererCheck?.targetSeat === "number"
    ? state?.players.find((player) => player.seat === latestSorcererCheck.targetSeat) ?? null
    : null;
  const myPiChecks = me?.role === "PI" ? state?.nightActions.piChecks?.[clientId] ?? [] : [];
  const latestPiCheck = myPiChecks.length > 0 ? myPiChecks[myPiChecks.length - 1] : null;
  const witchHealUsed = !!state?.roleAbilities.witchHealUsed;
  const witchPoisonUsed = !!state?.roleAbilities.witchPoisonUsed;
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
  const previewRolePlayer = useMemo<Player | null>(() => {
    if (!previewRole) return null;
    return {
      playerId: "role-preview",
      seat: 0,
      displayName: roleLabel[previewRole],
      avatarSeed: `role-preview-${previewRole}`,
      alive: true,
      role: previewRole,
      alignment: getRoleAlignment(previewRole),
      isHuman: true,
      agentProfile: {
        modelRef: { provider: "newapi", model: "role-guide" },
        persona: {
          mbti: "",
          gender: "nonbinary",
          age: 18,
          voiceRules: [],
          basicInfo: "Role guide",
        },
      },
    };
  }, [previewRole]);
  const isWolfNightChat = (phase === "NIGHT_WOLF_ACTION" || phase === "NIGHT_BIG_BAD_WOLF_ACTION") && !!me && isWolfRole(me.role);
  const canUseLobbyChat = room?.status === "lobby" && !!mySeat;
  const canUseChat = canUseLobbyChat || phase === "DAY_DISCUSSION" || phase === "DAY_VOTE" || isWolfNightChat;
  const shouldShowDialogBox = room?.status === "lobby" || phase === "DAY_DISCUSSION" || phase === "DAY_VOTE" || phase === "GAME_END" || isWolfNightChat;
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
  const visibleChatMessages = useMemo(
    () => (
      room?.status === "lobby"
        ? (room.lobbyMessages ?? [])
        : (state?.messages ?? []).filter((message) => !message.isSystem)
    ),
    [room?.lobbyMessages, room?.status, state?.messages]
  );

  useEffect(() => {
    const scrollEl = messageScrollRef.current;
    if (!scrollEl) return;
    const frame = window.requestAnimationFrame(() => {
      scrollEl.scrollTop = scrollEl.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [phase, visibleChatMessages.length]);

  useEffect(() => {
    if (!roomSettingsOpen || canEditRoomSettings) return;
    setRoomSettingsOpen(false);
  }, [canEditRoomSettings, roomSettingsOpen]);

  useEffect(() => {
    if (!roomSettingsOpen && !endReportOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setRoomSettingsOpen(false);
      setEndReportOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [endReportOpen, roomSettingsOpen]);

  useEffect(() => {
    if (phase !== "GAME_END" || !state?.winner || !room?.code) {
      setEndReportOpen(false);
      return;
    }
    const reportKey = `${room.code}-${room.actionSeq}-${state.winner}`;
    if (endReportAutoOpenRef.current === reportKey) return;
    endReportAutoOpenRef.current = reportKey;
    setEndReportOpen(true);
  }, [phase, room?.actionSeq, room?.code, state?.winner]);

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

  useEffect(() => {
    setSelectedSeat(null);
    setSelectedSeats([]);
  }, [phase]);

  const fetchRoom = useCallback(async (code: string, id = clientId) => {
    if (!id) return;
    const res = await fetch(`/api/multiplayer/rooms/${encodeURIComponent(code)}?clientId=${encodeURIComponent(id)}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to load room");
    setRoom(json.room);
    router.replace(`/?room=${encodeURIComponent(json.room.code)}${isVisibleTestMode ? "&uiTest=1" : ""}`);
  }, [clientId, isVisibleTestMode, router]);

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
    if (!clientId || !displayName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/multiplayer/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, displayName, playerCount: DEFAULT_CREATE_PLAYER_COUNT, rolePreset: "classic" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create room");
      setJoinCode(json.room.code);
      setCreateTransition({ code: json.room.code });
      await wait(1280);
      setRoom(json.room);
      router.replace(`/?room=${encodeURIComponent(json.room.code)}`);
      await wait(80);
      setCreateTransition(null);
    } catch (error) {
      setCreateTransition(null);
      toast.error(error instanceof Error ? error.message : "Could not create room");
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async () => {
    if (!clientId || !joinCode.trim() || !displayName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/multiplayer/rooms/${encodeURIComponent(joinCode)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, displayName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to join room");
      setJoinCode(json.room.code);
      setCreateTransition({ code: json.room.code });
      await wait(1280);
      setRoom(json.room);
      router.replace(`/?room=${encodeURIComponent(json.room.code)}`);
      await wait(80);
      setCreateTransition(null);
    } catch (error) {
      setCreateTransition(null);
      toast.error(error instanceof Error ? error.message : "Could not join room");
    } finally {
      setLoading(false);
    }
  };

  const sendAction = async (action: MultiplayerAction) => {
    if (!room) return false;
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
      setSelectedSeats([]);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
      return false;
    }
  };

  const updateLobbyPreset = (preset: MultiplayerRolePreset) => {
    setRolePreset(preset);
    setRoleEditorRoles(getDefaultMultiplayerRoles(playerCount, preset));
  };

  const updateLobbyRole = (index: number, role: Role) => {
    setRoleEditorRoles((roles) => roles.map((item, itemIndex) => (itemIndex === index ? role : item)));
  };

  const updateLobbyPlayerCount = (count: number) => {
    const nextCount = Math.max(count, room?.seats.length ?? MIN_PLAYERS_TO_START);
    setPlayerCount(nextCount);
    setRoleEditorRoles(getDefaultMultiplayerRoles(nextCount, rolePreset));
  };

  const saveLobbyRoles = async () => {
    if (!clientId) return;
    const saved = await sendAction({ type: "UPDATE_ROLE_CONFIG", clientId, roles: roleEditorRoles, preset: rolePreset, playerCount });
    if (saved) {
      setRoomSettingsOpen(false);
      toast.success("Room settings saved");
    }
  };

  const addRoomBots = async (count: number) => {
    if (!clientId || !room || count <= 0 || validateRoleConfig(roleEditorRoles)) return;
    setMemberActionPending("add-bot");
    try {
      const hasUnsavedRoomSetup =
        room.playerCount !== playerCount ||
        room.rolePreset !== rolePreset ||
        JSON.stringify(room.roleConfig ?? []) !== JSON.stringify(roleEditorRoles);
      if (hasUnsavedRoomSetup) {
        const saved = await sendAction({
          type: "UPDATE_ROLE_CONFIG",
          clientId,
          roles: roleEditorRoles,
          preset: rolePreset,
          playerCount,
        });
        if (!saved) return;
      }
      const added = await sendAction({ type: "ADD_BOT", clientId, count });
      if (added) toast.success(count === 1 ? "Bot added to the room" : `${count} bots added to the room`);
    } finally {
      setMemberActionPending(null);
    }
  };

  const kickRoomPlayer = async (seat: MultiplayerSeat) => {
    if (!clientId || seat.clientId === room?.hostClientId) return;
    const confirmed = window.confirm(`Remove ${seat.displayName} from this room?`);
    if (!confirmed) return;
    setMemberActionPending(seat.clientId);
    try {
      const removed = await sendAction({ type: "KICK_PLAYER", clientId, targetClientId: seat.clientId });
      if (removed) toast.success(`${seat.displayName} was removed`);
    } finally {
      setMemberActionPending(null);
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

  const addVisibleTestLog = useCallback((message: string) => {
    setVisibleTestLogs((logs) => [...logs.slice(-7), message]);
  }, []);

  const runVisibleTestStep = useCallback(async (action: string, code?: string) => {
    const res = await fetch("/api/multiplayer/test-driver", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, clientId, code }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Visible test step failed: ${action}`);
    if (json.room) {
      setRoom(json.room);
      setJoinCode(json.room.code);
      router.replace(`/?room=${encodeURIComponent(json.room.code)}&uiTest=1`);
    }
    return json as { code?: string; room?: MultiplayerRoom };
  }, [clientId, router]);

  const runVisibleTest = useCallback(async () => {
    if (!clientId || visibleTestRunning) return;
    setVisibleTestRunning(true);
    setVisibleTestDone(false);
    setVisibleTestLogs([]);
    try {
      addVisibleTestLog("Creating visible test room...");
      const setup = await runVisibleTestStep("setup");
      const testCode = setup.code || setup.room?.code;
      if (!testCode) throw new Error("Test room was not created.");

      addVisibleTestLog(`Room ${testCode} created with virtual players.`);
      await wait(VISIBLE_TEST_STEP_DELAY_MS);

      addVisibleTestLog("Accepting role reveal and jumping to Seer.");
      await runVisibleTestStep("ack-all", testCode);
      await wait(VISIBLE_TEST_STEP_DELAY_MS);

      addVisibleTestLog("Seer checks the wolf and shows result.");
      await runVisibleTestStep("seer-check", testCode);
      await wait(VISIBLE_TEST_STEP_DELAY_MS);

      addVisibleTestLog("Switching screen to Witch action.");
      await runVisibleTestStep("show-witch", testCode);
      await wait(VISIBLE_TEST_STEP_DELAY_MS);

      addVisibleTestLog("Witch uses heal potion once.");
      await runVisibleTestStep("witch-save", testCode);
      await wait(VISIBLE_TEST_STEP_DELAY_MS);

      addVisibleTestLog("Switching screen to Hunter shot.");
      await runVisibleTestStep("show-hunter", testCode);
      await wait(VISIBLE_TEST_STEP_DELAY_MS);

      addVisibleTestLog("Hunter shoots the wolf.");
      await runVisibleTestStep("hunter-shoot", testCode);
      addVisibleTestLog("Visible UI + mechanic test complete.");
      setVisibleTestDone(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Visible test failed.";
      addVisibleTestLog(message);
      toast.error(message);
    } finally {
      setVisibleTestRunning(false);
    }
  }, [addVisibleTestLog, clientId, runVisibleTestStep, visibleTestRunning]);

  const cleanupVisibleTestRoom = async () => {
    if (!room || !clientId) return;
    try {
      await runVisibleTestStep("cleanup", room.code);
      addVisibleTestLog(`Cleaned test room ${room.code}.`);
      setRoom(null);
      setSelectedSeat(null);
      setVisibleTestDone(false);
      router.replace("/?uiTest=1");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not clean test room");
    }
  };

  useEffect(() => {
    if (!isVisibleTestMode || initialRoom || !clientId || visibleTestStartedRef.current) return;
    visibleTestStartedRef.current = true;
    void runVisibleTest();
  }, [clientId, initialRoom, isVisibleTestMode, runVisibleTest]);

  const submitChat = async () => {
    const content = chatText.trim();
    if (!content || !clientId) return;
    setChatText("");
    await sendAction({ type: "CHAT", clientId, content });
  };

  const submitSelectedAction = async () => {
    if (!clientId) return;
    if (phase === "DAY_VOTE") {
      if (selectedSeat === null) return;
      await sendAction({ type: "VOTE", clientId, targetSeat: selectedSeat });
      return;
    }
    if (phase === "HUNTER_SHOOT") {
      if (selectedSeat === null) return;
      await sendAction({ type: "HUNTER_SHOOT", clientId, targetSeat: selectedSeat });
      return;
    }
    if (phase === "NIGHT_CUPID_ACTION") {
      if (selectedSeats.length !== 2) return;
      await sendAction({ type: "NIGHT_ACTION", clientId, targetSeat: selectedSeats[0], secondTargetSeat: selectedSeats[1] });
      return;
    }
    if (selectedSeat === null) return;
    await sendAction({ type: "NIGHT_ACTION", clientId, targetSeat: selectedSeat });
  };

  const canSelectSeat = (player: MultiplayerPlayer) => {
    if (!me || !player.alive) return false;
    if (phase === "DAY_VOTE") return me.alive && player.clientId !== me.clientId;
    if (phase === "HUNTER_SHOOT") return me.role === "Hunter" && state?.pendingHunterShot?.hunterClientId === me.clientId && player.clientId !== me.clientId;
    if (phase === "NIGHT_DOPPELGANGER_ACTION") return me.role === "Doppelganger" && player.clientId !== me.clientId;
    if (phase === "NIGHT_CUPID_ACTION") return me.role === "Cupid";
    if (phase === "NIGHT_CULT_ACTION") return me.role === "CultLeader" && player.clientId !== me.clientId;
    if (phase === "NIGHT_GUARD_ACTION") return me.role === "Guard" && player.clientId !== me.clientId;
    if (phase === "NIGHT_WOLF_ACTION" || phase === "NIGHT_BIG_BAD_WOLF_ACTION") {
      return isMyWolfTurn &&
        !isWolfRole(player.role) &&
        (wolfTieSeats.length === 0 || wolfTieSeats.includes(player.seat));
    }
    if (phase === "NIGHT_WITCH_ACTION") return me.role === "Witch" && !witchPoisonUsed;
    if (phase === "NIGHT_SEER_ACTION") return me.role === "Seer" && player.clientId !== me.clientId;
    if (phase === "NIGHT_SORCERER_ACTION") return me.role === "Sorcerer" && player.clientId !== me.clientId;
    if (phase === "NIGHT_PI_ACTION") return me.role === "PI";
    return false;
  };

  const selectGamePlayer = (player: Player) => {
    if (phase === "NIGHT_CUPID_ACTION") {
      setSelectedSeat(null);
      setSelectedSeats((seats) => {
        if (seats.includes(player.seat)) return seats.filter((seat) => seat !== player.seat);
        return [...seats, player.seat].slice(-2);
      });
      return;
    }
    setSelectedSeats([]);
    setSelectedSeat(player.seat);
  };

  const canSelectGamePlayer = (player: Player) => {
    const livePlayer = state?.players.find((candidate) => candidate.seat === player.seat) ?? null;
    return !!livePlayer && canSelectSeat(livePlayer);
  };

  const playerActionChips = useMemo<Record<number, PlayerActionChip>>(() => {
    if (!state) return {};
    const chipBySeat: Record<number, PlayerActionChip> = {};
    const getTargetName = (seat: number) => {
      const target = state.players.find((player) => player.seat === seat);
      return target ? target.displayName : `Seat ${seat + 1}`;
    };

    if (phase === "DAY_VOTE") {
      for (const voter of state.players) {
        const targetSeat = state.votes[voter.clientId];
        if (typeof targetSeat === "number") {
          chipBySeat[voter.seat] = { label: `Vote: ${getTargetName(targetSeat)}`, tone: "vote" };
        }
      }
      return chipBySeat;
    }

    if ((phase === "NIGHT_WOLF_ACTION" || phase === "NIGHT_BIG_BAD_WOLF_ACTION") && me && isWolfRole(me.role)) {
      const isRecruitNight = state.roleState?.bigBadWolfRecruitNight === state.day;
      const wolfVotes = isRecruitNight ? state.nightActions.bigBadWolfRecruitVotes ?? {} : state.nightActions.wolfVotes;
      for (const voter of state.players) {
        const targetSeat = wolfVotes[voter.clientId];
        if (typeof targetSeat === "number") {
          chipBySeat[voter.seat] = {
            label: `${isRecruitNight ? "Curse" : "Bite"}: ${getTargetName(targetSeat)}`,
            tone: isRecruitNight ? "curse" : "wolf",
          };
        }
      }
    }

    return chipBySeat;
  }, [me, phase, state]);

  const wolfChoiceStatus = useMemo(() => {
    if (!state || !me || !isWolfRole(me.role) || (phase !== "NIGHT_WOLF_ACTION" && phase !== "NIGHT_BIG_BAD_WOLF_ACTION")) return [];
    const isRecruitNight = state.roleState?.bigBadWolfRecruitNight === state.day;
    const votes = isRecruitNight ? state.nightActions.bigBadWolfRecruitVotes ?? {} : state.nightActions.wolfVotes;
    return state.players
      .filter((player) => player.alive && isWolfRole(player.role))
      .map((wolf) => {
        const targetSeat = votes[wolf.clientId];
        const target = typeof targetSeat === "number"
          ? state.players.find((player) => player.seat === targetSeat) ?? null
          : null;
        return {
          wolf,
          target,
          label: target
            ? `${isRecruitNight ? "Curse" : "Bite"}: ${target.displayName}`
            : currentWolfVoter?.clientId === wolf.clientId
              ? "Choosing now"
              : "Waiting",
          tone: isRecruitNight ? "curse" : "wolf",
        };
      });
  }, [currentWolfVoter?.clientId, me, phase, state]);
  const wolfTargetChoiceChips = useMemo<Record<number, PlayerActionChip[]>>(() => {
    if (!state || !me || !isWolfRole(me.role) || (phase !== "NIGHT_WOLF_ACTION" && phase !== "NIGHT_BIG_BAD_WOLF_ACTION")) return {};
    const isRecruitNight = state.roleState?.bigBadWolfRecruitNight === state.day;
    const votes = isRecruitNight ? state.nightActions.bigBadWolfRecruitVotes ?? {} : state.nightActions.wolfVotes;
    const chipsByTarget: Record<number, PlayerActionChip[]> = {};
    for (const wolf of state.players.filter((player) => player.alive && isWolfRole(player.role))) {
      const targetSeat = votes[wolf.clientId];
      if (typeof targetSeat !== "number") continue;
      chipsByTarget[targetSeat] = [
        ...(chipsByTarget[targetSeat] ?? []),
        {
          label: `${wolf.displayName} ${isRecruitNight ? "curses" : "bites"}`,
          tone: isRecruitNight ? "curse" : "wolf",
        },
      ];
    }
    return chipsByTarget;
  }, [me, phase, state]);
  const myDayVoteSeat = state?.votes[clientId];
  const myWolfActionSeat = me && isWolfRole(me.role)
    ? isRecruitWolfNight
      ? state?.nightActions.bigBadWolfRecruitVotes?.[clientId]
      : state?.nightActions.wolfVotes?.[clientId]
    : undefined;
  const mySubmittedTargetSeat = phase === "DAY_VOTE"
    ? myDayVoteSeat
    : phase === "NIGHT_WOLF_ACTION" || phase === "NIGHT_BIG_BAD_WOLF_ACTION"
      ? myWolfActionSeat
      : undefined;
  const getPlayerNameBySeat = (seat: number | undefined) => {
    if (typeof seat !== "number") return "";
    const player = state?.players.find((candidate) => candidate.seat === seat);
    return player ? player.displayName : `Seat ${seat + 1}`;
  };
  const winnerLabel = (() => {
    if (state?.winner === "wolf") return "Werewolves win";
    if (state?.winner === "tanner") return "Tanner wins";
    if (state?.winner === "cult") return "Cult wins";
    if (state?.winner === "village") return "Village wins";
    return "Game result";
  })();
  const finalRoleRows = useMemo(() => (
    state?.players
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map((player) => ({
        player,
        role: roleLabel[player.role],
        alignment: player.alignment === "wolf" ? "Wolf team" : player.alignment === "village" ? "Village team" : player.alignment,
      })) ?? []
  ), [state?.players]);
  const gameLogEntries = useMemo(() => {
    if (!state) return [];
    const getName = (seat: number | undefined | null) => {
      if (typeof seat !== "number") return "";
      const player = state.players.find((candidate) => candidate.seat === seat);
      return player ? `Seat ${seat + 1}. ${player.displayName}` : `Seat ${seat + 1}`;
    };
    const historyDays = [
      ...Object.keys(state.nightHistory).map(Number),
      ...Object.keys(state.dayHistory).map(Number),
      state.day,
    ].filter((day) => Number.isFinite(day) && day > 0);
    const maxDay = Math.max(0, ...historyDays);
    const entries: { id: string; title: string; items: string[] }[] = [];

    for (let day = 1; day <= maxDay; day += 1) {
      const night = state.nightHistory[day];
      if (night) {
        const items: string[] = [];
        const wolfTargets = night.wolfTargets?.length
          ? night.wolfTargets
          : typeof night.wolfTarget === "number"
            ? [night.wolfTarget]
            : [];
        if (wolfTargets.length > 0) items.push(`Wolves targeted ${wolfTargets.map(getName).join(", ")}.`);
        if (typeof night.guardTarget === "number") items.push(`Guard protected ${getName(night.guardTarget)}.`);
        if (night.witchSave) items.push("Witch used heal potion.");
        if (typeof night.witchPoison === "number") items.push(`Witch poisoned ${getName(night.witchPoison)}.`);
        if (night.deaths.length > 0) {
          items.push(`Deaths: ${night.deaths.map(getName).join(", ")}.`);
        } else {
          items.push("No one died during the night.");
        }
        if (night.hunterShot) {
          items.push(`Hunter ${getName(night.hunterShot.hunterSeat)} shot ${getName(night.hunterShot.targetSeat)}.`);
        }
        entries.push({ id: `night-${day}`, title: `Night ${day}`, items });
      }

      const dayLog = state.dayHistory[day];
      if (dayLog) {
        const items: string[] = [];
        if (dayLog.tied) {
          items.push("The vote tied. Nobody was executed.");
        } else if (typeof dayLog.executedSeat === "number") {
          items.push(`${getName(dayLog.executedSeat)} was executed by vote.`);
        } else {
          items.push("No player was executed by vote.");
        }
        if (dayLog.hunterShot) {
          items.push(`Hunter ${getName(dayLog.hunterShot.hunterSeat)} shot ${getName(dayLog.hunterShot.targetSeat)}.`);
        }
        entries.push({ id: `day-${day}`, title: `Day ${day}`, items });
      }
    }

    const systemMessages = state.messages.filter((message) => message.isSystem);
    if (systemMessages.length > 0) {
      entries.push({
        id: "system",
        title: "Announcements",
        items: systemMessages.map((message) => message.content),
      });
    }

    const chatMessages = state.messages.filter((message) => !message.isSystem);
    if (chatMessages.length > 0) {
      entries.push({
        id: "chat",
        title: "Chat transcript",
        items: chatMessages.map((message) => `${message.visibility === "wolves" ? "[Wolf] " : ""}${message.playerName}: ${message.content}`),
      });
    }

    return entries;
  }, [state]);
  const actionTargets = state?.players.filter((player) => player.alive && canSelectSeat(player)) ?? [];
  const canUseActionConsole = !!state && !!me && (
    (phase === "DAY_VOTE" && me.alive) ||
    (phase === "HUNTER_SHOOT" && me.role === "Hunter" && state.pendingHunterShot?.hunterClientId === me.clientId) ||
    (me.alive && (
      (phase === "NIGHT_DOPPELGANGER_ACTION" && me.role === "Doppelganger") ||
      (phase === "NIGHT_CUPID_ACTION" && me.role === "Cupid") ||
      (phase === "NIGHT_CULT_ACTION" && me.role === "CultLeader") ||
      (phase === "NIGHT_GUARD_ACTION" && me.role === "Guard") ||
      (phase === "NIGHT_WOLF_ACTION" && isWolfRole(me.role)) ||
      (phase === "NIGHT_BIG_BAD_WOLF_ACTION" && isWolfRole(me.role)) ||
      (phase === "NIGHT_WITCH_ACTION" && me.role === "Witch") ||
      (phase === "NIGHT_SEER_ACTION" && me.role === "Seer") ||
      (phase === "NIGHT_SORCERER_ACTION" && me.role === "Sorcerer") ||
      (phase === "NIGHT_PI_ACTION" && me.role === "PI")
    ))
  );
  const actionConsoleTitle = (() => {
    if (phase === "DAY_VOTE") return "Cast your vote";
    if (phase === "HUNTER_SHOOT") return "Hunter shot";
    if (phase === "NIGHT_DOPPELGANGER_ACTION") return "Copy a role";
    if (phase === "NIGHT_CUPID_ACTION") return "Bind two lovers";
    if (phase === "NIGHT_CULT_ACTION") return "Recruit to cult";
    if (phase === "NIGHT_GUARD_ACTION") return "Protect a player";
    if (phase === "NIGHT_WOLF_ACTION") {
      if (wolfActionConfirmed) return isRecruitWolfNight ? "The curse is sealed" : "Tonight's target";
      if (wolfTieSeats.length > 1) return "Break the tie";
      return isRecruitWolfNight ? "Choose a new wolf" : "Choose a bite";
    }
    if (phase === "NIGHT_BIG_BAD_WOLF_ACTION") return "Choose a new wolf";
    if (phase === "NIGHT_WITCH_ACTION") return "Use your potion";
    if (phase === "NIGHT_SEER_ACTION") return "Inspect a player";
    if (phase === "NIGHT_SORCERER_ACTION") return "Search the dark";
    if (phase === "NIGHT_PI_ACTION") return "Inspect neighbors";
    return getPhaseText(room);
  })();
  const actionConfirmLabel = (() => {
    if (phase === "DAY_VOTE") return "Submit vote";
    if (phase === "HUNTER_SHOOT") return "Shoot";
    if (phase === "NIGHT_DOPPELGANGER_ACTION") return "Copy role";
    if (phase === "NIGHT_CUPID_ACTION") return "Bind lovers";
    if (phase === "NIGHT_CULT_ACTION") return "Recruit";
    if (phase === "NIGHT_GUARD_ACTION") return "Protect";
    if (phase === "NIGHT_WOLF_ACTION") return isRecruitWolfNight ? "Confirm curse" : "Confirm bite";
    if (phase === "NIGHT_BIG_BAD_WOLF_ACTION") return "Confirm curse";
    if (phase === "NIGHT_SEER_ACTION" || phase === "NIGHT_SORCERER_ACTION" || phase === "NIGHT_PI_ACTION") return "Inspect";
    return "Confirm";
  })();
  const actionSelectionText = phase === "NIGHT_CUPID_ACTION"
    ? selectedSeats.length > 0
      ? selectedSeats.map((seat) => getPlayerNameBySeat(seat)).join(" + ")
      : "Choose 2 players"
    : selectedSeat !== null
      ? getPlayerNameBySeat(selectedSeat)
      : "Choose a player";
  const actionSubmittedText = typeof mySubmittedTargetSeat === "number"
    ? `${phase === "DAY_VOTE" ? "Your vote" : isRecruitWolfNight ? "Your curse" : "Your bite"}: ${getPlayerNameBySeat(mySubmittedTargetSeat)}`
    : "";
  const isActionSubmitted = typeof mySubmittedTargetSeat === "number";
  const actionConfirmDisabled = isActionSubmitted ||
    (isWolfActionPhase && !isMyWolfTurn) ||
    (phase === "NIGHT_CUPID_ACTION" ? selectedSeats.length !== 2 : selectedSeat === null);

  const actionHint = useMemo(() => {
    if (!state || !me) return "";
    if (phase === "ROLE_REVEAL") return state.roleAcks[clientId] ? "Waiting for everyone to confirm roles." : "Check your role, then confirm.";
    if (phase === "NIGHT_DOPPELGANGER_ACTION") return me.role === "Doppelganger" ? "Choose one player to copy." : "Waiting for the Doppelganger.";
    if (phase === "NIGHT_CUPID_ACTION") return me.role === "Cupid" ? "Choose two players to become lovers." : "Waiting for Cupid.";
    if (phase === "NIGHT_CULT_ACTION") return me.role === "CultLeader" ? "Recruit one player into the cult." : "Waiting for the Cult Leader.";
    if (phase === "NIGHT_GUARD_ACTION") return me.role === "Guard" ? "Choose another player to protect." : "Waiting for the Guard.";
    if (phase === "NIGHT_WOLF_ACTION") {
      const isRecruitNight = state.roleState?.bigBadWolfRecruitNight === state.day;
      if (isWolfRole(me.role)) {
        if (wolfActionConfirmed) {
          const targetNames = confirmedWolfTargets
            .map((seat) => state.players.find((player) => player.seat === seat)?.displayName ?? `Seat ${seat + 1}`)
            .join(", ");
          return isRecruitWolfNight
            ? `${targetNames} will join the wolves tonight.`
            : `The pack will attack ${targetNames} tonight.`;
        }
        if (wolfTieSeats.length > 1) {
          return isMyWolfTurn
            ? "The vote tied. Choose one of the highlighted targets."
            : `The vote tied. Waiting for ${currentWolfVoter?.displayName ?? "the next wolf"}.`;
        }
        return isMyWolfTurn
          ? isRecruitNight
            ? "It is your turn. Choose one player to turn into a wolf. No bite tonight."
            : "It is your turn. Choose the pack's target."
          : `Waiting for ${currentWolfVoter?.displayName ?? "the next wolf"} to choose.`;
      }
      return isRecruitNight ? "Waiting for the wolves to recruit." : "Waiting for the wolves.";
    }
    if (phase === "NIGHT_BIG_BAD_WOLF_ACTION") return isWolfRole(me.role) ? "Choose one non-wolf player to recruit into the pack." : "Waiting for the wolves to recruit.";
    if (phase === "NIGHT_WITCH_ACTION") {
      if (me.role !== "Witch") return "Waiting for the Witch.";
      const saveText = witchHealUsed ? "heal used" : "heal ready";
      const poisonText = witchPoisonUsed ? "poison used" : "poison ready";
      return wolfTarget ? `${wolfTarget.displayName} was attacked tonight. ${saveText}, ${poisonText}.` : `No wolf target is visible tonight. ${saveText}, ${poisonText}.`;
    }
    if (phase === "NIGHT_SEER_ACTION") return me.role === "Seer" ? "Choose one player to inspect." : "Waiting for the Seer.";
    if (phase === "NIGHT_SORCERER_ACTION") return me.role === "Sorcerer" ? "Search for a wolf or the Seer." : "Waiting for the Sorcerer.";
    if (phase === "NIGHT_PI_ACTION") return me.role === "PI" ? "Choose a center seat to inspect that player and both neighbors." : "Waiting for the P.I.";
    if (phase === "HUNTER_SHOOT") return me.role === "Hunter" && state.pendingHunterShot?.hunterClientId === clientId ? "You died as Hunter. Choose one player to take with you." : "Waiting for the Hunter shot.";
    if (phase === "DAY_DISCUSSION") return isHost ? "Discuss, then start voting when ready." : "Discuss and wait for host to start voting.";
    if (phase === "DAY_VOTE") return state.votes[clientId] !== undefined ? "Vote submitted." : "Vote for one alive player.";
    if (phase === "DAY_RESOLVE") return "Next night starts automatically.";
    if (phase === "GAME_END") {
      if (state.winner === "wolf") return "Werewolves win.";
      if (state.winner === "tanner") return "Tanner wins.";
      if (state.winner === "cult") return "Cult wins.";
      return "Village wins.";
    }
    return "";
  }, [clientId, confirmedWolfTargets, currentWolfVoter?.displayName, isHost, isMyWolfTurn, isRecruitWolfNight, me, phase, state, witchHealUsed, witchPoisonUsed, wolfActionConfirmed, wolfTarget, wolfTieSeats.length]);

  const visibleTestPanel = isVisibleTestMode ? (
    <div className="wc-visible-test-panel">
      <div className="wc-visible-test-panel__head">
        <span>Visible test</span>
        <strong>{visibleTestRunning ? "Running" : visibleTestDone ? "Done" : "Ready"}</strong>
      </div>
      <div className="wc-visible-test-panel__logs">
        {(visibleTestLogs.length ? visibleTestLogs : ["Open /?uiTest=1 to auto-run."]).map((log, index) => (
          <div key={`${log}-${index}`}>{log}</div>
        ))}
      </div>
      <div className="wc-visible-test-panel__actions">
        <button type="button" disabled={visibleTestRunning || !clientId} onClick={() => void runVisibleTest()}>
          Run again
        </button>
        <button type="button" disabled={visibleTestRunning || !room} onClick={() => void cleanupVisibleTestRoom()}>
          Cleanup
        </button>
      </div>
    </div>
  ) : null;

  const createTransitionOverlay = (
    <AnimatePresence>
      {createTransition && (
        <motion.div
          className="wc-room-camera-transition"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="wc-room-camera-transition__tunnel"
            initial={{ scale: 0.78, opacity: 0 }}
            animate={{ scale: 1.34, opacity: 1 }}
            exit={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="wc-room-camera-transition__iris" />
          </motion.div>
          <motion.div
            className="wc-room-camera-transition__text"
            initial={{ y: 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.38, delay: 0.14 }}
          >
            <span>Room {createTransition.code}</span>
            <strong>The seal is opening</strong>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (!room) {
    return (
      <main className="min-h-screen wc-contract-screen flex items-center justify-center px-5 selection:bg-[var(--color-accent)] selection:text-white">
        <div className="wc-contract-fog" aria-hidden="true" />
        <div className="wc-contract-vignette" aria-hidden="true" />
        <motion.section
          className="relative z-10 wc-contract-paper wc-mp-create-contract w-full"
          animate={createTransition
            ? { y: -34, scale: 1.08, rotateX: 7, filter: "blur(1px)" }
            : { y: 0, scale: 1, rotateX: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="wc-contract-borders" aria-hidden="true" />
          <div className="mt-2 text-center">
            <div className="wc-contract-title">WOLFCHA</div>
            <div className="wc-contract-subtitle">The blood pact</div>
          </div>
          <div className="wc-mp-contract-oath">
            <p>I enter by my name and keep my face hidden when night arrives.</p>
            <p>Let the room be sealed. Let the table open.</p>
          </div>
          <div className="mt-6 space-y-4">
            <label className="wc-contract-label block text-center">Sign your name</label>
            <input
              value={displayName}
              onChange={(e) => persistName(e.target.value)}
              placeholder="Enter your name"
              className="wc-signature-input"
              autoFocus
            />
            <div className="wc-mp-contract-actions">
              <div className="wc-seal-hint">Press the seal to summon a room</div>
              <button
                type="button"
                onClick={createRoom}
                disabled={loading || !displayName.trim() || !!createTransition}
                className="wc-wax-seal wc-wax-seal--create"
                aria-label="Create a room"
              >
                <FingerprintSimple weight="fill" size={46} className="wc-wax-seal-icon" />
              </button>
            </div>
            <div className="wc-mp-contract-divider">
              <span>Already sealed</span>
            </div>
            <div className="wc-mp-join-row">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Room code"
              />
              <button
                type="button"
                onClick={joinRoom}
                disabled={loading || !displayName.trim() || !joinCode.trim() || !!createTransition}
              >
                Join
              </button>
            </div>
          </div>
        </motion.section>
        {createTransitionOverlay}
        {visibleTestPanel}
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
            <div className="mt-4 flex flex-col items-center gap-3">
              <div className="wc-seal-hint">
                {room.status === "lobby" ? "Press the seal to join" : "This seal is closed"}
              </div>
              <button
                type="button"
                onClick={joinRoom}
                disabled={loading || !displayName.trim() || room.status !== "lobby" || !!createTransition}
                className="wc-wax-seal"
                aria-label="Join this room"
              >
                <FingerprintSimple weight="fill" size={44} className="wc-wax-seal-icon" />
              </button>
            </div>
          </div>
        </section>
        {createTransitionOverlay}
        {visibleTestPanel}
      </main>
    );
  }

  return (
    <main data-theme={visualIsNight ? "dark" : undefined} className="game-stage wc-multiplayer-game min-h-screen overflow-hidden text-[var(--text-primary)]">
      {createTransitionOverlay}
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
            {room.status !== "lobby" && (
              <>
                <div className="wc-topbar__item">
                  <span className="text-xs uppercase tracking-wider opacity-60">Day</span>
                  <span className="font-serif text-lg font-bold">{state?.day ?? 0}</span>
                </div>
                <div className="wc-topbar__item">
                  <span className="text-xs uppercase tracking-wider opacity-60">Alive</span>
                  <span className="font-serif text-lg font-bold">{alivePlayers.length}/{currentPlayerTotal || room.playerCount}</span>
                </div>
              </>
            )}
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
            {canEditRoomSettings && (
              <button
                type="button"
                onClick={() => setRoomSettingsOpen(true)}
                className="wc-header-icon-btn"
                aria-haspopup="dialog"
                aria-expanded={roomSettingsOpen}
              >
                <Gear size={15} />
                <span>Settings</span>
              </button>
            )}
            <button
              type="button"
              onClick={copyInvite}
              className="wc-header-icon-btn"
            >
              <Copy size={15} />
              <span>Invite</span>
            </button>
            <button
              type="button"
              onClick={leaveRoom}
              className="wc-header-icon-btn wc-header-icon-btn--muted"
            >
              <SignOut size={15} />
              <span>Out</span>
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
                isSelected={selectedSeat === player.seat || selectedSeats.includes(player.seat)}
                onClick={() => selectGamePlayer(player)}
                animationDelay={index * 0.04}
                isNight={visualIsNight}
                humanPlayer={legacyMe}
                isBot={room.seats.find((seat) => seat.clientId === player.playerId)?.isBot}
                showRoleBadge={!!me && (player.isHuman || phase === "GAME_END" || (isWolfRole(me.role) && isWolfRole(player.role)))}
                selectionTone={phase === "DAY_VOTE" ? "vote" : isWolfRole(me?.role) ? "wolf" : me?.role === "Witch" ? "witch" : me?.role === "Seer" ? "seer" : "guard"}
                isInSelectionPhase={!!state}
                actionChip={playerActionChips[player.seat]}
              />
            ))}
          </div>

          <section
            className={[
              "wc-mp-center flex-1 flex flex-col min-w-0 min-h-0 h-full max-w-[980px] lg:max-w-[1100px] xl:max-w-[1200px] 2xl:max-w-[1280px] overflow-hidden",
              room.status === "lobby" ? "wc-mp-center--lobby" : "",
            ].filter(Boolean).join(" ")}
          >
            <div className="wc-mp-events">
              {latestSystemMessages.map((message) => (
                <div key={message.id} className="wc-mp-event-chip">{message.content}</div>
              ))}
            </div>

            <div
              className={[
                "wc-mp-action-stage",
                room.status === "lobby" ? "wc-mp-action-stage--lobby" : "",
                phase === "NIGHT_WITCH_ACTION" && me?.role === "Witch" ? "wc-mp-action-stage--witch" : "",
              ].filter(Boolean).join(" ")}
            >
              <AnimatePresence mode="wait" initial={false}>
                {canUseActionConsole ? (
                <motion.div
                  key={`action-${phase}-${wolfActionConfirmed ? "result" : wolfTieSeats.join("-") || "main"}`}
                  className={phase === "NIGHT_WITCH_ACTION" && me.role === "Witch" ? "wc-mp-action-console wc-mp-action-console--witch" : "wc-mp-action-console"}
                  role="group"
                  aria-label={actionConsoleTitle}
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.985 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <div className="wc-mp-action-console__head">
                    <div>
                      <span>{roleLabel[me.role]}</span>
                      <strong>{actionConsoleTitle}</strong>
                    </div>
                    {state?.phaseDeadlineAt && (
                      <div className="wc-mp-countdown" style={{ "--timer-progress": `${timerProgress}%` } as CSSProperties}>
                        <Timer size={15} />
                        <span>{formatSeconds(timerLeftMs)}</span>
                      </div>
                    )}
                  </div>

                  <div className="wc-mp-action-console__body">
                    <p>{actionHint}</p>

                    {actionSubmittedText && (
                      <div className="wc-mp-action-console__submitted">
                        <CheckCircle size={15} weight="fill" />
                        <span>{actionSubmittedText}</span>
                      </div>
                    )}

                    {phase === "DAY_VOTE" && (
                      <div className="wc-mp-vote-status">
                        {aliveVoteStatus.map(({ player, voted }) => (
                          <span key={player.clientId} className={voted ? "is-voted" : ""}>
                            {voted ? <CheckCircle size={12} weight="fill" /> : <Timer size={12} />}
                            {player.displayName}
                          </span>
                        ))}
                      </div>
                    )}

                    {isWolfActionPhase && wolfActionConfirmed ? (
                      <div className="wc-mp-wolf-result">
                        <span>{isRecruitWolfNight ? "Curse confirmed" : "Pack decision"}</span>
                        <strong>
                          {confirmedWolfTargets.map((seat) => getPlayerNameBySeat(seat)).join(", ")}
                        </strong>
                        <p>
                          {isRecruitWolfNight
                            ? "This player joins the wolves tonight. The pack will not bite."
                            : "All wolves have received tonight's target."}
                        </p>
                      </div>
                    ) : phase === "NIGHT_WITCH_ACTION" ? (
                      <>
                        <div className="wc-mp-witch-target">
                          <div className="wc-mp-witch-target__label">Wolf attack tonight</div>
                          {wolfTarget ? (
                            <div className="wc-mp-witch-target__victim">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={getPlayerAvatar(wolfTarget.clientId)} alt="" />
                              <div>
                                <span>Seat {wolfTarget.seat + 1}</span>
                                <strong>{wolfTarget.displayName}</strong>
                              </div>
                              <em>Can be healed</em>
                            </div>
                          ) : (
                            <div className="wc-mp-witch-target__empty">No wolf target is visible tonight.</div>
                          )}
                          <div className="wc-mp-mini-status">
                            <span className={witchHealUsed ? "is-used" : ""}>Heal {witchHealUsed ? "used" : "ready"}</span>
                            <span className={witchPoisonUsed ? "is-used" : ""}>Poison {witchPoisonUsed ? "used" : "ready"}</span>
                          </div>
                        </div>
                        {!witchPoisonUsed && (
                          <div className="wc-mp-action-target-grid">
                            {actionTargets.map((player) => (
                              <button
                                key={player.clientId}
                                type="button"
                                className={[
                                  selectedSeat === player.seat ? "is-selected" : "",
                                  wolfTarget?.seat === player.seat ? "is-wolf-target" : "",
                                ].filter(Boolean).join(" ")}
                                onClick={() => {
                                  setSelectedSeats([]);
                                  setSelectedSeat(player.seat);
                                }}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={getPlayerAvatar(player.clientId)} alt="" />
                                <span>Seat {player.seat + 1}</span>
                                <strong>{player.displayName}</strong>
                                {wolfTarget?.seat === player.seat && <em data-tone="wolf">Attacked tonight</em>}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="wc-mp-action-console__actions">
                          <button type="button" disabled={witchHealUsed || !wolfTarget} onClick={() => sendAction({ type: "NIGHT_ACTION", clientId, targetSeat: null, witchAction: "save" })}>
                            <Shield size={15} /> Heal {wolfTarget ? wolfTarget.displayName : "target"}
                          </button>
                          <button type="button" disabled={witchPoisonUsed || selectedSeat === null} onClick={() => sendAction({ type: "NIGHT_ACTION", clientId, targetSeat: selectedSeat, witchAction: "poison" })}>
                            <Skull size={15} /> Poison {selectedSeat !== null ? getPlayerNameBySeat(selectedSeat) : "selected"}
                          </button>
                          <button type="button" onClick={() => sendAction({ type: "NIGHT_ACTION", clientId, targetSeat: null, witchAction: "pass" })}>
                            Pass
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        {wolfChoiceStatus.length > 0 && (
                          <div className="wc-mp-wolf-choice-board">
                            <div className="wc-mp-wolf-choice-board__title">
                              {isRecruitWolfNight ? "Pack curse choices" : "Pack bite choices"}
                            </div>
                            <div className="wc-mp-wolf-choice-board__list">
                              {wolfChoiceStatus.map(({ wolf, target, label, tone }) => (
                                <span key={wolf.clientId} className={target ? "is-chosen" : ""} data-tone={tone}>
                                  <strong>{wolf.displayName}</strong>
                                  <em>{label}</em>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {actionTargets.length > 0 && !isActionSubmitted && (!isWolfActionPhase || isMyWolfTurn) && (
                          <div className="wc-mp-action-target-grid">
                            {actionTargets.map((player) => {
                              const selected = phase === "NIGHT_CUPID_ACTION" ? selectedSeats.includes(player.seat) : selectedSeat === player.seat;
                              const chip = playerActionChips[player.seat];
                              const targetChoiceChips = wolfTargetChoiceChips[player.seat] ?? [];
                              return (
                                <button
                                  key={player.clientId}
                                  type="button"
                                  className={selected ? "is-selected" : ""}
                                  onClick={() => {
                                    if (phase === "NIGHT_CUPID_ACTION") {
                                      setSelectedSeat(null);
                                      setSelectedSeats((seats) => {
                                        if (seats.includes(player.seat)) return seats.filter((seat) => seat !== player.seat);
                                        return [...seats, player.seat].slice(-2);
                                      });
                                      return;
                                    }
                                    setSelectedSeats([]);
                                    setSelectedSeat(player.seat);
                                  }}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={getPlayerAvatar(player.clientId)} alt="" />
                                  <span>Seat {player.seat + 1}</span>
                                  <strong>{player.displayName}</strong>
                                  {chip && <em data-tone={chip.tone ?? "vote"}>{chip.label}</em>}
                                  {targetChoiceChips.map((targetChip) => (
                                    <em key={targetChip.label} data-tone={targetChip.tone ?? "wolf"}>{targetChip.label}</em>
                                  ))}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {!isActionSubmitted && (!isWolfActionPhase || isMyWolfTurn) && (
                          <div className="wc-mp-action-console__actions">
                            <div className="wc-mp-action-console__selection">{actionSelectionText}</div>
                            <button type="button" disabled={actionConfirmDisabled} onClick={submitSelectedAction}>
                              {phase === "DAY_VOTE" ? <CheckCircle size={15} /> : phase === "HUNTER_SHOOT" ? <Crosshair size={15} /> : isWolfRole(me.role) ? <Skull size={15} /> : <Shield size={15} />}
                              {actionConfirmLabel}
                            </button>
                          </div>
                        )}
                      </>
                    )}

                    {latestSeerCheck && me.role === "Seer" && (
                      <div className={latestSeerCheck.isWolf ? "wc-mp-seer-result is-wolf" : "wc-mp-seer-result"}>
                        Seer result: Seat {latestSeerCheck.targetSeat + 1}
                        {latestSeerTarget ? ` ${latestSeerTarget.displayName}` : ""} is{" "}
                        {latestSeerCheck.isWolf ? `Wolf (${roleLabel[latestSeerCheck.targetRole]})` : "Village"}
                      </div>
                    )}

                    {latestSorcererCheck && me.role === "Sorcerer" && (
                      <div className={latestSorcererCheck.result !== "other" ? "wc-mp-seer-result is-wolf" : "wc-mp-seer-result"}>
                        Sorcerer result: Seat {latestSorcererCheck.targetSeat + 1}
                        {latestSorcererTarget ? ` ${latestSorcererTarget.displayName}` : ""} is{" "}
                        {latestSorcererCheck.result === "wolf" ? "a wolf" : latestSorcererCheck.result === "seer" ? "the Seer" : "something else"}
                      </div>
                    )}

                    {latestPiCheck && me.role === "PI" && (
                      <div className={latestPiCheck.hasEvil ? "wc-mp-seer-result is-wolf" : "wc-mp-seer-result"}>
                        P.I. result: Seats {latestPiCheck.seats.map((seat) => seat + 1).join(", ")}{" "}
                        {latestPiCheck.hasEvil ? "include at least one suspicious player." : "look clear."}
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key={`phase-${phase}`}
                  className="wc-mp-phase-content"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  <div className="wc-mp-phase-orb">
                    {getPhaseIcon(phase, visualIsNight)}
                  </div>
                  <div className="wc-mp-phase-title">{getPhaseText(room)}</div>
                  <div className="wc-mp-phase-subtitle">{actionHint}</div>
                  {room.status === "lobby" && (
                    <div className="wc-mp-lobby-mini-game">
                      <LoadingMiniGame />
                    </div>
                  )}
                  {state?.phaseDeadlineAt && (
                    <div className="wc-mp-countdown" style={{ "--timer-progress": `${timerProgress}%` } as CSSProperties}>
                      <Timer size={15} />
                      <span>{formatSeconds(timerLeftMs)}</span>
                    </div>
                  )}
                </motion.div>
              )}
              </AnimatePresence>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                {room.status === "lobby" && isHost && (
                  <button
                    type="button"
                    disabled={!canStartLobby || !!validateRoleConfig(roleEditorRoles)}
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
                {phase === "GAME_END" && isHost && (
                  <button type="button" onClick={() => sendAction({ type: "RESTART_LOBBY", clientId })} className="wc-mp-primary-btn">
                    Restart lobby
                  </button>
                )}
                {phase === "GAME_END" && (
                  <button type="button" onClick={() => setEndReportOpen(true)} className="wc-mp-primary-btn wc-mp-primary-btn--ghost">
                    Game report
                  </button>
                )}
              </div>

              {room.status === "lobby" && (
                <div className="wc-mp-lobby-roles">
                  <div className="wc-mp-lobby-roles__summary">
                    <UsersThree size={15} />
                    <span>{room.seats.length}/{room.playerCount} seated</span>
                    <span>{isHost ? "Use Settings in the header to adjust roles." : "Waiting for host role setup."}</span>
                  </div>
                  <div className="wc-role-editor wc-role-editor--compact wc-role-editor--preview">
                    <div className="wc-role-editor__head">
                      <div>
                        <span>Role setup</span>
                        <strong>{room.roleConfig?.length ?? Math.max(MIN_PLAYERS_TO_START, room.seats.length)} players</strong>
                      </div>
                    </div>
                    <div className="wc-role-editor__chips">
                      {(room.roleConfig ?? roleEditorRoles).map((role, index) => (
                        <button
                          key={`${role}-${index}`}
                          type="button"
                          onClick={() => setPreviewRole(role)}
                          aria-label={`Read ${roleLabel[role]} role guide`}
                        >
                          {roleLabel[role]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!canUseActionConsole && latestSeerCheck && me?.role === "Seer" && (
                <div className={latestSeerCheck.isWolf ? "wc-mp-seer-result is-wolf" : "wc-mp-seer-result"}>
                  Seer result: Seat {latestSeerCheck.targetSeat + 1}
                  {latestSeerTarget ? ` ${latestSeerTarget.displayName}` : ""} is{" "}
                  {latestSeerCheck.isWolf ? `Wolf (${roleLabel[latestSeerCheck.targetRole]})` : "Village"}
                </div>
              )}

              {!canUseActionConsole && latestSorcererCheck && me?.role === "Sorcerer" && (
                <div className={latestSorcererCheck.result !== "other" ? "wc-mp-seer-result is-wolf" : "wc-mp-seer-result"}>
                  Sorcerer result: Seat {latestSorcererCheck.targetSeat + 1}
                  {latestSorcererTarget ? ` ${latestSorcererTarget.displayName}` : ""} is{" "}
                  {latestSorcererCheck.result === "wolf" ? "a wolf" : latestSorcererCheck.result === "seer" ? "the Seer" : "something else"}
                </div>
              )}

              {!canUseActionConsole && latestPiCheck && me?.role === "PI" && (
                <div className={latestPiCheck.hasEvil ? "wc-mp-seer-result is-wolf" : "wc-mp-seer-result"}>
                  P.I. result: Seats {latestPiCheck.seats.map((seat) => seat + 1).join(", ")}{" "}
                  {latestPiCheck.hasEvil ? "include at least one suspicious player." : "look clear."}
                </div>
              )}
            </div>

            {shouldShowDialogBox && (
              <div className={room.status === "lobby" ? "wc-mp-dialog-box wc-mp-dialog-box--lobby" : "wc-mp-dialog-box"}>
                <div className="wc-mp-dialog-title">
                  {room.status === "lobby" ? "Lobby chat" : isWolfNightChat ? "Wolf night chat" : visualIsNight ? "Night log" : "Table chat"}
                </div>
                <div ref={messageScrollRef} className="wc-mp-message-scroll">
                  {visibleChatMessages.length === 0 && (
                    <div className="wc-mp-chat-empty">
                      {room.status === "lobby" ? "Say hi while everyone gathers." : "No messages yet."}
                    </div>
                  )}
                  {visibleChatMessages.map((message) => (
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
                      placeholder={room.status === "lobby" ? "Chat while waiting" : isWolfNightChat ? "Wolf chat. Villagers cannot see this." : "Say something"}
                    />
                    <AnimatePresence initial={false}>
                      {chatText.trim() && (
                        <motion.button
                          type="button"
                          onClick={submitChat}
                          aria-label="Send message"
                          initial={{ opacity: 0, x: 8, scale: 0.92 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          exit={{ opacity: 0, x: 8, scale: 0.92 }}
                          transition={{ duration: 0.16, ease: "easeOut" }}
                        >
                          <PaperPlaneRight size={16} />
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                )}
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
                isSelected={selectedSeat === player.seat || selectedSeats.includes(player.seat)}
                onClick={() => selectGamePlayer(player)}
                animationDelay={index * 0.04}
                isNight={visualIsNight}
                humanPlayer={legacyMe}
                isBot={room.seats.find((seat) => seat.clientId === player.playerId)?.isBot}
                showRoleBadge={!!me && (player.isHuman || phase === "GAME_END" || (isWolfRole(me.role) && isWolfRole(player.role)))}
                selectionTone={phase === "DAY_VOTE" ? "vote" : isWolfRole(me?.role) ? "wolf" : me?.role === "Witch" ? "witch" : me?.role === "Seer" ? "seer" : "guard"}
                isInSelectionPhase={!!state}
                actionChip={playerActionChips[player.seat]}
              />
            ))}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {roomSettingsOpen && canEditRoomSettings && (
          <motion.div
            className="wc-room-settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-settings-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setRoomSettingsOpen(false);
            }}
          >
            <motion.div
              className="wc-room-settings-modal__panel"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <div className="wc-room-settings-modal__head">
                <div>
                  <span>Room settings</span>
                  <strong id="room-settings-title">Role setup before start</strong>
                  <p>{room.seats.length}/{room.playerCount} seated. Changes apply to this room only.</p>
                </div>
                <button type="button" onClick={() => setRoomSettingsOpen(false)} aria-label="Close room settings">
                  <X size={17} />
                </button>
              </div>
              <div className="wc-room-settings-modal__body">
                <div className="wc-room-settings-modal__size">
                  <div>
                    <span>Room size</span>
                    <strong>{playerCount} seats</strong>
                    <p>{room.seats.length}/{playerCount} seated</p>
                  </div>
                  <div className="wc-room-size-options" aria-label="Room size">
                    {PLAYER_COUNT_OPTIONS.map((count) => (
                      <button
                        key={count}
                        type="button"
                        disabled={count < room.seats.length}
                        className={playerCount === count ? "is-active" : ""}
                        onClick={() => updateLobbyPlayerCount(count)}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                </div>
                <section className="wc-room-members">
                  <div className="wc-room-members__head">
                    <div>
                      <span>Test players</span>
                      <strong>Players and adaptive bots</strong>
                      <p>Bots read English chat, use role actions, and vote through the same room API.</p>
                    </div>
                    <div className="wc-room-members__actions">
                      <button
                        type="button"
                        disabled={room.seats.length >= playerCount || memberActionPending !== null || !!validateRoleConfig(roleEditorRoles)}
                        onClick={() => void addRoomBots(1)}
                      >
                        <UserPlus size={15} />
                        Add bot
                      </button>
                      <button
                        type="button"
                        disabled={room.seats.length >= playerCount || memberActionPending !== null || !!validateRoleConfig(roleEditorRoles)}
                        onClick={() => void addRoomBots(playerCount - room.seats.length)}
                      >
                        <Robot size={15} />
                        Fill empty seats
                      </button>
                    </div>
                  </div>
                  <div className="wc-room-members__list">
                    {room.seats.map((seat) => {
                      const isRoomHost = seat.clientId === room.hostClientId;
                      return (
                        <div key={seat.clientId} className="wc-room-member">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={getPlayerAvatar(seat.avatarSeed)} alt="" />
                          <div>
                            <span>Seat {seat.seat + 1}</span>
                            <strong>{seat.displayName}</strong>
                          </div>
                          <div className="wc-room-member__badges">
                            {isRoomHost && <b>Host</b>}
                            {seat.isBot && <b className="is-bot">Bot</b>}
                          </div>
                          {!isRoomHost && (
                            <button
                              type="button"
                              className="wc-room-member__kick"
                              disabled={memberActionPending !== null}
                              onClick={() => void kickRoomPlayer(seat)}
                              aria-label={`Remove ${seat.displayName}`}
                              title={`Remove ${seat.displayName}`}
                            >
                              <UserMinus size={16} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
                <RoleEditor
                  roles={roleEditorRoles}
                  preset={rolePreset}
                  onPresetChange={updateLobbyPreset}
                  onRoleChange={updateLobbyRole}
                  onApply={() => void saveLobbyRoles()}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {endReportOpen && phase === "GAME_END" && state && (
          <motion.div
            className="wc-end-report-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-report-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setEndReportOpen(false);
            }}
          >
            <motion.div
              className="wc-end-report-modal__panel"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <div className="wc-end-report-modal__head">
                <div>
                  <span>Game report</span>
                  <strong id="end-report-title">{winnerLabel}</strong>
                  <p>Room {room.code} · Day {state.day} · {state.players.filter((player) => player.alive).length}/{state.players.length} alive</p>
                </div>
                <button type="button" onClick={() => setEndReportOpen(false)} aria-label="Close game report">
                  <X size={17} />
                </button>
              </div>

              <div className="wc-end-report-modal__body">
                <section className="wc-end-report-section">
                  <div className="wc-end-report-section__title">
                    <span>Role results</span>
                    <strong>All identities revealed</strong>
                  </div>
                  <div className="wc-end-role-grid">
                    {finalRoleRows.map(({ player, role, alignment }) => (
                      <div key={player.clientId} className="wc-end-role-card" data-alignment={player.alignment}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={getPlayerAvatar(player.clientId)} alt="" />
                        <div>
                          <span>Seat {player.seat + 1}</span>
                          <strong>{player.displayName}</strong>
                          <em>{role} · {alignment}</em>
                        </div>
                        <b>{player.alive ? "Alive" : "Dead"}</b>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="wc-end-report-section">
                  <div className="wc-end-report-section__title">
                    <span>Game log</span>
                    <strong>What happened this game</strong>
                  </div>
                  <div className="wc-end-log-list">
                    {gameLogEntries.length > 0 ? gameLogEntries.map((entry) => (
                      <article key={entry.id} className="wc-end-log-entry">
                        <h4>{entry.title}</h4>
                        <ul>
                          {entry.items.map((item, index) => (
                            <li key={`${entry.id}-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </article>
                    )) : (
                      <div className="wc-end-log-empty">No timeline was recorded for this game.</div>
                    )}
                  </div>
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {legacyMe && (
        <RoleRevealOverlay
          open={phase === "ROLE_REVEAL" && !state?.roleAcks[clientId]}
          player={legacyMe}
          phase={toGamePhase(phase)}
          onContinue={() => sendAction({ type: "ACK_ROLE", clientId })}
        />
      )}
      {previewRolePlayer && (
        <RoleRevealOverlay
          open={!!previewRole}
          player={previewRolePlayer}
          phase="NIGHT_START"
          mode="preview"
          onContinue={() => setPreviewRole(null)}
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
      {visibleTestPanel}
    </main>
  );
}
