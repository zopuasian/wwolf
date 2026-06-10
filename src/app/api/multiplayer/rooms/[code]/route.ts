import { NextResponse } from "next/server";
import { ensureAdminClient, supabaseAdmin } from "@/lib/supabase-admin";
import { dbRoomToRoom, sanitizeRoomForClient } from "@/lib/multiplayer/api";
import { normalizeRoomCode } from "@/lib/multiplayer/engine";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    ensureAdminClient();
    const { code: rawCode } = await params;
    const url = new URL(_req.url);
    const clientId = url.searchParams.get("clientId") || "";
    const code = normalizeRoomCode(rawCode);
    const { data, error } = await supabaseAdmin
      .from("multiplayer_rooms")
      .select("code,host_client_id,player_count,status,seats,state,action_seq,updated_at")
      .eq("code", code)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    return NextResponse.json({ room: sanitizeRoomForClient(dbRoomToRoom(data), clientId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
