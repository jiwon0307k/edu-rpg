// Supabase client config. The anon key is safe to expose in client-side code
// (access is enforced by RLS policies, not by keeping this key secret) —
// this file is committed so GitHub Pages (no build step) can serve it directly.
const SUPABASE_URL = 'https://mvabojgxqhyftfqnfofe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12YWJvamd4cWh5ZnRmcW5mb2ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNDYxNjUsImV4cCI6MjA4NzkyMjE2NX0.3-IEEheb8qYrQW4Tn3FC8Hir9HnTO8QmhSMIA9vuMWM';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
