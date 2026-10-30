import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { hashValue } from 'jg-crypto';
import { readBoundedFile, writeFileAtomic } from 'jg-fs';
import { createShutdownSignal, parseStrictArgs } from 'jg-process';
import { z } from 'zod';

// asset checks run before the package build in CI, so compare the owning source entry
import { PROTOCOL_VERSION } from '../../src/protocol/index.ts';

import manifest from '../package.json' with { type: 'json' };

const root = resolve(import.meta.dirname, '..');
const inputs = [
  'assets/render.ts',
  'assets/social.html',
  'assets/jg-mark.svg',
  'assets/fonts/ubuntu-sans-latin-wght-normal.woff2',
  'assets/fonts/ubuntu-sans-mono-latin-wght-normal.woff2',
];
const ReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  playwright: z.literal(manifest.devDependencies['@playwright/test']),
  chromium: z.string().min(1),
  width: z.literal(1200),
  height: z.literal(630),
  inputs: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
  output: z.string().regex(/^[a-f0-9]{64}$/),
});
const read = (path: string) => readBoundedFile(resolve(root, path), 3 * 1024 * 1024);
const checkDimensions = (png: Buffer): void => {
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
};
let browser: Browser | undefined;
const shutdown = createShutdownSignal({ forceOnRepeat: true, onSignal: () => browser?.close() });
try {
  const flags = parseStrictArgs(process.argv.slice(2), { check: { type: 'boolean' } });
  const template = (await read('assets/social.html')).toString('utf8');
  assert.ok(
    template.includes(`<span class="badge">Protocol ${PROTOCOL_VERSION} · Provisional</span>`) &&
      template.includes(`protocol: <span class="value">"${PROTOCOL_VERSION}"</span>`),
    'Sharing image protocol differs from the public PROTOCOL_VERSION',
  );
  const hashes = Object.fromEntries(
    await Promise.all(inputs.map(async (path) => [path, hashValue(await read(path))])),
  );
  if (flags.check) {
    const receipt = ReceiptSchema.parse(
      JSON.parse((await read('assets/manifest.json')).toString('utf8')),
    );
    const png = await read('public/social.png');
    assert.deepEqual(receipt.inputs, hashes, 'Sharing image source changed; run assets:generate');
    assert.equal(
      receipt.output,
      hashValue(png),
      'Sharing image differs from its rendering receipt',
    );
    checkDimensions(png);
  } else {
    let html = template;
    for (const [token, path] of [
      ['SANS', inputs[3]!],
      ['MONO', inputs[4]!],
    ] as const)
      html = html.replace(
        `{{${token}}}`,
        `data:font/woff2;base64,${(await read(path)).toString('base64')}`,
      );
    html = html.replace('{{MARK}}', (await read('assets/jg-mark.svg')).toString('utf8'));
    browser = await chromium.launch({ headless: true, timeout: 30_000 });
    const page = await browser.newPage({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 1,
    });
    page.setDefaultTimeout(10_000);
    await page.route('**/*', (route) => route.abort());
    await page.setContent(html);
    await page.evaluate(async () => {
      await document.fonts.load('650 80px "JG Sans"');
      await document.fonts.load('400 16px "JG Mono"');
      await document.fonts.ready;
      if (document.fonts.size !== 2 || [...document.fonts].some((font) => font.status !== 'loaded'))
        throw new Error('A declared local font did not load');
    });
    const fits = await page.evaluate(
      () =>
        document.documentElement.scrollWidth === 1200 &&
        document.documentElement.scrollHeight === 630 &&
        [...document.querySelectorAll('main, h1, .document, footer')].every((element) => {
          const box = element.getBoundingClientRect();
          return (
            box.left >= 0 &&
            box.top >= 0 &&
            box.right <= 1200 &&
            box.bottom <= 630 &&
            element.scrollWidth <= element.clientWidth
          );
        }),
    );
    assert.ok(fits, 'Sharing image content exceeds its canvas');
    const png = await page.screenshot({ type: 'png', animations: 'disabled' });
    checkDimensions(png);
    shutdown.signal.throwIfAborted();
    await writeFileAtomic(resolve(root, 'public/social.png'), png);
    await writeFileAtomic(
      resolve(root, 'assets/manifest.json'),
      `${JSON.stringify({ schemaVersion: 1, playwright: manifest.devDependencies['@playwright/test'], chromium: browser.version(), width: 1200, height: 630, inputs: hashes, output: hashValue(png) }, null, 2)}\n`,
    );
  }
  if (!shutdown.receivedSignal())
    console.info(`Sharing image ${flags.check ? 'verified' : 'generated'}: 1200 × 630.`);
} catch (cause) {
  if (shutdown.receivedSignal()) process.exitCode = shutdown.exitCode() ?? 1;
  else throw cause;
} finally {
  await browser?.close();
  shutdown.dispose();
}
