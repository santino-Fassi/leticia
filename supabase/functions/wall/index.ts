import { runtime } from '../_shared/runtime.ts';
import { createWallHandler } from '../_shared/wall.js';

Deno.serve(createWallHandler(runtime));
