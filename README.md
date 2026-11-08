# 30 años modelando sueños — Leticia Suárez del Cerro

Landing con Vue 3, Vite y Bootstrap 5. GitHub Pages publica el frontend; Supabase guarda los mensajes y las fotos, valida los envíos y autentica al equipo de moderación.

## Estado y primer inicio

La portada funciona sin credenciales. Hasta completar Supabase, el muro muestra un aviso de apertura próxima y no acepta envíos. No hay mensajes inventados ni guardado en localStorage que simule una publicación real.

Requisitos: Node.js 22.12 o superior (se recomienda Node 24) y npm.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Abrir la URL que informa Vite, normalmente http://127.0.0.1:5173/leticia/.

En **.env.local**, completar únicamente:

```dotenv
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU-CLAVE-PUBLICABLE
VITE_BASE_PATH=/leticia/
```

La clave puede ser una `sb_publishable_...` o la clave `anon` heredada. La URL y esa clave son públicas: las reglas de acceso protegen los datos. Nunca usar `sb_secret_...`, `service_role`, contraseñas ni conexiones de base de datos en variables `VITE_`. La compilación rechaza claves que no sean publicables. Reiniciar Vite después de editar las variables.

```powershell
npm run check:config
npm test
npm run build
npm run preview
```

`check:config` comprueba los valores. Para comprobar también la base de datos, las funciones y CORS, usar `npm run check:backend`.

## 1. Crear Supabase y la base de datos

1. Crear una cuenta y un proyecto en el plan **Free**. Guardar la contraseña de la base de datos en un lugar privado.
2. En **Project Settings → API / API Keys**, copiar Project URL y la clave publicable a .env.local.
3. Abrir **SQL Editor**, pegar el contenido completo de **supabase/migrations/202611070001_wall.sql** y ejecutar **una sola vez**, en el proyecto nuevo.
4. Ejecutar también **supabase/migrations/202611080001_optional_location.sql** para que ciudad y país sean opcionales.
5. Comprobar que exista la tabla `public.wishes` y que RLS esté activado.
6. Comprobar que Storage contenga `wish-photos`, marcado como **privado**. No hacerlo público ni agregar políticas que permitan subir/descargar anónimamente.
7. En **Authentication → Providers / Email**, desactivar el registro público. Las visitantes no usan cuentas.

La migración crea una lista privada de administradores y un registro antispam. Un usuario de Auth NO es administrador hasta incorporarlo a esa lista.

Alternativa al SQL Editor, después de iniciar sesión con la CLI:

```powershell
npx supabase login
npx supabase link --project-ref TU-PROYECTO
npx supabase db push
```

Usar el SQL Editor **o** db push para la instalación inicial; no ejecutar ambos sobre la misma base ya inicializada.

Para actualizar un proyecto que ya funciona y hacer opcionales ciudad y país:

1. Ejecutar únicamente **supabase/migrations/202611080001_optional_location.sql** en el SQL Editor. Conserva los mensajes existentes.
2. Actualizar la función **submit-wish** desde su editor web con TODO el contenido de **supabase/dashboard/submit-wish.ts** y pulsar **Deploy**. Comprobar que **Verify JWT with legacy secret** siga desactivado.
3. Subir los cambios del frontend a GitHub y esperar que termine el workflow de Pages.

## 2. Publicar las Edge Functions

### Desde la página web de Supabase (sin usar la CLI)

Abrir https://supabase.com/dashboard/project/onlwavidlwjusqfhzybd/functions y elegir **Deploy a new function → Via Editor**.

Crear estas tres funciones, reemplazando TODO el contenido de index.ts por el archivo completo indicado:

| Nombre exacto en Supabase | Archivo completo para copiar |
| --- | --- |
| `wall` | `supabase/dashboard/wall.ts` |
| `submit-wish` | `supabase/dashboard/submit-wish.ts` |
| `moderate-wish` | `supabase/dashboard/moderate-wish.ts` |

Después de pulsar **Deploy function**, abrir **Details → Function configuration** y desactivar **Verify JWT with legacy secret** en cada una. El código de moderación y la consulta administrativa verifican la sesión y el rol dentro de la función; esa protección sigue activa. No cambiar RLS ni volver público el bucket.

Los archivos de dashboard ya incluyen el código compartido y no contienen claves. Supabase proporciona las variables del servidor. No copiar solamente el index.ts original de cuatro líneas, porque importa archivos locales que el editor web no tiene.

Para actualizar esos archivos después de editar el backend: `npm run prepare:supabase`. Los archivos fuente se mantienen en supabase/functions/.

Al terminar, recargar el homenaje. La comprobación opcional `npm run check:backend` distingue funciones no publicadas (404), configuración JWT (401), orígenes no permitidos (403) y fallos de arranque.

La variable VITE_SUPABASE_URL debe ser la raíz del proyecto, sin /rest/v1/ ni /functions/v1/. La API REST de las tablas se crea con la base; las Edge Functions se publican por separado, tanto desde la web como desde la CLI.

### Alternativa por terminal

La CLI se puede ejecutar con npx; no necesita un servidor PHP ni una instalación global.

