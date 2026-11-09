import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('ships the compatibility worker matching the installed PDF.js engine', () => {
  // Git may normalize text line endings on Windows; compare executable content.
  const digest = (path: string) => createHash('sha256')
    .update(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
  expect(digest('static/vendor/pdfjs/pdf.worker.min.mjs'))
    .toBe(digest('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'));
});
