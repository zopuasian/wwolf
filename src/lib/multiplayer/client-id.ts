"use client";

import { generateUUID } from "@/lib/utils";

const STORAGE_KEY = "wolfcha.multiplayer.client_id";

export function getMultiplayerClientId(): string {
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const id = generateUUID();
  window.localStorage.setItem(STORAGE_KEY, id);
  return id;
}
