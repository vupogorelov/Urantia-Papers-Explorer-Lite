import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const androidDir = fileURLToPath(new URL('../android/', import.meta.url));
const outputDir = fileURLToPath(new URL('../dist/', import.meta.url));
const variant = process.env.ANDROID_BUILD_VARIANT === 'release' ? 'release' : 'debug';
const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
const task = `assemble${variant[0].toUpperCase()}${variant.slice(1)}`;
const result = spawnSync(gradlew, [task], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.status !== 0) process.exit(result.status ?? 1);

const apk = resolve(androidDir, 'app', 'build', 'outputs', 'apk', variant, `app-${variant}.apk`);
await mkdir(outputDir, { recursive: true });
const namedApk = resolve(androidDir, 'app', 'build', 'outputs', 'apk', variant, 'upexplorer.apk');
await copyFile(apk, namedApk);
await copyFile(namedApk, resolve(outputDir, 'upexplorer.apk'));
console.log('Packaged dist/upexplorer.apk');
