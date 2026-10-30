import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { readBoundedFile } from 'jg-fs';
import { isMainModule } from 'jg-process';

import { SiteReleaseSchema } from '../src/availability.ts';
import { PUBLIC_SOURCES } from '../src/content/sources.ts';
import { PAGES, SITE } from '../src/site.config.ts';

const excluded = new Set(['_archive', '_archives', '_backup', '_backups']);

/** Read only a bounded, generated artifact. Never follow links or excluded directories. */
export const readSiteFiles = async (directory: string): Promise<Map<string, Buffer>> => {
  const files = new Map<string, Buffer>();
  let count = 0,
    total = 0;
  const visit = async (path: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      assert.ok(++count <= 512, 'Site artifact has too many entries');
      assert.ok(!excluded.has(entry.name), 'Excluded directory in site artifact');
      const name = prefix + entry.name;
      const target = resolve(path, entry.name);
      if (entry.isDirectory()) await visit(target, `${name}/`);
      else {
        assert.ok(entry.isFile(), 'Site artifacts must contain regular files');
        const bytes = await readBoundedFile(target, 4 * 1024 * 1024);
        total += bytes.length;
        assert.ok(total <= 32 * 1024 * 1024, 'Site artifact is too large');
        files.set(name, bytes);
      }
    }
  };
  await visit(directory, '');
  return files;
};

