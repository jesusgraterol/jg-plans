import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readBoundedFile } from 'jg-fs';

import { PAGES, SITE } from '../src/site.config.ts';

// Verify exactly the public registry, never a repository or planning-directory crawl.
for (const page of PAGES) {
  const file = fileURLToPath(new URL(`../dist${page.path}index.html`, import.meta.url));
  const html = (await readBoundedFile(file, 1024 * 1024)).toString('utf8');
  assert.ok(html.includes(`href="${SITE.url}${page.path}"`), `${page.path}: missing canonical URL`);
  assert.equal((html.match(/<h1(?:\s|>)/g) ?? []).length, 1, `${page.path}: expected one h1`);
  assert.ok(html.includes('Development preview'), `${page.path}: missing preview disclosure`);
  assert.ok(!html.includes('npm install jg-plans'), `${page.path}: unavailable install action`);
  for (const privateText of [
    'AGENTS.md',
    'CLAUDE.md',
    '1792613594_protocol-library-website',
    '/home/jesusgraterol/',
    'moldea',
  ]) {
    assert.ok(!html.includes(privateText), `${page.path}: nonpublic source leaked`);
  }
}
console.info(`Verified ${PAGES.length} preview pages.`);
