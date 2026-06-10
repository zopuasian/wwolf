import { NextResponse } from "next/server";
import { sanitizeRoomForClient } from "@/lib/multiplayer/api";
import { autoAdvanceMultiplayerRoom, normalizeRoomCode } from "@/lib/multiplayer/engine";
import { getStoredRoom, serializeStoreError, updateStoredRoomIfSeq } from "@/lib/multiplayer/room-store";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code: rawCode } = await params;
    const url = new URL(req.url);
    const clientId = url.searchParams.get("clientId") || "";
    const code = normalizeRoomCode(rawCode);
    const result = await getStoredRoom(code);

    if (!result.ok) {
      return NextResponse.json({ error: "Could not load room", details: serializeStoreError(result.error) }, { status: 500 });
    }

    if (!result.value) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const nextRoom = autoAdvanceMultiplayerRoom(result.value);
    if (nextRoom !== result.value) {
      const updated = await updateStoredRoomIfSeq(code, result.value.actionSeq, nextRoom);
      if (updated.ok && updated.value) {
        return NextResponse.json({ room: sanitizeRoomForClient(updated.value, clientId), storage: updated.storage });
      }
    }

    return NextResponse.json({ room: sanitizeRoomForClient(result.value, clientId), storage: result.storage });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
