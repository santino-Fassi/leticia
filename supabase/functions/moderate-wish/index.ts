import { runtime } from '../_shared/runtime.ts';
import { createModerateHandler } from '../_shared/moderate.js';

Deno.serve(createModerateHandler(runtime));
