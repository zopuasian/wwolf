import { NextResponse } from "next/server";
import { ensureAdminClient, supabaseAdmin } from "@/lib/supabase-admin";
import { dbRoomToRoom, roomToDbPatch, sanitizeRoomForClient } from "@/lib/multiplayer/api";
import { createSeat, normalizeRoomCode } from "@/lib/multiplayer/engine";
import type { MultiplayerRoom } from "@/lib/multiplayer/types";

export const runtime = "nodejs";

async function fetchRoom(code: string): Promise<MultiplayerRoom | null> {
  const { data, error } = await supabaseAdmin
    .from("multiplayer_rooms")
    .select("code,host_client_id,player_count,status,seats,state,action_seq,updated_at")
    .eq("code", code)
    .single();
  if (error || !data) return null;
  return dbRoomToRoom(data);
}

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    ensureAdminClient();
    const { code: rawCode } = await params;
    const code = normalizeRoomCode(rawCode);
    const body = await req.json().catch(() => ({}));
    const clientId = String(body.clientId || "").trim();
    const displayName = String(body.displayName || "").trim();

    if (!clientId) {
      return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
    }

    const room = await fetchRoom(code);
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
    if (room.status !== "lobby") return NextResponse.json({ error: "Game already started" }, { status: 409 });

    const existing = room.seats.find((seat) => seat.clientId === clientId);
    if (existing) return NextResponse.json({ room: sanitizeRoomForClient(room, clientId) });
    if (room.seats.length >= room.playerCount) return NextResponse.json({ error: "Room is full" }, { status: 409 });

    const nextRoom: MultiplayerRoom = {
      ...room,
      seats: [...room.seats, createSeat(clientId, displayName, room.seats.length)],
      actionSeq: room.actionSeq + 1,
    };

    const { data, error } = await supabaseAdmin
      .from("multiplayer_rooms")
      .update(roomToDbPatch(nextRoom) as never)
      .eq("code", code)
      .eq("action_seq", room.actionSeq)
      .select("code,host_client_id,player_count,status,seats,state,action_seq,updated_at")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Room changed, please retry" }, { status: 409 });
    }

    return NextResponse.json({ room: sanitizeRoomForClient(dbRoomToRoom(data as never), clientId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
