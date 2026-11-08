import { assertPublicConfig } from './lib/public-config.js';

// Completar .env.local y las Variables de GitHub Actions con valores PUBLICOS.
// Nunca usar una clave secret/service_role en una variable VITE_.
const config = assertPublicConfig({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
}, import.meta.env.DEV);
export const SUPABASE_URL = config.url;
export const SUPABASE_PUBLISHABLE_KEY = config.key;
export const isConfigured = config.configured;

export const MAX_ORIGINAL_BYTES = 5 * 1024 * 1024;
