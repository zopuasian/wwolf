import { NextResponse } from "next/server";
import { sanitizeRoomForClient } from "@/lib/multiplayer/api";
import { createSeat, normalizeRoomCode } from "@/lib/multiplayer/engine";
import { getStoredRoom, serializeStoreError, updateStoredRoomIfSeq } from "@/lib/multiplayer/room-store";
import type { MultiplayerRoom } from "@/lib/multiplayer/types";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code: rawCode } = await params;
    const code = normalizeRoomCode(rawCode);
    const body = await req.json().catch(() => ({}));
    const clientId = String(body.clientId || "").trim();
    const displayName = String(body.displayName || "").trim();

    if (!clientId) {
      return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
    }

    const found = await getStoredRoom(code);
    if (!found.ok) {
      return NextResponse.json({ error: "Could not load room", details: serializeStoreError(found.error) }, { status: 500 });
    }
    const room = found.value;
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
    if (room.status !== "lobby") return NextResponse.json({ error: "Game already started" }, { status: 409 });

    const existing = room.seats.find((seat) => seat.clientId === clientId);
    if (existing) return NextResponse.json({ room: sanitizeRoomForClient(room, clientId), storage: found.storage });
    if (room.seats.length >= room.playerCount) return NextResponse.json({ error: "Room is full" }, { status: 409 });

    const nextRoom: MultiplayerRoom = {
      ...room,
      hostClientId: room.seats.length === 0 ? clientId : room.hostClientId,
      seats: [...room.seats, createSeat(clientId, displayName, room.seats.length)],
      actionSeq: room.actionSeq + 1,
    };

    const updated = await updateStoredRoomIfSeq(code, room.actionSeq, nextRoom);
    if (!updated.ok) {
      return NextResponse.json({ error: "Could not join room", details: serializeStoreError(updated.error) }, { status: 500 });
    }
    if (!updated.value) {
      return NextResponse.json({ error: "Room changed, please retry" }, { status: 409 });
    }

    return NextResponse.json({ room: sanitizeRoomForClient(updated.value, clientId), storage: updated.storage });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