```powershell
npx supabase login
npx supabase functions deploy submit-wish --remote=TU-PROYECTO --use-api
npx supabase functions deploy wall --remote=TU-PROYECTO --use-api
npx supabase functions deploy moderate-wish --remote=TU-PROYECTO --use-api
```

`supabase/config.toml` desactiva la verificación JWT del gateway para estas funciones porque el muro y el formulario son públicos. **moderate-wish y la vista administrativa de wall verifican el JWT con Auth y consultan la lista de administradores dentro del handler.** No quitar esas comprobaciones.

El runtime proporciona `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` a las funciones; nunca se envían al frontend.

Para personalizar los orígenes permitidos:

```powershell
Copy-Item supabase/.env.example supabase/.env.local
# Editar ALLOWED_ORIGINS en ese archivo.
npx supabase secrets set --env-file supabase/.env.local --project-ref TU-PROYECTO
```

El valor predeterminado ya permite `https://santino-fassi.github.io`, `http://localhost:5173` y `http://127.0.0.1:5173`. Un origen incluye protocolo y dominio, **sin** /leticia/. Para producción se recomienda dejar solo el dominio publicado. Si usás otro puerto local, agregalo a la lista.

Funciones disponibles:

| Función | Acceso | Uso |
| --- | --- | --- |
| GET submit-wish | Público | Pregunta aritmética y token firmado con vencimiento |
| POST submit-wish | Público | FormData, validación, fotos y mensaje pendiente |
| GET wall?page=1 | Público | 12 aprobados y enlaces temporales a sus fotos |
| GET wall?admin=true&status=pending&page=1 | Administrador | Pendientes, aprobados o rechazados |
| POST moderate-wish | Administrador | JSON con id y action: approve / reject |

CORS permite que el navegador use estas funciones desde el sitio. Los permisos reales dependen de RLS, la validación del token y la lista privada de administradores.

## 3. Crear el acceso del equipo

1. En **Authentication → Users → Add user / Create user**, crear la cuenta con correo y contraseña. Marcar el correo como confirmado si el panel ofrece esa opción. No hace falta configurar envío de correos para iniciar sesión con contraseña.
2. En SQL Editor, reemplazar el correo y ejecutar:

```sql
insert into private.wall_admins (user_id)
select id from auth.users
where lower(email) = lower('TU-CORREO@EJEMPLO.COM')
on conflict (user_id) do nothing;
```

3. Confirmar que `private.wall_admins` contenga el UUID del usuario.
4. En **Authentication → URL Configuration**, usar como Site URL `https://santino-fassi.github.io/leticia/`. Agregar también la URL local si necesitás flujos de recuperación.
5. Ir al enlace **Administración** del pie de página, o abrir `/leticia/#administracion`, e ingresar.

El panel permite publicar pendientes, rechazar aportes y retirar mensajes publicados. Al rechazar se eliminan las fotos; el texto queda en la sección de rechazados para el equipo. Si una eliminación de Storage falla, el mensaje queda oculto y el panel permite reintentar borrar sus fotos. Un rechazado no se vuelve a publicar.

Para revocar a un moderador:

```sql
delete from private.wall_admins
where user_id in (select id from auth.users where lower(email) = lower('CORREO-A-REVOCAR@EJEMPLO.COM'));
```

La contraseña se administra desde Supabase; no se guarda en el repositorio.

## 4. Publicar en GitHub Pages

Repositorio configurado: https://github.com/santino-Fassi/leticia
Dirección prevista: https://santino-fassi.github.io/leticia/

1. Mantener el repositorio **público** si se usa GitHub Free.
2. En **Settings → Pages → Build and deployment → Source**, elegir **GitHub Actions**.
3. En **Settings → Secrets and variables → Actions → Variables**, crear:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Subir el código a `main`. El workflow **.github/workflows/deploy.yml** instala con npm ci, ejecuta las pruebas, compila y publica solamente dist/.
5. Revisar que termine correctamente **Actions → Verificar y publicar homenaje**.

Las variables anteriores son públicas; no agregar una clave administrativa. Si todavía están vacías, se publica la portada con el muro cerrado. Después de cambiarlas, volver a ejecutar el workflow para reconstruir el sitio.

La ruta base se calcula a partir del nombre del repositorio en Actions. Para un dominio propio o un repositorio `usuario.github.io`, cambiar VITE_BASE_PATH a `/` en el workflow y en la configuración local. La navegación administrativa usa un fragmento #administracion y no necesita reglas de reescritura del servidor.

Los cambios de Supabase se despliegan con su CLI: publicar el frontend no ejecuta SQL ni instala funciones automáticamente.

## Fotos, seguridad y cuotas

