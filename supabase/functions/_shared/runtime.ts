import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import { DEFAULT_ORIGINS } from './http.js';

const url = Deno.env.get('SUPABASE_URL')!;
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const runtime = {
  client: createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } }),
  secret,
  origins: Deno.env.get('ALLOWED_ORIGINS') || DEFAULT_ORIGINS,
};
