"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, Copy, Crown, PaperPlaneRight, Shield, Skull, Users } from "@phosphor-icons/react";
import { WerewolfIcon } from "@/components/icons/FlatIcons";
import { getMultiplayerClientId } from "@/lib/multiplayer/client-id";
import { isWolfRole, type Role } from "@/types/game";
import type { MultiplayerAction, MultiplayerPlayer, MultiplayerRoom } from "@/lib/multiplayer/types";

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

function canSeeRole(viewer: MultiplayerPlayer | null, player: MultiplayerPlayer, phase: string | undefined) {
  return !!viewer && (player.roleRevealed || phase === "GAME_END");
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

  useEffect(() => {
    const id = getMultiplayerClientId();
    setClientId(id);
    setDisplayName(window.localStorage.getItem("wolfcha.multiplayer.name") || "");
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

  const actionHint = useMemo(() => {
    if (!state || !me) return "";
    if (phase === "ROLE_REVEAL") return state.roleAcks[clientId] ? "Waiting for everyone to confirm roles." : "Check your role, then confirm.";
    if (phase === "NIGHT_GUARD_ACTION") return me.role === "Guard" ? "Choose one player to protect." : "Waiting for the Guard.";
    if (phase === "NIGHT_WOLF_ACTION") return isWolfRole(me.role) ? "Wolves choose a target." : "Waiting for the wolves.";
    if (phase === "NIGHT_WITCH_ACTION") return me.role === "Witch" ? "Use a potion or pass." : "Waiting for the Witch.";
    if (phase === "NIGHT_SEER_ACTION") return me.role === "Seer" ? "Choose one player to inspect." : "Waiting for the Seer.";
    if (phase === "DAY_DISCUSSION") return isHost ? "Discuss, then start voting when ready." : "Discuss and wait for host to start voting.";
    if (phase === "DAY_VOTE") return state.votes[clientId] !== undefined ? "Vote submitted." : "Vote for one alive player.";
    if (phase === "DAY_RESOLVE") return isHost ? "Advance to the next night." : "Waiting for host.";
    if (phase === "GAME_END") return state.winner === "wolf" ? "Werewolves win." : "Village wins.";
    return "";
  }, [clientId, isHost, me, phase, state]);

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
                  {[8, 9, 10, 11, 12].map((count) => (
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
    <main className="min-h-screen overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
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
              <span className="font-serif text-lg font-bold">{alivePlayers.length}/{room.playerCount}</span>
            </div>
            <div className="wc-phase-badge">
              <span>{getPhaseText(room)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={copyInvite}
            className="inline-flex items-center gap-2 rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1 text-xs"
          >
            <Copy size={15} />
            Invite
          </button>
        </header>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)_360px] gap-4 p-4 lg:p-6">
          <section className="min-h-0 overflow-y-auto rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Users size={18} />
              Players
            </div>
            <div className="space-y-2">
              {(state?.players ?? room.seats).map((player) => {
                const livePlayer = isMultiplayerPlayer(player) ? player : null;
                const isMe = player.clientId === clientId;
                const selected = selectedSeat === player.seat;
                return (
                  <button
                    type="button"
                    key={player.clientId}
                    onClick={() => livePlayer && canSelectSeat(livePlayer) && setSelectedSeat(player.seat)}
                    disabled={!livePlayer || !canSelectSeat(livePlayer)}
                    className={[
                      "w-full rounded-md border-2 px-3 py-2 text-left transition-colors",
                      selected ? "border-[var(--color-accent)] bg-[var(--color-accent-bg)]" : "border-[var(--border-color)] bg-white/40",
                      livePlayer && !livePlayer.alive ? "opacity-50" : "",
                      livePlayer && canSelectSeat(livePlayer) ? "hover:border-[var(--color-accent)]" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{player.seat + 1}. {player.displayName}</span>
                      <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                        {room.hostClientId === player.clientId && <Crown size={13} />}
                        {isMe ? "You" : null}
                      </span>
                    </div>
                    {livePlayer && (
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <span>{livePlayer.alive ? "Alive" : "Dead"}</span>
                        {canSeeRole(me, livePlayer, phase) && (
                          <span className="rounded-full bg-black/10 px-2 py-0.5">{roleLabel[livePlayer.role]}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
              {room.status === "lobby" && Array.from({ length: room.playerCount - room.seats.length }).map((_, index) => (
                <div key={index} className="rounded-md border-2 border-dashed border-[var(--border-color)] px-3 py-2 text-sm text-[var(--text-muted)]">
                  Waiting for player {room.seats.length + index + 1}
                </div>
              ))}
            </div>
          </section>

          <section className="min-h-0 rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] p-4 flex flex-col">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{getPhaseText(room)}</div>
                <div className="text-sm text-[var(--text-muted)]">{actionHint}</div>
              </div>
              {room.status === "lobby" && isHost && (
                <button
                  type="button"
                  disabled={room.seats.length !== room.playerCount}
                  onClick={() => sendAction({ type: "START_GAME", clientId })}
                  className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Start
                </button>
              )}
              {phase === "ROLE_REVEAL" && me && (
                <button
                  type="button"
                  disabled={!!state?.roleAcks[clientId]}
                  onClick={() => sendAction({ type: "ACK_ROLE", clientId })}
                  className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Confirm role
                </button>
              )}
              {phase === "DAY_DISCUSSION" && isHost && (
                <button type="button" onClick={() => sendAction({ type: "START_VOTE", clientId })} className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white">
                  Start vote
                </button>
              )}
              {phase === "DAY_RESOLVE" && isHost && (
                <button type="button" onClick={() => sendAction({ type: "NEXT_NIGHT", clientId })} className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white">
                  Next night
                </button>
              )}
            </div>

            {me && phase === "ROLE_REVEAL" && (
              <div className="mb-4 rounded-md border-2 border-[var(--color-gold)]/60 bg-[var(--color-gold)]/10 p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Your role</div>
                <div className="mt-1 text-2xl font-serif font-bold text-[var(--color-gold)]">{roleLabel[me.role]}</div>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
              {(state?.messages ?? []).map((message) => (
                <div
                  key={message.id}
                  className={[
                    "rounded-md px-3 py-2 text-sm",
                    message.isSystem
                      ? "border border-[var(--border-color)] bg-black/5 text-[var(--text-secondary)]"
                      : message.clientId === clientId
                        ? "ml-auto max-w-[82%] bg-[var(--color-accent-bg)]"
                        : "mr-auto max-w-[82%] bg-white/55",
                  ].join(" ")}
                >
                  {!message.isSystem && <div className="mb-1 text-xs font-semibold text-[var(--text-muted)]">{message.playerName}</div>}
                  {message.content}
                </div>
              ))}
            </div>

            {selectedSeat !== null && (
              <div className="mt-3 flex items-center justify-between rounded-md border-2 border-[var(--color-accent)] bg-[var(--color-accent-bg)] px-3 py-2 text-sm">
                <span>Selected seat {selectedSeat + 1}</span>
                <button type="button" onClick={submitSelectedAction} className="inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-3 py-1.5 font-semibold text-white">
                  {phase === "DAY_VOTE" ? <CheckCircle size={15} /> : <Shield size={15} />}
                  Confirm
                </button>
              </div>
            )}

            {phase === "NIGHT_WITCH_ACTION" && me?.role === "Witch" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => sendAction({ type: "NIGHT_ACTION", clientId, targetSeat: null, witchAction: "save" })} className="rounded-md border-2 border-[var(--border-color)] px-3 py-1.5 text-sm">
                  Save wolf target
                </button>
                <button type="button" disabled={selectedSeat === null} onClick={() => sendAction({ type: "NIGHT_ACTION", clientId, targetSeat: selectedSeat, witchAction: "poison" })} className="inline-flex items-center gap-2 rounded-md border-2 border-[var(--border-color)] px-3 py-1.5 text-sm disabled:opacity-50">
                  <Skull size={15} /> Poison selected
                </button>
                <button type="button" onClick={() => sendAction({ type: "NIGHT_ACTION", clientId, targetSeat: null, witchAction: "pass" })} className="rounded-md border-2 border-[var(--border-color)] px-3 py-1.5 text-sm">
                  Pass
                </button>
              </div>
            )}
          </section>

          <aside className="min-h-0 rounded-md border-2 border-[var(--border-color)] bg-[var(--bg-card)] p-3 flex flex-col">
            <div className="mb-3 text-sm font-semibold">Room chat</div>
            <div className="flex-1 min-h-0 overflow-y-auto text-xs text-[var(--text-muted)]">
              Share reads, claims, and vote plans here.
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submitChat();
                  }
                }}
                placeholder="Say something"
                className="min-w-0 flex-1 rounded-md border-2 border-[var(--border-color)] bg-white/60 px-3 py-2 text-sm"
              />
              <button type="button" onClick={submitChat} className="rounded-md bg-[var(--color-accent)] px-3 text-white">
                <PaperPlaneRight size={16} />
              </button>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