- Originales: JPG, PNG o WebP de hasta 5 MB. El navegador normaliza orientación, elimina metadatos al dibujar en canvas y crea JPEG de hasta 1280 px / 300 KB y miniatura de hasta 480 px / 50 KB.
- El servidor vuelve a comprobar MIME, firma y estructura JPEG, peso, dimensiones y que existan ambas variantes.
- Los textos se guardan como texto y Vue los presenta escapados; no se usa v-html para mensajes.
- Nombre y mensaje son los datos obligatorios; ciudad y país son opcionales y admiten hasta 80 caracteres cada uno. El servidor valida también estos límites, el consentimiento y la comprobación antispam.
- Los envíos usan un token firmado con vencimiento de 20 minutos, una pregunta sencilla, un campo trampa y un límite atómico de **3 intentos válidos por conexión y hora**. La pregunta es una barrera básica, no un CAPTCHA avanzado. Personas en una misma red comparten esa cuota.
- Se guarda un HMAC de la IP en el registro de intentos, nunca la IP original. Se limpia el historial de más de dos días cuando llega un nuevo envío.
- Las fotos se mantienen privadas incluso después de aprobarlas. Solo las funciones generan enlaces válidos por diez minutos para aprobados o para el administrador.
- No habilitamos Realtime ni el servicio pago de transformación de imágenes.
- 500 fotos de 300 KB más sus miniaturas ocupan aproximadamente 175 MB. Revisar Storage, transferencia e invocaciones en Supabase.

Cuotas Free verificadas al planificar: 500 MB de base de datos, 1 GB de archivos, 5 GB de transferencia y otros 5 GB cacheados mensuales. Son cuotas distintas; no se deben asumir 10 GB intercambiables. El costo cero depende del uso y de las condiciones vigentes de cada proveedor.

Supabase puede pausar un proyecto gratuito con poca actividad durante siete días. Revisar los correos del proveedor y reactivar con **Resume project** desde su panel. La portada continúa en GitHub Pages; el muro informa que no está disponible. No se garantiza un muro activo permanentemente con el plan Free.

GitHub Pages limita el sitio publicado a 1 GB y tiene un límite flexible de 100 GB de transferencia mensual. El tráfico de las fotos se consume en Supabase. Este proyecto se plantea como homenaje sin tienda ni cobros.

## Copias de seguridad y recuperación

Hacer una copia **semanal**, antes del evento y antes de modificar la base de datos. La periodicidad es una tarea operativa: no se creó una automatización ni se guardaron credenciales en GitHub.

```powershell
Copy-Item .env.backup.example .env.backup
# Completar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY SOLO en .env.backup.
npm run backup
```

El script escribe mensajes y archivos en `backups/FECHA/`. **manifest.json aparece únicamente cuando la copia terminó completa.** Las copias y .env.backup están ignoradas por Git. Guardar una segunda copia en una ubicación privada fuera de esta computadora: contienen mensajes y fotos pendientes, no solo públicos. Un fallo exige volver a ejecutar el comando y conservar únicamente una carpeta con manifiesto completo.

Restauración en un proyecto nuevo:

1. Aplicar la migración, crear de nuevo los administradores y publicar las tres funciones.
2. Usar `npm run restore -- RUTA-DE-LA-COPIA` con .env.backup apuntando al proyecto destino. El script exige una tabla y un bucket vacíos y valida los archivos antes de importar.
3. Actualizar las variables del frontend y reconstruir GitHub Pages.
4. Enviar un aporte de prueba, aprobarlo y comprobarlo desde una sesión sin iniciar.

Las cuentas y contraseñas de Auth no forman parte de estas copias. No se debe asumir que las copias automáticas de la base incluyen los archivos de Storage.

## Verificaciones

`npm test` cubre los handlers con peticiones HTTP reales en memoria y ejecuta la migración en PostgreSQL embebido (PGlite). Comprueba:

- lectura exclusiva de aprobados, acceso de administradores y bloqueo de escrituras directas;
- archivos privados sin políticas de acceso anónimo;
- envíos con/sin foto, validaciones, consentimiento, spam, tokens vencidos y repetidos;
- limpieza al fallar Storage/DB, moderación y conflictos entre acciones;
- paginación de 12, permisos para URLs temporales y rechazo de claves secretas en el frontend.

Antes de compartir el sitio real, probar desde un celular y otra sesión del navegador: enviar texto y foto, verificar que el pendiente no se vea, aprobarlo y comprobar su publicación, rechazarlo y comprobar la retirada. Revisar también los enlaces de las imágenes, la pestaña de red y el consumo de cuotas.

La portada conserva las imágenes externas del diseño inicial. Para asegurar su disponibilidad, reemplazarlas por archivos autorizados en public/ y usar rutas compatibles con la base de Vite.

## Estructura

- `src/`: componentes, conexión a Supabase, compresión y estilos del muro.
- `frontend/estilos/styles.css`: estilos de la portada original, conservados.
- `supabase/`: migración, funciones y configuración del backend.
- `scripts/`: comprobación de variables, copias y restauración.
- `tests/`: pruebas y dobles de servicios; nunca se publican en dist/.
- `referencia.html`: referencia visual original.

## Referencias oficiales

- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Vite en GitHub Pages](https://vite.dev/guide/static-deploy)
- [Supabase: precios](https://supabase.com/pricing)
- [Supabase: pausas](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Supabase: archivos privados](https://supabase.com/docs/guides/storage/buckets/fundamentals)
