import { NextResponse } from "next/server";
import { sanitizeRoomForClient } from "@/lib/multiplayer/api";
import { autoAdvanceMultiplayerRoom, normalizeRoomCode, reduceMultiplayerAction } from "@/lib/multiplayer/engine";
import { getStoredRoom, serializeStoreError, updateStoredRoomIfSeq } from "@/lib/multiplayer/room-store";
import type { MultiplayerAction, MultiplayerRoom } from "@/lib/multiplayer/types";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code: rawCode } = await params;
    const code = normalizeRoomCode(rawCode);
    const action = (await req.json()) as MultiplayerAction;

    if (!action || typeof action !== "object" || !("type" in action) || !("clientId" in action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const found = await getStoredRoom(code);
      if (!found.ok) {
        return NextResponse.json({ error: "Could not load room", details: serializeStoreError(found.error) }, { status: 500 });
      }
      const room = found.value;
      if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

      const roomAfterTimer = autoAdvanceMultiplayerRoom(room);
      if (roomAfterTimer !== room) {
        const updated = await updateStoredRoomIfSeq(code, room.actionSeq, roomAfterTimer);
        if (!updated.ok) {
          return NextResponse.json({ error: "Could not update room", details: serializeStoreError(updated.error) }, { status: 500 });
        }
        if (updated.value) {
          continue;
        }
        continue;
      }

      const reducedRoom = reduceMultiplayerAction(room, action);
      const nextRoom: MultiplayerRoom =
        reducedRoom.state?.phase === "GAME_END"
          ? { ...reducedRoom, status: "ended" }
          : reducedRoom;
      if (nextRoom === room) {
        return NextResponse.json({ room: sanitizeRoomForClient(room, action.clientId), storage: found.storage });
      }

      const updated = await updateStoredRoomIfSeq(code, room.actionSeq, nextRoom);
      if (!updated.ok) {
        return NextResponse.json({ error: "Could not update room", details: serializeStoreError(updated.error) }, { status: 500 });
      }
      if (updated.value) {
        return NextResponse.json({ room: sanitizeRoomForClient(updated.value, action.clientId), storage: updated.storage });
      }
    }

    return NextResponse.json({ error: "Room changed, please retry" }, { status: 409 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
