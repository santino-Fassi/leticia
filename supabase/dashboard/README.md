# Publicación desde la página web de Supabase

Abrir https://supabase.com/dashboard/project/onlwavidlwjusqfhzybd/functions.

Para cada fila de la tabla:

1. Elegir **Deploy a new function → Via Editor**.
2. Reemplazar TODO el contenido de `index.ts` con el archivo indicado.
3. Usar exactamente el nombre de la función indicado y pulsar **Deploy function**.
4. Abrir **Details → Function configuration** y dejar **Verify JWT with legacy secret** desactivado. Comprobarlo otra vez después de cada actualización.

| Nombre de la función | Archivo completo para copiar |
| --- | --- |
| `wall` | `wall.ts` |
| `submit-wish` | `submit-wish.ts` |
| `moderate-wish` | `moderate-wish.ts` |

Estos archivos ya incluyen los módulos compartidos. No copiar solamente las cuatro líneas de los index.ts originales: esas líneas dependen de archivos locales que el editor web no tiene.

No hace falta poner claves en el código. Supabase proporciona las variables del servidor. El código de moderación sigue exigiendo una sesión válida y el rol de administrador, aunque la verificación JWT del gateway esté desactivada.

La lista de orígenes predeterminados ya permite http://127.0.0.1:5173, http://localhost:5173 y https://santino-fassi.github.io. Si configuraste ALLOWED_ORIGINS en Secrets, debe incluir el origen desde el que abrís la página, sin /leticia/.

Después de publicar las tres funciones, recargar la página del homenaje. Como comprobación opcional desde el proyecto, ejecutar `npm run check:backend`.

Estos archivos se generan a partir de los fuentes de `supabase/functions/`. Para mantener los cambios en Git, editar los fuentes y regenerar con `npm run prepare:supabase`; no mantener versiones diferentes a mano en el dashboard.
