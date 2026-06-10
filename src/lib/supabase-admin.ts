import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const buildSafeSupabaseUrl = supabaseUrl || "http://127.0.0.1:54321";
const buildSafeServiceRoleKey = serviceRoleKey || "missing-service-role-key";

// Admin client for server-side operations (bypasses RLS)
// Will throw at runtime if env vars are missing when actually used
export const supabaseAdmin = createClient<Database>(buildSafeSupabaseUrl, buildSafeServiceRoleKey);

export function ensureAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Get it from Supabase Dashboard > Settings > API > service_role key"
    );
  }
}
