import { loadEnv } from 'vite';
import { assertPublicConfig } from '../src/lib/public-config.js';

const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
let config;
try {
  config = assertPublicConfig(env);
  if (!config.configured) throw new Error('Completá VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en .env.local.');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const base = config.url.replace(/\/$/, '');
const origin = process.argv[2] || 'http://127.0.0.1:5173';
const project = new URL(base).hostname.split('.')[0];
const fetchOptions = { signal: AbortSignal.timeout(15000) };

console.log('Proyecto: ' + base);
console.log('Origen a comprobar: ' + origin);
console.log('La clave se usa para comprobar la conexión y no se imprime.');

const checks = await Promise.all(['wall', 'submit-wish', 'moderate-wish'].map(async (name) => {
  try {
    const response = await fetch(base + '/functions/v1/' + name, {
      ...fetchOptions,
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': name === 'moderate-wish' ? 'POST' : 'GET',
        'Access-Control-Request-Headers': 'apikey,authorization,content-type',
      },
    });
    const allowedOrigin = response.headers.get('access-control-allow-origin');
    const allowedHeaders = (response.headers.get('access-control-allow-headers') || '').toLowerCase().split(',').map(value => value.trim());
    if (response.status === 404) return { name, ok: false, message: '404: función no publicada.' };
    if (response.status === 401) return { name, ok: false, message: '401: revisar verify_jwt en supabase/config.toml y volver a publicar.' };
    if (response.status === 403) return { name, ok: false, message: '403: revisar ALLOWED_ORIGINS en los secretos de las funciones.' };
    if (!response.ok) return { name, ok: false, message: response.status + ': revisar los logs de arranque de la función.' };
    if (allowedOrigin !== '*' && allowedOrigin !== origin) return { name, ok: false, message: 'El origen no está permitido por CORS.' };
    if (!['apikey', 'authorization', 'content-type'].every(header => allowedHeaders.includes(header))) return { name, ok: false, message: 'Faltan cabeceras permitidas por CORS.' };
    return { name, ok: true, message: response.status + ': función publicada y preflight CORS correcto.' };
  } catch { return { name, ok: false, message: 'No pudimos conectar con Supabase. Revisá tu conexión y el estado del proyecto.' }; }
}));

for (const check of checks) console.log((check.ok ? 'OK ' : 'ERROR ') + check.name + ' — ' + check.message);
if (checks.some(check => !check.ok)) process.exitCode = 1;

try {
  const response = await fetch(base + '/rest/v1/wishes?select=id&limit=0', {
    headers: { apikey: config.key }, signal: AbortSignal.timeout(15000),
  });
  if (response.ok) console.log('OK base de datos — tabla wishes accesible con la clave pública.');
  else {
    console.error('ERROR base de datos — HTTP ' + response.status + '. Revisá la clave y la migración SQL.');
    process.exitCode = 1;
  }
} catch {
  console.error('ERROR base de datos — no se pudo comprobar la conexión.');
  process.exitCode = 1;
}

if (checks.find(check => check.name === 'wall')?.ok) {
  try {
    const response = await fetch(base + '/functions/v1/wall?page=1', {
      headers: { Origin: origin, apikey: config.key }, signal: AbortSignal.timeout(15000),
    });
    if (response.ok) console.log('OK muro — la función responde y puede consultar los mensajes.');
    else { console.error('ERROR muro — HTTP ' + response.status + '. Revisá los logs de wall.'); process.exitCode = 1; }
  } catch { console.error('ERROR muro — no se pudo comprobar la función.'); process.exitCode = 1; }
}

const missing = checks.filter(check => check.message.startsWith('404:'));
if (missing.length) {
  console.log('\nLa API /rest/v1/ se crea con la base; /functions/v1/ requiere publicar el código por separado.');
  console.log('Opción web: abrir https://supabase.com/dashboard/project/' + project + '/functions');
  console.log('Crear cada función con el archivo completo de supabase/dashboard/ y seguir su README.');
  console.log('Alternativa por terminal: npx supabase login');
  for (const { name } of missing) console.log('npx supabase functions deploy ' + name + ' --remote=' + project + ' --use-api');
  console.log('Después repetir: npm run check:backend');
}
