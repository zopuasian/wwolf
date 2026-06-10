import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Support both standard anon key and publishable key naming
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
const buildSafeSupabaseUrl = supabaseUrl || "http://127.0.0.1:54321";
const buildSafeSupabaseAnonKey = supabaseAnonKey || "missing-anon-key";

export const supabase = createClient<Database>(buildSafeSupabaseUrl, buildSafeSupabaseAnonKey);
