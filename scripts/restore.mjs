import { createClient } from '@supabase/supabase-js';
import { readBackup, restoreBackup } from './lib/backup-files.mjs';

const source = process.argv[2];
if (!source || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Uso: npm run restore -- RUTA-DE-LA-COPIA. Completar primero .env.backup con el proyecto DESTINO.');
  process.exit(1);
}
const backup = await readBackup(source);
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
await restoreBackup(client, backup);
console.log('Restauración completa: ' + backup.wishes.length + ' mensajes y ' + backup.photos.length + ' archivos.');
console.log('Crear los accesos de Auth de nuevo y revisar el muro antes de compartirlo.');
