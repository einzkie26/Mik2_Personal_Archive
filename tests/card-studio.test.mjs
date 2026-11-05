import assert from 'node:assert/strict';
import test from 'node:test';
import { getTextStatistics } from '../src/lib/textStatistics.ts';
import { CardImageReadError, prepareCardImage } from '../src/lib/cardImageUpload.ts';

test('empty and whitespace-only pieces have zero text counts', () => {
  for (const text of ['', ' \t\r\n\n ']) {
    assert.deepEqual(getTextStatistics(text), { words: 0, paragraphs: 0, sentences: 0 });
  }
});

test('blank lines separate paragraphs while poem line breaks stay together', () => {
  assert.deepEqual(getTextStatistics('First line\r\ncontinues here.\r\n \t\r\nSecond paragraph! Another sentence?'), {
    words: 8, paragraphs: 2, sentences: 3,
  });
});

test('sentences handle decimals, repeated punctuation and unfinished text', () => {
  assert.deepEqual(getTextStatistics('It costs 3.14 today. Is that right?! Yes...'), { words: 8, paragraphs: 1, sentences: 3 });
  assert.deepEqual(getTextStatistics("I'm still writing"), { words: 3, paragraphs: 1, sentences: 1 });
  assert.deepEqual(getTextStatistics('... ?!'), { words: 0, paragraphs: 1, sentences: 0 });
});

test('text counters keep all content well beyond the former limit', () => {
  const text = Array(1000).fill('A longer line. Another sentence!').join('\n\n');
  assert.deepEqual(getTextStatistics(text), { words: 5000, paragraphs: 1000, sentences: 2000 });
});

test('Unicode words and sentence punctuation are counted', () => {
  assert.deepEqual(getTextStatistics('你好，世界！\n\n再见。'), { words: 3, paragraphs: 2, sentences: 2 });
});

test('JPEG bytes determine the upload type even when the file picker mislabels them', async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  for (const type of ['image/jpeg', 'image/jpg', 'image/pjpeg', 'application/octet-stream', '', 'image/png']) {
    const image = await prepareCardImage(new File([bytes], 'background.JPEG', { type }));
    assert.equal(image.type, 'image/jpeg');
    assert.deepEqual(new Uint8Array(await image.arrayBuffer()), bytes);
  }
});

test('PNG, GIF and WebP uploads keep their real formats', async () => {
  const formats = [
    ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ['image/gif', [...Buffer.from('GIF87a')]],
    ['image/gif', [...Buffer.from('GIF89a')]],
    ['image/webp', [...Buffer.from('RIFF0000WEBP')]],
  ];
  for (const [type, bytes] of formats) {
    const image = await prepareCardImage(new File([new Uint8Array(bytes)], 'image', { type: '' }));
    assert.equal(image.type, type);
  }
});

test('renaming unsupported content to JPEG does not make it an image', async () => {
  for (const content of ['', 'not an image', '<svg xmlns="http://www.w3.org/2000/svg"></svg>']) {
    await assert.rejects(prepareCardImage(new File([content], 'image.jpg', { type: 'image/jpeg' })), /Choose a PNG, JPG, WebP or GIF image/);
  }
});

test('oversized images are rejected before reading', async () => {
  await assert.rejects(prepareCardImage({ size: 20 * 1024 * 1024 + 1 }), /smaller than 20 MB/);
});

test('mobile photos are copied with one full read without slicing the provider file', async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 2, 3, 4]);
  const originalBytes = bytes.slice();
  let reads = 0;
  const providerFile = {
    size: bytes.length,
    arrayBuffer: async () => {
      reads++;
      if (reads > 1) throw new DOMException('Photo access expired', 'NotReadableError');
      return bytes.buffer;
    },
    slice: () => { throw new DOMException('Provider does not support partial reads', 'NotReadableError'); },
  };
  const image = await prepareCardImage(providerFile);
  // The picker can release its bytes after copying without affecting later decoding.
  bytes.fill(0);
  assert.equal(image.type, 'image/jpeg');
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), originalBytes);
  assert.equal(reads, 1);
});

function mockFileReader(t, read) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'FileReader');
  Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: class {
    result = null;
    error = null;
    readAsArrayBuffer(file) {
      Promise.resolve().then(() => read(file)).then(buffer => {
        this.result = buffer;
        this.onload?.();
      }, error => {
        this.error = error;
        if (error.name === 'AbortError') this.onabort?.();
        else this.onerror?.();
      });
    }
  } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'FileReader', previous);
    else delete globalThis.FileReader;
  });
}

test('a failed photo read falls back to FileReader with the original, unsliced file', async t => {
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'mobile.jpg', { type: '' });
  let attempts = 0, fallbackReads = 0;
  t.mock.method(file, 'arrayBuffer', async () => {
    attempts++;
    throw new DOMException('Provider temporarily unavailable', 'NotReadableError');
  });
  mockFileReader(t, picked => {
    assert.equal(picked, file);
    fallbackReads++;
    return Blob.prototype.arrayBuffer.call(picked);
  });
  const image = await prepareCardImage(file);
  assert.equal(image.type, 'image/jpeg');
  assert.equal(image.size, file.size);
  assert.equal(attempts, 1);
  assert.equal(fallbackReads, 1);
});

test('older browsers can read photos without Blob.arrayBuffer', async t => {
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'older-browser.jpg');
  Object.defineProperty(file, 'arrayBuffer', { value: undefined });
  mockFileReader(t, picked => Blob.prototype.arrayBuffer.call(picked));
  assert.equal((await prepareCardImage(file)).type, 'image/jpeg');
});

test('incomplete provider reads are retried without accepting a truncated image', async t => {
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])], 'incomplete.jpg');
  t.mock.method(file, 'arrayBuffer', async () => new Uint8Array([0xff, 0xd8, 0xff]).buffer);
  mockFileReader(t, picked => Blob.prototype.arrayBuffer.call(picked));
  assert.equal((await prepareCardImage(file)).size, 8);
});

test('unreadable mobile photos offer Files recovery instead of a raw permission error', async t => {
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'unreadable.jpg');
  t.mock.method(file, 'arrayBuffer', async () => { throw new DOMException('Private provider error', 'NotReadableError'); });
  mockFileReader(t, () => { throw new DOMException('Private provider error', 'NotReadableError'); });
  await assert.rejects(prepareCardImage(file), error => {
    assert.ok(error instanceof CardImageReadError);
    assert.match(error.message, /Save it to your phone, then choose it from Files/);
    assert.doesNotMatch(error.message, /Private provider error/);
    return true;
  });
});

test('aborted mobile reads reject instead of leaving the upload pending', async t => {
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'aborted.jpg');
  t.mock.method(file, 'arrayBuffer', async () => { throw new DOMException('Read aborted', 'AbortError'); });
  mockFileReader(t, () => { throw new DOMException('Read aborted', 'AbortError'); });
  await assert.rejects(prepareCardImage(file), CardImageReadError);
});
