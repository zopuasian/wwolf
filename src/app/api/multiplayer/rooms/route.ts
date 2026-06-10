import { NextResponse } from "next/server";
import { clampPlayerCount, createRoomCode, createSeat } from "@/lib/multiplayer/engine";
import { sanitizeRoomForClient } from "@/lib/multiplayer/api";
import { createStoredRoom, serializeStoreError } from "@/lib/multiplayer/room-store";
import type { MultiplayerRoom } from "@/lib/multiplayer/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const clientId = String(body.clientId || "").trim();
    const displayName = String(body.displayName || "").trim();
    const playerCount = clampPlayerCount(Number(body.playerCount ?? 10));

    if (!clientId) {
      return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
    }

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = createRoomCode();
      const seat = createSeat(clientId, displayName, 0);
      const room: MultiplayerRoom = {
        code,
        hostClientId: clientId,
        playerCount,
        status: "lobby",
        seats: [seat],
        state: null,
        actionSeq: 0,
      };
      const result = await createStoredRoom(room);

      if (result.ok) {
        return NextResponse.json({
          room: sanitizeRoomForClient(result.value, clientId),
          storage: result.storage,
        });
      }
      lastError = result.error;
    }

    return NextResponse.json({ error: "Could not create room", details: serializeStoreError(lastError) }, { status: 500 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
