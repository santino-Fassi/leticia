import { runtime } from '../_shared/runtime.ts';
import { createSubmitHandler } from '../_shared/submit.js';

Deno.serve(createSubmitHandler(runtime));
