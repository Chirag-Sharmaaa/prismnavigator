import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://nwwfhxmsivajjoxpvvdy.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53d2ZoeG1zaXZhampveHB2dmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNjE1NzEsImV4cCI6MjA5MzgzNzU3MX0._WZz2SSkww-CZntN167x8KWkoPNNzmnszIctgXBY5v0";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: typeof window !== "undefined",
    autoRefreshToken: typeof window !== "undefined",
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

export type Category = "ADHOC" | "IG" | "SG" | "CAR" | "NHRP";
export const CATEGORIES: Category[] = ["ADHOC", "IG", "SG", "CAR", "NHRP"];
export const CATEGORY_SLUGS: Record<string, Category> = {
  adhoc: "ADHOC", ig: "IG", sg: "SG", car: "CAR", nhrp: "NHRP",
};
