import { createClient } from '@supabase/supabase-js';

// Load env vars (Vite style). Ensure you define these in a .env file or Vercel project settings.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables');
}

// Create and export the Supabase client instance.
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

// Optional helper: get current session quickly
export async function getCurrentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user || null;
}

// Optional helper: sign out
export async function signOut() {
  await supabase.auth.signOut();
}

// You can add auth helpers (signIn, signUp) later in src/auth/ if desired.
