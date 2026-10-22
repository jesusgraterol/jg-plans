import { expect, it } from 'vitest';

import { matchesServedFile } from './verify-deployment.ts';

const artifact = Buffer.from(
  '\uFEFFBefore 👋\r\n<!--email_off--><code>npm install jg-plans@0.1.2</code><!--/email_off-->\n<!--keep-->After',
);
const served = Buffer.from(
  '\uFEFFBefore 👋\r\n<code>npm install jg-plans@0.1.2</code>\n<!--keep-->After',
);

it('accepts the original artifact or exactly one consumed homepage guard without changing content', () => {
  expect(matchesServedFile('index.html', artifact, artifact, 'published')).toBe(true);
  expect(matchesServedFile('index.html', artifact, served, 'published')).toBe(true);
  for (const state of ['preview', 'unknown'] as const)
    expect(matchesServedFile('index.html', artifact, served, state)).toBe(false);
  for (const path of ['docs/index.html', 'downloads/example.md', '404.html']) {
    expect(matchesServedFile(path, artifact, artifact, 'published')).toBe(true);
    expect(matchesServedFile(path, artifact, served, 'published')).toBe(false);
  }
});

it('rejects changed commands, injected markup, whitespace changes and unrelated comment removal', () => {
  for (const changed of [
    served.toString('utf8').replace('0.1.2', '0.1.3'),
    served.toString('utf8') + '<script src="/cdn-cgi/decoder.js"></script>',
    served.toString('utf8').replace('\r\n', '\n'),
    served.toString('utf8').replace('<!--keep-->', ''),
    served.toString('utf8').replace('Before', 'Before '),
  ])
    expect(matchesServedFile('index.html', artifact, Buffer.from(changed), 'published')).toBe(
      false,
    );
});

it('rejects missing, reversed, unbalanced or repeated control guards', () => {
  for (const source of [
    '<!--other-->Text<!--/other-->',
    '<!--/email_off-->Text<!--email_off-->',
    '<!--email_off-->Text',
    'Text<!--/email_off-->',
    '<!--email_off--><!--email_off-->Text<!--/email_off-->',
    '<!--email_off-->Text<!--/email_off--><!--/email_off-->',
  ])
    expect(
      matchesServedFile('index.html', Buffer.from(source), Buffer.from('Text'), 'published'),
    ).toBe(false);
});
