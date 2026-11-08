import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { assertPublicConfig } from './src/lib/public-config.js';

export default defineConfig(({ mode, command }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  // Detener la compilacion ANTES de que un secreto pueda entrar en el bundle.
  assertPublicConfig(env, command === 'serve');
  return {
    plugins: [vue()],
    base: env.VITE_BASE_PATH || '/leticia/',
    build: { outDir: 'dist' },
    server: { port: 5173, strictPort: true },
  };
});
