"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, Copy, Crosshair, Drop, Eye, PaperPlaneRight, Shield, SignOut, Skull, Timer, UsersThree } from "@phosphor-icons/react";
import { DayIcon, NightIcon, VoteIcon, WerewolfIcon } from "@/components/icons/FlatIcons";
import { GameBackground } from "@/components/game/GameBackground";
import { PlayerCardCompact } from "@/components/game/PlayerCardCompact";
import { RoleRevealOverlay } from "@/components/game/RoleRevealOverlay";
import { buildSimpleAvatarUrl } from "@/lib/avatar-config";
import { getMultiplayerClientId } from "@/lib/multiplayer/client-id";
import { isWolfRole, type Player, type Role } from "@/types/game";
import { toGamePhase, type MultiplayerAction, type MultiplayerPlayer, type MultiplayerRoom, type MultiplayerSeat } from "@/lib/multiplayer/types";
import {
  getDefaultMultiplayerRoles,
  MULTIPLAYER_ROLE_LABEL,
  MULTIPLAYER_ROLE_OPTIONS,
  MULTIPLAYER_ROLE_PRESETS,
  validateRoleConfig,
  type MultiplayerRolePreset,
} from "@/lib/multiplayer/roles";

const roleLabel = MULTIPLAYER_ROLE_LABEL;