/** Parse production HTML and prove original-download identity without discovering source files. */
export const verifyBuild = async (
  directory = resolve(import.meta.dirname, '../dist'),
): Promise<void> => {
  const files = await readSiteFiles(directory);
  const content = (path: string): string => {
    const bytes = files.get(path);
    assert.ok(bytes, `Missing site output: ${path}`);
    return bytes.toString('utf8');
  };
  assert.ok(
    ![...files.keys()].some((path) => /^(?:(?:raw|downloads)\/)?protocol\/0\.1(?:\/|$)/.test(path)),
    'Removed protocol output exists',
  );
  const release = SiteReleaseSchema.parse(JSON.parse(content('release.json')));
  assert.equal(release.version, SITE.sourceVersion);
  if (release.state === 'published') {
    const protectedCommand = /<!--email_off-->([\s\S]*?)<!--\/email_off-->/.exec(
      content('index.html'),
    )?.[1];
    assert.ok(
      protectedCommand?.includes('id="install-command"') &&
        protectedCommand.includes(`jg-plans@${release.version}`),
      'The install command must be protected from email obfuscation',
    );
  }
  const expected = new Set([
    '404.html',
    'release.json',
    'robots.txt',
    'sitemap.xml',
    'llms.txt',
    'social.png',
    'licenses/jg-ui.txt',
    'licenses/ubuntu-fonts.txt',
  ]);
  const documents = PAGES.map((page) => {
    const path = `${page.path.slice(1)}index.html`;
    expected.add(path);
    return { path: page.path, html: content(path) };
  });
  expected.add('raw/index.md');
  const label = release.state === 'published' ? 'Verified package release' : 'Development preview';
  assert.ok(content('raw/index.md').startsWith(label));
  for (const source of PUBLIC_SOURCES) {
    expected.add(`downloads/${source}`);
    const original = await readBoundedFile(
      resolve(import.meta.dirname, '../..', source),
      1024 * 1024,
    );
    assert.deepEqual(
      files.get(`downloads/${source}`),
      original,
      `${source}: download bytes differ`,
    );
    if (source.endsWith('.md')) {
      expected.add(`raw/${source}`);
      const raw = content(`raw/${source}`);
      assert.ok(raw.endsWith(original.toString('utf8')), `${source}: raw content differs`);
      assert.ok(raw.startsWith(label));
      assert.ok(raw.includes(`Package ${release.version}`));
    }
  }
  for (const [path, bytes] of files) {
    assert.ok(
      expected.has(path) ||
        /^_astro\/[A-Za-z0-9_.-]+\.(css|js|woff2|svg|png)$/.test(path) ||
        path === 'CNAME' ||
        path === '.nojekyll',
      `Unexpected public output: ${path}`,
    );
    if (/\.(html|md|js|css|json|txt|xml|mjs)$/.test(path))
      assert.ok(
        !/\b(?:AGENTS|CLAUDE|SKILL)\.md\b|\/(?:home|Users)\/[^/\s"'<>]+\//.test(
          bytes.toString('utf8'),
        ),
        `${path}: nonpublic source leaked`,
      );
  }
  for (const path of expected) assert.ok(files.has(path), `Missing public output: ${path}`);
  assert.equal(files.get('social.png')!.readUInt32BE(16), 1200);
  assert.equal(files.get('social.png')!.readUInt32BE(20), 630);
  const browser = await chromium.launch({ headless: true, timeout: 30_000 });
  try {
    const page = await browser.newPage({ javaScriptEnabled: false });
    const observed = await page.evaluate(
      (documents) =>
        documents.map(({ path, html }) => {
          const document = new DOMParser().parseFromString(html, 'text/html');
          const attributes = (selector: string, attribute: string): string[] =>
            [...document.querySelectorAll(selector)].map(
              (node) => node.getAttribute(attribute) ?? '',
            );
          return {
            path,
            title: document.title,
            descriptions: attributes('meta[name="description"]', 'content'),
            canonical: attributes('link[rel="canonical"]', 'href'),
            robots: attributes('meta[name="robots"]', 'content'),
            ogUrl: attributes('meta[property="og:url"]', 'content'),
            ogImage: attributes('meta[property="og:image"]', 'content'),
            ogWidth: attributes('meta[property="og:image:width"]', 'content'),
            ogHeight: attributes('meta[property="og:image:height"]', 'content'),
            ogType: attributes('meta[property="og:image:type"]', 'content'),
            ogAlt: attributes('meta[property="og:image:alt"]', 'content'),
            twitterAlt: attributes('meta[name="twitter:image:alt"]', 'content'),
            alternate: attributes('link[rel="alternate"][type="text/markdown"]', 'href'),
            h1: document.querySelectorAll('h1').length,
            ids: attributes('[id]', 'id'),
            links: attributes('a[href]', 'href'),
            assets: [
              ...attributes('script[src],img[src]', 'src'),
              ...attributes('link[rel="stylesheet"],link[rel="icon"]', 'href'),
            ],
            structured: [...document.querySelectorAll('script[type="application/ld+json"]')].map(
              (node) => node.textContent ?? '',
            ),
            text: document.body.textContent ?? '',
            installCommand:
              document
                .querySelector('#install-command')
                ?.textContent?.replace(/\s+/g, ' ')
                .trim() ?? null,
          };
        }),
      [...documents, { path: '/404/', html: content('404.html') }],
    );
    const byPath = new Map(observed.map((document) => [document.path, document]));
    for (const registry of PAGES) {
      const document = byPath.get(registry.path)!;
      const canonical = new URL(registry.path, SITE.url).href;
      assert.equal(document.title, registry.title);
      assert.deepEqual(document.descriptions, [registry.description]);
      assert.deepEqual(document.canonical, [canonical]);
      assert.deepEqual(document.ogUrl, [canonical]);
      assert.equal(document.h1, 1, `${registry.path}: expected one h1`);
      assert.equal(
        new Set(document.ids).size,
        document.ids.length,
        `${registry.path}: repeated IDs`,
      );
      assert.equal(document.robots.length, 1);
      assert.ok(!document.robots[0]!.includes('noindex'));
      assert.deepEqual(document.ogImage, [new URL(SITE.image, SITE.url).href]);
      assert.deepEqual(document.ogWidth, ['1200']);
      assert.deepEqual(document.ogHeight, ['630']);
      assert.deepEqual(document.ogType, ['image/png']);
      assert.deepEqual(document.ogAlt, [SITE.imageAlt]);
      assert.deepEqual(document.twitterAlt, [SITE.imageAlt]);
      assert.deepEqual(document.alternate, [
        new URL(`/raw/${'source' in registry ? registry.source : 'index.md'}`, SITE.url).href,
      ]);
      assert.equal(document.structured.length, 1);
      const data: unknown = JSON.parse(document.structured[0]!);
      assert.ok(data !== null && typeof data === 'object');
      const entities: unknown[] =
        '@graph' in data && Array.isArray(data['@graph']) ? data['@graph'] : [data];
      const types = entities.map((entity) =>
        entity !== null && typeof entity === 'object' && '@type' in entity ? entity['@type'] : null,
      );
      assert.ok(JSON.stringify(data).includes(canonical));
      assert.equal(types.includes('WebSite'), registry.path === '/');
      if (registry.path !== '/') assert.ok(types.includes('WebPage'));
      assert.ok(!document.text.includes(`v${release.version} available`));
      if (registry.path.startsWith('/docs/')) {
        assert.ok(
          document.text.includes(
            release.state === 'published'
              ? `npm ${release.version}`
              : `Package ${release.version} · ${
                  release.state === 'unknown' ? 'availability unverified' : 'development preview'
                }`,
          ),
        );
      }
      if (release.state !== 'published') {
        assert.ok(!document.text.includes('npm install jg-plans'));
        assert.ok(
          !document.links.some((href) => href.startsWith('https://www.npmjs.com/package/jg-plans')),
        );
      }
      assert.equal(
        document.installCommand,
        release.state === 'published' && registry.path === '/'
          ? `npm install jg-plans@${release.version}`
          : null,
      );
      for (const href of [...document.links, ...document.assets]) {
        const target = new URL(href, canonical);
        if (target.origin !== SITE.url) continue;
        const targetDocument = byPath.get(target.pathname);
        if (targetDocument) {
          if (target.hash)
            assert.ok(
              targetDocument.ids.includes(decodeURIComponent(target.hash.slice(1))),
              `${registry.path}: missing fragment ${href}`,
            );
        } else
          assert.ok(
            files.has(decodeURIComponent(target.pathname.slice(1))),
            `${registry.path}: missing target ${href}`,
          );
      }
    }
    const missing = byPath.get('/404/')!;
    assert.deepEqual(missing.canonical, []);
    assert.ok(missing.robots[0]?.includes('noindex'));
    const sitemap = await page.evaluate((xml) => {
      const document = new DOMParser().parseFromString(xml, 'application/xml');
      return {
        errors: document.querySelectorAll('parsererror').length,
        urls: [...document.querySelectorAll('loc')].map((node) => node.textContent),
      };
    }, content('sitemap.xml'));
    assert.equal(sitemap.errors, 0);
    assert.deepEqual(
      sitemap.urls,
      PAGES.map((page) => new URL(page.path, SITE.url).href),
    );
    assert.ok(content('robots.txt').includes(`Sitemap: ${SITE.url}/sitemap.xml`));
    for (const registry of PAGES)
      assert.ok(content('llms.txt').includes(new URL(registry.path, SITE.url).href));
  } finally {
    await browser.close();
  }
  console.info(
    `Verified ${PAGES.length} canonical pages, downloads, and ${release.state} presentation for ${release.version}.`,
  );
};

if (isMainModule(import.meta.url)) await verifyBuild();
