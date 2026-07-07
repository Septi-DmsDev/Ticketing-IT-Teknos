import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
// Bot needs the service role key: dispatcher/heartbeat write to tables that
// have no anon/authenticated RLS policies at all (service_role only).
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[BOT] Missing Supabase environment variables!');
}

// Single shared instance — imported by dispatcher.ts and heartbeat.ts
// (Task 4/5) instead of each module creating its own client.
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
