import { NextResponse } from "next/server";
import { ensureAdminClient, supabaseAdmin } from "@/lib/supabase-admin";
import { dbRoomToRoom, roomToDbPatch, sanitizeRoomForClient } from "@/lib/multiplayer/api";
import { normalizeRoomCode, reduceMultiplayerAction } from "@/lib/multiplayer/engine";
import type { MultiplayerAction, MultiplayerRoom } from "@/lib/multiplayer/types";

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
    const action = (await req.json()) as MultiplayerAction;

    if (!action || typeof action !== "object" || !("type" in action) || !("clientId" in action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const room = await fetchRoom(code);
      if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

      const reducedRoom = reduceMultiplayerAction(room, action);
      const nextRoom: MultiplayerRoom =
        reducedRoom.state?.phase === "GAME_END"
          ? { ...reducedRoom, status: "ended" }
          : reducedRoom;
      if (nextRoom === room) return NextResponse.json({ room: sanitizeRoomForClient(room, action.clientId) });

      const { data, error } = await supabaseAdmin
        .from("multiplayer_rooms")
        .update(roomToDbPatch(nextRoom) as never)
        .eq("code", code)
        .eq("action_seq", room.actionSeq)
        .select("code,host_client_id,player_count,status,seats,state,action_seq,updated_at")
        .single();

      if (!error && data) {
        return NextResponse.json({ room: sanitizeRoomForClient(dbRoomToRoom(data as never), action.clientId) });
      }
    }

    return NextResponse.json({ error: "Room changed, please retry" }, { status: 409 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
