import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function verifyShareFonts(directory = new URL('../server/fonts/', import.meta.url)) {
  const names = (await readdir(directory)).filter(name => name.endsWith('.ttf'));
  if (!names.length) throw new Error('The sharing fonts are missing from server/fonts.');
  const base = directory instanceof URL ? directory : pathToFileURL(resolve(directory) + '/');
  for (const name of names) {
    const bytes = await readFile(new URL(name, base));
    if (bytes.subarray(0, 64).toString().startsWith('version https://git-lfs.github.com/spec/v1')) {
      throw new Error(`The sharing font ${name} is a Git LFS pointer. Commit the actual server/fonts files as regular Git assets before deploying.`);
    }
    if (bytes.length < 1024 || (bytes.readUInt32BE(0) !== 0x00010000 && bytes.subarray(0, 4).toString() !== 'OTTO')) {
      throw new Error(`The sharing font ${name} does not contain usable font data.`);
    }
  }
  return names.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(`Verified ${await verifyShareFonts()} bundled sharing fonts.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
