import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const outputDirectory = path.resolve('supabase/dashboard');
await mkdir(outputDirectory, { recursive: true });

for (const name of ['wall', 'submit-wish', 'moderate-wish']) {
  await build({
    entryPoints: [path.resolve('supabase/functions', name, 'index.ts')],
    outfile: path.join(outputDirectory, name + '.ts'),
    bundle: true,
    platform: 'neutral',
    format: 'esm',
    target: 'es2022',
    external: ['npm:*'],
    minify: false,
    sourcemap: false,
    legalComments: 'none',
    banner: {
      js: '// @ts-nocheck\n'
        + '// ARCHIVO GENERADO: copiar TODO en index.ts del editor web de Supabase.\n'
        + '// Nombre de la funcion: ' + name + '\n'
        + '// En Details, desactivar Verify JWT with legacy secret.\n'
        + '// No pegar claves: el servidor usa sus variables de entorno.\n'
        + '// Editar los fuentes de supabase/functions/ y regenerar con npm run prepare:supabase.\n',
    },
  });
  console.log('Listo para el editor web: supabase/dashboard/' + name + '.ts');
}
