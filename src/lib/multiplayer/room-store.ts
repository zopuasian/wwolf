import { supabaseAdmin } from "@/lib/supabase-admin";
import { dbRoomToRoom, roomToDbPatch, type DbRoom } from "./api";
import type { MultiplayerRoom } from "./types";

type StoreResult<T> =
  | { ok: true; value: T; storage: "supabase" | "memory" }
  | { ok: false; error: unknown; storage: "supabase" | "memory" };

const memoryRooms = new Map<string, MultiplayerRoom>();

function isMissingMultiplayerTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  return code === "PGRST205" || code === "42P01" || message.includes("multiplayer_rooms");
}

function shouldUseMemoryFallback(error: unknown): boolean {
  const mode = process.env.MULTIPLAYER_ROOM_STORAGE || "auto";
  if (mode === "memory") return true;
  if (mode === "supabase") return false;
  return isMissingMultiplayerTable(error);
}

function rowSelect() {
  return "code,host_client_id,player_count,status,seats,state,action_seq,updated_at";
}

export async function createStoredRoom(room: MultiplayerRoom): Promise<StoreResult<MultiplayerRoom>> {
  if ((process.env.MULTIPLAYER_ROOM_STORAGE || "auto") === "memory") {
    memoryRooms.set(room.code, room);
    return { ok: true, value: room, storage: "memory" };
  }

  const { data, error } = await supabaseAdmin
    .from("multiplayer_rooms")
    .insert({
      code: room.code,
      ...roomToDbPatch(room),
    } as never)
    .select(rowSelect())
    .single();

  if (!error && data) {
    return { ok: true, value: dbRoomToRoom(data as unknown as DbRoom), storage: "supabase" };
  }

  if (shouldUseMemoryFallback(error)) {
    memoryRooms.set(room.code, room);
    return { ok: true, value: room, storage: "memory" };
  }

  return { ok: false, error, storage: "supabase" };
}

export async function getStoredRoom(code: string): Promise<StoreResult<MultiplayerRoom | null>> {
  if ((process.env.MULTIPLAYER_ROOM_STORAGE || "auto") === "memory") {
    return { ok: true, value: memoryRooms.get(code) ?? null, storage: "memory" };
  }

  const { data, error } = await supabaseAdmin
    .from("multiplayer_rooms")
    .select(rowSelect())
    .eq("code", code)
    .single();

  if (!error && data) {
    return { ok: true, value: dbRoomToRoom(data as unknown as DbRoom), storage: "supabase" };
  }

  if (shouldUseMemoryFallback(error)) {
    return { ok: true, value: memoryRooms.get(code) ?? null, storage: "memory" };
  }

  if (error && typeof error === "object" && "code" in error && error.code === "PGRST116") {
    return { ok: true, value: null, storage: "supabase" };
  }

  return { ok: false, error, storage: "supabase" };
}

export async function updateStoredRoomIfSeq(
  code: string,
  expectedActionSeq: number,
  room: MultiplayerRoom
): Promise<StoreResult<MultiplayerRoom | null>> {
  if ((process.env.MULTIPLAYER_ROOM_STORAGE || "auto") === "memory" || memoryRooms.has(code)) {
    const current = memoryRooms.get(code);
    if (!current || current.actionSeq !== expectedActionSeq) {
      return { ok: true, value: null, storage: "memory" };
    }
    memoryRooms.set(code, room);
    return { ok: true, value: room, storage: "memory" };
  }

  const { data, error } = await supabaseAdmin
    .from("multiplayer_rooms")
    .update(roomToDbPatch(room) as never)
    .eq("code", code)
    .eq("action_seq", expectedActionSeq)
    .select(rowSelect())
    .single();

  if (!error && data) {
    return { ok: true, value: dbRoomToRoom(data as unknown as DbRoom), storage: "supabase" };
  }

  if (shouldUseMemoryFallback(error)) {
    const current = memoryRooms.get(code);
    if (!current || current.actionSeq !== expectedActionSeq) {
      return { ok: true, value: null, storage: "memory" };
    }
    memoryRooms.set(code, room);
    return { ok: true, value: room, storage: "memory" };
  }

  return { ok: false, error, storage: "supabase" };
}

export async function deleteStoredRoom(code: string): Promise<StoreResult<boolean>> {
  if ((process.env.MULTIPLAYER_ROOM_STORAGE || "auto") === "memory" || memoryRooms.has(code)) {
    return { ok: true, value: memoryRooms.delete(code), storage: "memory" };
  }

  const { error } = await supabaseAdmin
    .from("multiplayer_rooms")
    .delete()
    .eq("code", code);

  if (!error) {
    return { ok: true, value: true, storage: "supabase" };
  }

  if (shouldUseMemoryFallback(error)) {
    return { ok: true, value: memoryRooms.delete(code), storage: "memory" };
  }

  return { ok: false, error, storage: "supabase" };
}

export function serializeStoreError(error: unknown) {
  if (!error || typeof error !== "object") return String(error);
  return {
    code: "code" in error ? error.code : undefined,
    message: "message" in error ? error.message : undefined,
    details: "details" in error ? error.details : undefined,
    hint: "hint" in error ? error.hint : undefined,
  };
}
