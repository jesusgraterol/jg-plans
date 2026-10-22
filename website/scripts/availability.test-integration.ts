import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { readBoundedFile } from 'jg-fs';
import { resolvePackageManagerCommand, runProcess } from 'jg-process';
import { expect, it } from 'vitest';

import manifest from '../../package.json' with { type: 'json' };
import { packPackage } from '../../scripts/package/index.ts';
import { archiveIntegrity } from '../../scripts/release/index.ts';
import { verifyAvailability } from './availability.ts';
import { verifyBuild } from './verify-build.ts';

it(
  'verifies actual registry payloads and builds honest release and unknown artifacts',
  { timeout: 120_000 },
  async ({ signal }) => {
    // Astro renames prerendered assets from .astro, so keep owned outputs on that filesystem.
    const parent = resolve(import.meta.dirname, '../.astro');
    await mkdir(parent, { recursive: true });
    const root = await mkdtemp(join(parent, 'jg-plans-availability-'));
    let origin = '';
    const state: {
      status: number;
      exists: boolean;
      tarball: boolean;
      bytes: Buffer;
      requests: number;
    } = { status: 200, exists: true, tarball: true, bytes: Buffer.alloc(0), requests: 0 };
    const server = createServer((request, response) => {
      state.requests++;
      if (state.status !== 200) {
        response.writeHead(state.status);
        response.end('{}');
        return;
      }
      if (request.url === '/jg-plans') {
        response.setHeader('Content-Type', 'application/json');
        response.end(
          JSON.stringify({
            name: 'jg-plans',
            'dist-tags': { latest: manifest.version },
            versions: state.exists
              ? {
                  [manifest.version]: {
                    name: 'jg-plans',
                    version: manifest.version,
                    dist: {
                      tarball: `${origin}/jg-plans/-/jg-plans-${manifest.version}.tgz`,
                      integrity: archiveIntegrity(state.bytes),
                    },
                  },
                }
              : {},
          }),
        );
      } else if (request.url === `/jg-plans/-/jg-plans-${manifest.version}.tgz`) {
        response.writeHead(state.tarball ? 200 : 404);
        response.end(state.tarball ? state.bytes : Buffer.from('{}'));
      } else {
        response.writeHead(404);
        response.end('{}');
      }
    });
    try {
      const packed = await packPackage(root, signal);
      const original = await readBoundedFile(packed, 8 * 1024 * 1024);
      state.bytes = original;
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected an owned TCP server');
      origin = `http://127.0.0.1:${address.port}`;
      const options = { registry: origin, signal };
      expect((await verifyAvailability(undefined, options)).reason).toBe('offline');
      expect((await verifyAvailability('999.0.0', options)).reason).toBe('version-mismatch');
      expect(state.requests).toBe(0);
      state.exists = false;
      expect((await verifyAvailability(manifest.version, options)).reason).toBe('missing');
      state.exists = true;
      state.tarball = false;
      expect((await verifyAvailability(manifest.version, options)).reason).toBe('pending');
      state.tarball = true;
      const changed = gunzipSync(original, { maxOutputLength: 16 * 1024 * 1024 });
      const offset = changed.indexOf(Buffer.from('A compact planning protocol'));
      expect(offset).toBeGreaterThan(0);
      changed[offset] = 'B'.charCodeAt(0);
      state.bytes = gzipSync(changed);
      expect((await verifyAvailability(manifest.version, options)).reason).toBe('contents-differ');
      state.bytes = original;
      const published = await verifyAvailability(manifest.version, options);
      expect(published).toEqual({
        state: 'published',
        version: manifest.version,
        reason: 'verified',
      });
      state.status = 503;
      const unknown = await verifyAvailability(manifest.version, options);
      expect(unknown).toEqual({
        state: 'unknown',
        version: manifest.version,
        reason: 'registry-unavailable',
      });
      for (const availability of [published, unknown]) {
        const directory = join(root, availability.state);
        const build = await runProcess({
          ...resolvePackageManagerCommand(['exec', 'astro', 'build', '--outDir', directory], {
            cwd: resolve(import.meta.dirname, '..'),
            packageManager: 'pnpm',
          }),
          cwd: resolve(import.meta.dirname, '..'),
          timeoutSeconds: 60,
          maxOutputBytes: 2 * 1024 * 1024,
          signal,
          env: { ...process.env, JG_PLANS_VERIFIED_AVAILABILITY: JSON.stringify(availability) },
        });
        expect(build.exitCode, build.stderr).toBe(0);
        await verifyBuild(directory);
        const raw = (
          await readBoundedFile(join(directory, 'raw/api/README.md'), 1024 * 1024)
        ).toString('utf8');
        expect(
          raw.startsWith(
            availability.state === 'published' ? 'Verified package release' : 'Development preview',
          ),
        ).toBe(true);
      }
    } finally {
      try {
        if (server.listening)
          await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
            server.closeAllConnections();
          });
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  },
);
