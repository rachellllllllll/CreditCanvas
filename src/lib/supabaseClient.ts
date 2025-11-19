// Placeholder supabase client
// Replace with real supabase client init if you install @supabase/supabase-js

export const supabaseClient = {
  // minimal placeholder methods to avoid runtime errors
  from: (table: string) => ({
    select: () => Promise.resolve([]),
    insert: (data: any) => Promise.resolve({ data, error: null }),
  }),
};
