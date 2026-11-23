'use strict';

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Optimiza localmente los videos de la carpeta de origen hacia src/galeria/videos/
 * y genera sus posters en src/galeria/posters/ usando ffmpeg SIN recortar ni cortar duración.
 *
 * Uso:
 *   npm run optimize:gallery -- "C:\ruta\a\galeria\videos"
 */
const ROOT = process.cwd();
const MANIFEST_PATH = join(ROOT, 'src', 'lib', 'gallery-manifest.json');
const VIDEOS_DIR = join(ROOT, 'src', 'galeria', 'videos');
const POSTERS_DIR = join(ROOT, 'src', 'galeria', 'posters');

const inputDirArg = process.argv[2];
if (!inputDirArg) {
  console.error('Indicá la ruta a la carpeta con los videos originales de Drive.');
  console.error('Ejemplo: npm run optimize:gallery -- "./galeria/videos"');
  process.exit(1);
}

const inputDir = resolve(inputDirArg);
if (!existsSync(inputDir)) {
  console.error(`No se encontró la carpeta: ${inputDir}`);
  process.exit(1);
}

mkdirSync(VIDEOS_DIR, { recursive: true });
mkdirSync(POSTERS_DIR, { recursive: true });

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

function probeVideo(filePath) {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=codec_type,width,height',
    '-of', 'json',
    filePath,
  ], { encoding: 'utf8' });
  return JSON.parse(out);
}

let processed = 0;

for (const entry of manifest.videos) {
  const srcPath = join(inputDir, entry.sourceName);
  if (!existsSync(srcPath)) {
    console.log(`Saltando ${entry.id}: no existe "${entry.sourceName}" en ${inputDir}`);
    continue;
  }

  const outMp4 = join(VIDEOS_DIR, entry.file);
  const outPoster = join(POSTERS_DIR, entry.poster);
  const before = probeVideo(srcPath);
  const durBefore = Number(before.format.duration || 0);

  console.log(`Optimizando ${entry.sourceName} -> ${entry.file} (duración original: ${durBefore.toFixed(2)}s, sin recortes)...`);

  execFileSync('ffmpeg', [
    '-y',
    '-i', srcPath,
    '-vf', "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '27',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '96k',
    '-movflags', '+faststart',
    outMp4,
  ], { stdio: 'inherit' });

  const seekSeconds = Math.min(1, Math.max(0.1, durBefore * 0.15)).toFixed(2);
  execFileSync('ffmpeg', [
    '-y',
    '-ss', seekSeconds,
    '-i', outMp4,
    '-vframes', '1',
    '-vf', "scale='min(800,iw)':'min(800,ih)':force_original_aspect_ratio=decrease",
    '-c:v', 'libwebp',
    '-q:v', '80',
    outPoster,
  ], { stdio: 'ignore' });

  const after = probeVideo(outMp4);
  const durAfter = Number(after.format.duration || 0);
  const vStream = after.streams.find((s) => s.codec_type === 'video');

  entry.width = Number(vStream?.width || entry.width);
  entry.height = Number(vStream?.height || entry.height);
  entry.duration = Math.round(durAfter);

  const mbBefore = (statSync(srcPath).size / 1024 / 1024).toFixed(2);
  const mbAfter = (statSync(outMp4).size / 1024 / 1024).toFixed(2);
  console.log(`  OK ${entry.file}: ${mbBefore} MB -> ${mbAfter} MB (${durAfter.toFixed(2)}s)`);
  processed += 1;
}

writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Listo: ${processed} video(s) optimizado(s) y manifiesto actualizado.`);
