import { createClient } from '@supabase/supabase-js';

// Workaround for Vercel env vars issue
const getEnvVar = (key: string, fallback: string): string => {
  const value = import.meta.env[key];
  // Check if value is undefined, empty, or only whitespace
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    console.warn(`[Supabase] ${key} is empty, using fallback`);
    return fallback;
  }
  return value.trim();
};

const supabaseUrl = getEnvVar(
  'VITE_SUPABASE_URL',
  'https://zjxlpmbdxcplqesxgwbf.supabase.co'
);

const supabaseAnonKey = getEnvVar(
  'VITE_SUPABASE_ANON_KEY',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqeGxwbWJkeGNwbHFlc3hnd2JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MjYxMTksImV4cCI6MjA3OTAwMjExOX0.K9q-yhpHAoB0x_GgLkpEblhpbKsoyYOq3yXZs_kvQ1Q'
);

console.log('[Supabase] Using URL:', supabaseUrl);
console.log('[Supabase] Key length:', supabaseAnonKey.length);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function getCurrentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user || null;
}

export async function signOut() {
  await supabase.auth.signOut();
}
