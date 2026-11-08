import { loadEnv } from 'vite';
import { assertPublicConfig } from '../src/lib/public-config.js';

const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'].filter((name) => !env[name]?.trim());
if (missing.length) {
  console.error('Falta completar: ' + missing.join(', '));
  console.error('Completá .env.local. La portada funciona mientras tanto.');
  process.exitCode = 1;
} else {
  try {
    assertPublicConfig(env);
    console.log('Configuración pública válida. Falta comprobar la conexión al proyecto desplegado.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
