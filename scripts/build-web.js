import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = resolve(root, 'web/src');
const fonts = resolve(source, 'fonts');
const androidWeb = resolve(root, 'android/app/src/main/assets/www');
const browserWeb = resolve(root, 'web/public');
const generatedBook = resolve(root, 'book/generated');

await Promise.all([
  mkdir(androidWeb, { recursive: true }),
  mkdir(browserWeb, { recursive: true }),
  mkdir(resolve(browserWeb, 'book'), { recursive: true }),
]);

for (const destination of [androidWeb, browserWeb]) {
  const fontDestination = resolve(destination, 'fonts');
  await mkdir(fontDestination, { recursive: true });
  await Promise.all([
    cp(resolve(source, 'index.html'), resolve(destination, 'index.html')),
    cp(resolve(source, 'app.css'), resolve(destination, 'app.css')),
    cp(resolve(source, 'app.js'), resolve(destination, 'app.js')),
    cp(resolve(source, 'navigation.js'), resolve(destination, 'navigation.js')),
    cp(resolve(source, 'progress.js'), resolve(destination, 'progress.js')),
    cp(resolve(source, 'edge-pull.js'), resolve(destination, 'edge-pull.js')),
    cp(resolve(source, 'pinch-font.js'), resolve(destination, 'pinch-font.js')),
    cp(resolve(source, 'storage.js'), resolve(destination, 'storage.js')),
    cp(resolve(source, 'tts.js'), resolve(destination, 'tts.js')),
    cp(resolve(source, 'sentences.js'), resolve(destination, 'sentences.js')),
    cp(resolve(source, 'pronunciation-defaults.js'), resolve(destination, 'pronunciation-defaults.js')),
    cp(fonts, fontDestination, { recursive: true, force: true }),
  ]);
}

await cp(generatedBook, resolve(browserWeb, 'book'), { recursive: true, force: true });
console.log('Reader web app and generated book copied to Android assets and web/public');
