import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { verifyShareFonts } from '../scripts/verify-share-fonts.mjs';

test('all bundled thumbnail fonts contain usable data before deployment', async () => {
  assert.ok(await verifyShareFonts() > 0);
});

test('the build rejects a pointer-only Git checkout instead of deploying broken thumbnails', async () => {
  const root = resolve('.'), directory = await mkdtemp(join(root, '.tmp-share-fonts-'));
  try {
    await writeFile(join(directory, 'missing.ttf'), 'version https://git-lfs.github.com/spec/v1\noid sha256:123456789\nsize 290236\n');
    await assert.rejects(verifyShareFonts(directory), /Git LFS pointer/);
  } finally {
    assert.ok(directory.startsWith(root + sep + '.tmp-share-fonts-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('the build rejects missing and corrupt thumbnail fonts', async () => {
  const root = resolve('.'), directory = await mkdtemp(join(root, '.tmp-share-fonts-'));
  try {
    await assert.rejects(verifyShareFonts(directory), /fonts are missing/);
    await writeFile(join(directory, 'broken.ttf'), Buffer.alloc(2000));
    await assert.rejects(verifyShareFonts(directory), /does not contain usable font data/);
  } finally {
    assert.ok(directory.startsWith(root + sep + '.tmp-share-fonts-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('Git stores runtime fonts directly instead of replacing them with LFS pointers', async () => {
  const files = (await readdir('server/fonts')).filter(name => name.endsWith('.ttf')).map(name => `server/fonts/${name}`);
  const result = execFileSync('git', ['check-attr', '-z', 'filter', '--', ...files], { encoding: 'utf8' }).split('\0');
  for (let index = 0; index + 2 < result.length; index += 3) {
    assert.equal(result[index + 2], 'unset', `${result[index]} must be available in a deployment checkout without Git LFS`);
  }
  assert.equal((result.length - 1) / 3, files.length);
});
