import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

test('the sharing function cold-starts from compiled JavaScript and serves HTML and PNG', async () => {
  const root = resolve('.');
  const artifact = await mkdtemp(join(root, '.tmp-share-function-'));
  try {
    const config = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
    assert.equal(config.error, undefined);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    const program = ts.createProgram([join(root, 'api/share.ts')], {
      ...parsed.options, noEmit: false, rootDir: root, outDir: artifact, sourceMap: false,
    });
    const emitted = program.emit();
    const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitted.diagnostics);
    assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => root, getCanonicalFileName: name => name, getNewLine: () => '\n',
    }));
    assert.equal(emitted.emitSkipped, false);
    await writeFile(join(artifact, 'package.json'), '{"type":"module"}');
    await symlink(join(root, 'node_modules'), join(artifact, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    await cp(join(root, 'server/fonts'), join(artifact, 'server/fonts'), { recursive: true });
    await mkdir(join(artifact, 'dist'), { recursive: true });
    await writeFile(join(artifact, 'dist/index.html'), '<!doctype html><html><head><title>Archive</title></head><body><div id="root"></div></body></html>');

    // A fresh Node process has no source loader or TypeScript resolution hooks.
    // This catches module paths that pass source-level tests but fail on Vercel.
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      const entry = { number: '01', title: 'A shareable poem', excerpt: 'A window left open.\\nA light that stays.', category: 'Poem', date: 'Nov 05, 2026', is_public: true, author: 'Mikhai' };
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input, init) => {
        const url = new URL(input);
        if (url.pathname !== '/rest/v1/archive_entries') return originalFetch(input, init);
        return Response.json(url.searchParams.get('number') === 'eq.01' ? [entry] : []);
      };
      const { default: api } = await import(${JSON.stringify(pathToFileURL(join(artifact, 'api/share.js')).href)});
      assert.equal(typeof api.fetch, 'function');
      const page = await api.fetch(new Request('https://archive.example.test/piece/01'));
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.match(html, /property="og:title" content="A shareable poem"/);
      assert.ok(html.includes('https://archive.example.test/piece/01/image.png'));
      const image = await api.fetch(new Request('https://archive.example.test/piece/01/image.png'));
      assert.equal(image.status, 200);
      assert.equal(image.headers.get('Content-Type'), 'image/png');
      const bytes = Buffer.from(await image.arrayBuffer());
      assert.equal(bytes.readUInt32BE(16), 1200);
      assert.equal(bytes.readUInt32BE(20), 630);
      assert.equal((await api.fetch(new Request('https://archive.example.test/piece/missing'))).status, 404);
      console.log('Compiled sharing function: HTML 200, PNG 200, missing piece 404');
    `], { cwd: artifact, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.error, undefined, String(result.error));
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    if (!artifact.startsWith(root + sep + '.tmp-share-function-')) throw new Error('Unexpected test output directory');
    await rm(artifact, { recursive: true, force: true });
  }
});
