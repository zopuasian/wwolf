import { NextResponse } from "next/server";
import { ensureAdminClient, supabaseAdmin } from "@/lib/supabase-admin";
import { clampPlayerCount, createRoomCode, createSeat } from "@/lib/multiplayer/engine";
import { dbRoomToRoom, sanitizeRoomForClient } from "@/lib/multiplayer/api";
import type { Json } from "@/types/database";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    ensureAdminClient();
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
      const { data, error } = await supabaseAdmin
        .from("multiplayer_rooms")
        .insert({
          code,
          host_client_id: clientId,
          player_count: playerCount,
          status: "lobby",
          seats: [seat] as unknown as Json,
          state: {} as Json,
          action_seq: 0,
        } as never)
        .select("code,host_client_id,player_count,status,seats,state,action_seq,updated_at")
        .single();

      if (!error && data) {
        return NextResponse.json({ room: sanitizeRoomForClient(dbRoomToRoom(data as never), clientId) });
      }
      lastError = error;
    }

    return NextResponse.json({ error: "Could not create room", details: String(lastError) }, { status: 500 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