const MIN_PLAYERS_TO_START = 5;
const PLAYER_COUNT_OPTIONS = [5, 6, 7, 8, 9, 10, 11, 12];
const VISIBLE_TEST_STEP_DELAY_MS = 2600;

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
    case "NIGHT_DOPPELGANGER_ACTION":
      return "Doppelganger action";
    case "NIGHT_CUPID_ACTION":
      return "Cupid action";
    case "NIGHT_CULT_ACTION":
      return "Cult action";
    case "NIGHT_GUARD_ACTION":
      return "Guard action";
    case "NIGHT_WOLF_ACTION":
      return "Wolf action";
    case "NIGHT_BIG_BAD_WOLF_ACTION":
      return "Big Bad Wolf";
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
  const [playerCount, setPlayerCount] = useState(10);
  const [rolePreset, setRolePreset] = useState<MultiplayerRolePreset>("classic");
  const [roleEditorRoles, setRoleEditorRoles] = useState<Role[]>(() => getDefaultMultiplayerRoles(10, "classic"));
  const [room, setRoom] = useState<MultiplayerRoom | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatText, setChatText] = useState("");
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);
  const [now, setNow] = useState(Date.now());
  const [transitionCue, setTransitionCue] = useState<{ id: number; isNight: boolean; title: string; subtitle: string } | null>(null);
  const [visibleTestLogs, setVisibleTestLogs] = useState<string[]>([]);
  const [visibleTestRunning, setVisibleTestRunning] = useState(false);
  const [visibleTestDone, setVisibleTestDone] = useState(false);
  const visibleTestStartedRef = useRef(false);
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

  useEffect(() => {
    if (room) return;
    setRoleEditorRoles(getDefaultMultiplayerRoles(playerCount, rolePreset));
  }, [playerCount, rolePreset, room]);

  useEffect(() => {
    if (room?.status !== "lobby") return;
    const lobbyRoleCount = Math.max(MIN_PLAYERS_TO_START, room.seats.length);
    setRolePreset(room.rolePreset ?? "classic");
    setRoleEditorRoles(
      room.roleConfig?.length === lobbyRoleCount
        ? room.roleConfig
        : getDefaultMultiplayerRoles(lobbyRoleCount, room.rolePreset ?? "classic")
    );
  }, [room?.actionSeq, room?.code, room?.roleConfig, room?.rolePreset, room?.seats.length, room?.status]);

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
  const visualIsNight = isNightPhase(phase) || (phase === "HUNTER_SHOOT" && state?.pendingHunterShot?.resumePhase === "DAY_DISCUSSION");
  const timerLeftMs = state?.phaseDeadlineAt ? state.phaseDeadlineAt - now : 0;
  const timerProgress = state?.phaseStartedAt && state.phaseDeadlineAt
    ? Math.max(0, Math.min(100, ((state.phaseDeadlineAt - now) / (state.phaseDeadlineAt - state.phaseStartedAt)) * 100))
    : 0;
  const wolfTarget = typeof state?.nightActions.wolfTarget === "number"
    ? state.players.find((player) => player.seat === state.nightActions.wolfTarget) ?? null
    : null;
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

  const updateCreatePreset = (preset: MultiplayerRolePreset) => {
    setRolePreset(preset);
    setRoleEditorRoles(getDefaultMultiplayerRoles(playerCount, preset));
  };

  const updateCreateRole = (index: number, role: Role) => {
    setRoleEditorRoles((roles) => roles.map((item, itemIndex) => (itemIndex === index ? role : item)));
  };

  const createRoom = async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/multiplayer/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, displayName, playerCount, rolePreset, roleConfig: roleEditorRoles }),
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
      setSelectedSeats([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    }
  };

  const updateLobbyPreset = (preset: MultiplayerRolePreset) => {
    const count = Math.max(MIN_PLAYERS_TO_START, room?.seats.length ?? playerCount);
    setRolePreset(preset);
    setRoleEditorRoles(getDefaultMultiplayerRoles(count, preset));
  };

  const updateLobbyRole = (index: number, role: Role) => {
    setRoleEditorRoles((roles) => roles.map((item, itemIndex) => (itemIndex === index ? role : item)));
  };

  const saveLobbyRoles = async () => {
    if (!clientId) return;
    await sendAction({ type: "UPDATE_ROLE_CONFIG", clientId, roles: roleEditorRoles, preset: rolePreset });
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
    if (phase === "NIGHT_WOLF_ACTION") return isWolfRole(me.role) && !isWolfRole(player.role);
    if (phase === "NIGHT_BIG_BAD_WOLF_ACTION") return me.role === "BigBadWolf" && player.clientId !== me.clientId && !isWolfRole(player.role);
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

  const actionHint = useMemo(() => {
    if (!state || !me) return "";
    if (phase === "ROLE_REVEAL") return state.roleAcks[clientId] ? "Waiting for everyone to confirm roles." : "Check your role, then confirm.";
    if (phase === "NIGHT_DOPPELGANGER_ACTION") return me.role === "Doppelganger" ? "Choose one player to copy." : "Waiting for the Doppelganger.";
    if (phase === "NIGHT_CUPID_ACTION") return me.role === "Cupid" ? "Choose two players to become lovers." : "Waiting for Cupid.";
    if (phase === "NIGHT_CULT_ACTION") return me.role === "CultLeader" ? "Recruit one player into the cult." : "Waiting for the Cult Leader.";
    if (phase === "NIGHT_GUARD_ACTION") return me.role === "Guard" ? "Choose another player to protect." : "Waiting for the Guard.";
    if (phase === "NIGHT_WOLF_ACTION") return isWolfRole(me.role) ? "Wolves choose a target." : "Waiting for the wolves.";
    if (phase === "NIGHT_BIG_BAD_WOLF_ACTION") return me.role === "BigBadWolf" ? "Choose an adjacent bonus target, or pass." : "Waiting for Big Bad Wolf.";
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
    if (phase === "DAY_RESOLVE") return isHost ? "Advance to the next night." : "Waiting for host.";
    if (phase === "GAME_END") {
      if (state.winner === "wolf") return "Werewolves win.";
      if (state.winner === "tanner") return "Tanner wins.";
      if (state.winner === "cult") return "Cult wins.";
      return "Village wins.";
    }
    return "";
  }, [clientId, isHost, me, phase, state, witchHealUsed, witchPoisonUsed, wolfTarget]);

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

  if (!room) {
    return (
      <main className="min-h-screen wc-contract-screen flex items-center justify-center px-5 selection:bg-[var(--color-accent)] selection:text-white">
        <div className="wc-contract-fog" aria-hidden="true" />
        <div className="wc-contract-vignette" aria-hidden="true" />
        <section className="relative z-10 wc-contract-paper w-full max-w-[620px]">
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
                disabled={loading || !displayName.trim() || !!validateRoleConfig(roleEditorRoles)}
                className="self-end rounded-md border-2 border-[var(--color-accent)] bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Create room
              </button>
            </div>
            <RoleEditor
              roles={roleEditorRoles}
              preset={rolePreset}
              disabled={loading}
              onPresetChange={updateCreatePreset}
              onRoleChange={updateCreateRole}
            />
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
        {visibleTestPanel}
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
                isSelected={selectedSeat === player.seat || selectedSeats.includes(player.seat)}
                onClick={() => selectGamePlayer(player)}
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
                {phase === "DAY_RESOLVE" && isHost && (
                  <button type="button" onClick={() => sendAction({ type: "NEXT_NIGHT", clientId })} className="wc-mp-primary-btn">
                    Next night
                  </button>
                )}
              </div>

              {room.status === "lobby" && (
                <div className="wc-mp-lobby-roles">
                  <div className="wc-mp-lobby-roles__summary">
                    <UsersThree size={15} />
                    <span>{room.seats.length}/{room.playerCount} seated</span>
                    <span>{isHost ? "Host can adjust roles before starting." : "Waiting for host role setup."}</span>
                  </div>
                  {isHost ? (
                    <RoleEditor
                      roles={roleEditorRoles}
                      preset={rolePreset}
                      compact
                      onPresetChange={updateLobbyPreset}
                      onRoleChange={updateLobbyRole}
                      onApply={() => void saveLobbyRoles()}
                    />
                  ) : (
                    <div className="wc-role-editor wc-role-editor--compact">
                      <div className="wc-role-editor__head">
                        <div>
                          <span>Role setup</span>
                          <strong>{room.roleConfig?.length ?? Math.max(MIN_PLAYERS_TO_START, room.seats.length)} players</strong>
                        </div>
                      </div>
                      <div className="wc-role-editor__chips">
                        {(room.roleConfig ?? roleEditorRoles).map((role, index) => (
                          <span key={`${role}-${index}`}>{roleLabel[role]}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

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
                  <div className="wc-mp-mini-status">
                    <span className={witchHealUsed ? "is-used" : ""}>Heal {witchHealUsed ? "used" : "ready"}</span>
                    <span className={witchPoisonUsed ? "is-used" : ""}>Poison {witchPoisonUsed ? "used" : "ready"}</span>
                  </div>
                </div>
              )}

              {latestSeerCheck && me?.role === "Seer" && (
                <div className={latestSeerCheck.isWolf ? "wc-mp-seer-result is-wolf" : "wc-mp-seer-result"}>
                  Seer result: Seat {latestSeerCheck.targetSeat + 1}
                  {latestSeerTarget ? ` ${latestSeerTarget.displayName}` : ""} is{" "}
                  {latestSeerCheck.isWolf ? `Wolf (${roleLabel[latestSeerCheck.targetRole]})` : "Village"}
                </div>
              )}

              {latestSorcererCheck && me?.role === "Sorcerer" && (
                <div className={latestSorcererCheck.result !== "other" ? "wc-mp-seer-result is-wolf" : "wc-mp-seer-result"}>
                  Sorcerer result: Seat {latestSorcererCheck.targetSeat + 1}
                  {latestSorcererTarget ? ` ${latestSorcererTarget.displayName}` : ""} is{" "}
                  {latestSorcererCheck.result === "wolf" ? "a wolf" : latestSorcererCheck.result === "seer" ? "the Seer" : "something else"}
                </div>
              )}

              {latestPiCheck && me?.role === "PI" && (
                <div className={latestPiCheck.hasEvil ? "wc-mp-seer-result is-wolf" : "wc-mp-seer-result"}>
                  P.I. result: Seats {latestPiCheck.seats.map((seat) => seat + 1).join(", ")}{" "}
                  {latestPiCheck.hasEvil ? "include at least one suspicious player." : "look clear."}
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

            {(selectedSeat !== null || selectedSeats.length > 0) && (
              <div className="wc-mp-selection-bar">
                <span>
                  {phase === "NIGHT_CUPID_ACTION"
                    ? `Selected ${selectedSeats.map((seat) => seat + 1).join(", ") || "none"}`
                    : `Selected seat ${(selectedSeat ?? 0) + 1}`}
                </span>
                <button type="button" disabled={phase === "NIGHT_CUPID_ACTION" && selectedSeats.length !== 2} onClick={submitSelectedAction}>
                  {phase === "DAY_VOTE" ? <CheckCircle size={15} /> : phase === "HUNTER_SHOOT" ? <Crosshair size={15} /> : <Shield size={15} />}
                  Confirm
                </button>
              </div>
            )}

            {phase === "NIGHT_WITCH_ACTION" && me?.role === "Witch" && (
              <div className="wc-mp-witch-actions">
                <button type="button" disabled={witchHealUsed || !wolfTarget} onClick={() => sendAction({ type: "NIGHT_ACTION", clientId, targetSeat: null, witchAction: "save" })}>
                  Save wolf target
                </button>
                <button type="button" disabled={witchPoisonUsed || selectedSeat === null} onClick={() => sendAction({ type: "NIGHT_ACTION", clientId, targetSeat: selectedSeat, witchAction: "poison" })}>
                  <Skull size={15} /> Poison selected
                </button>
                <button type="button" onClick={() => sendAction({ type: "NIGHT_ACTION", clientId, targetSeat: null, witchAction: "pass" })}>
                  Pass
                </button>
              </div>
            )}

            {phase === "NIGHT_BIG_BAD_WOLF_ACTION" && me?.role === "BigBadWolf" && (
              <div className="wc-mp-witch-actions">
                <button type="button" disabled={selectedSeat === null} onClick={() => sendAction({ type: "NIGHT_ACTION", clientId, targetSeat: selectedSeat })}>
                  <Skull size={15} /> Kill selected
                </button>
                <button type="button" onClick={() => sendAction({ type: "NIGHT_ACTION", clientId, targetSeat: null })}>
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
                isSelected={selectedSeat === player.seat || selectedSeats.includes(player.seat)}
                onClick={() => selectGamePlayer(player)}
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
      {visibleTestPanel}
    </main>
  );
}
