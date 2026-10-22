import { createServer, type Server } from 'node:http';
import { gzipSync } from 'node:zlib';
import { hashValue } from 'jg-crypto';
import { expectToRejectCode } from 'jg-exception/testing';
import { Header } from 'tar';
import { afterEach, describe, expect, it } from 'vitest';

import { archiveIntegrity, payloadHashes } from './manifest.ts';
import { readProvenanceCommit } from './provenance.ts';
import { publishRelease } from './publish.ts';
import { observePublished, qualifyVersion, readLatest } from './registry.ts';
import type { IReleaseManifest } from './types.ts';

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve, reject) => {
      // Stop accepting connections before closing sockets, including stalled requests.
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
  }
});

const archive = (body = 'Original docs'): Buffer => {
  const blocks = Object.entries({
    'package/package.json': JSON.stringify({ name: 'jg-plans', version: '0.1.1' }),
    'package/README.md': body,
  });
  return gzipSync(
    Buffer.concat([
      ...blocks.flatMap(([path, content]) => {
        const bytes = Buffer.from(content),
          header = new Header({ path, type: 'File', size: bytes.length, mode: 0o644 });
        header.encode();
        return [header.block!, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512)];
      }),
      Buffer.alloc(1024),
    ]),
  );
};
const fixture = async () => {
  const bytes = archive();
  const manifest: IReleaseManifest = {
    schemaVersion: 1,
    name: 'jg-plans',
    version: '0.1.1',
    sourceCommit: 'a'.repeat(40),
    sourceDirty: false,
    archive: 'jg-plans-0.1.1.tgz',
    sha256: hashValue(bytes),
    integrity: archiveIntegrity(bytes),
    files: await payloadHashes(bytes),
  };
  const state = {
    packageExists: true,
    validMetadata: true,
    exists: true,
    tarball: true,
    bytes,
    latest: '0.1.1',
    status: 200,
    provenance: true,
    repository: 'https://github.com/jesusgraterol/jg-plans',
    requests: [] as string[],
    hold: false,
  };
  let registry = '';
  const server = createServer((request, response) => {
    state.requests.push(request.url!);
    if (state.hold) return;
    const send = (value: unknown, status = 200) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(value));
    };
    if (state.status !== 200) {
      send({}, state.status);
      return;
    }
    if (request.url === '/jg-plans') {
      if (!state.packageExists) {
        send({}, 404);
        return;
      }
      send({
        name: 'jg-plans',
        'dist-tags': { latest: state.latest },
        versions: {
          // Historical placeholders do not have to be valid release candidates.
          '0.0.0-stage': { description: 'An earlier staged placeholder' },
          ...(state.exists
            ? {
                '0.1.1': state.validMetadata
                  ? {
                      name: 'jg-plans',
                      version: '0.1.1',
                      dist: {
                        tarball: `${registry}/jg-plans/-/jg-plans-0.1.1.tgz`,
                        integrity: archiveIntegrity(state.bytes),
                        ...(state.provenance
                          ? {
                              attestations: {
                                url: `${registry}/-/npm/v1/attestations/jg-plans@0.1.1`,
                                provenance: { predicateType: 'https://slsa.dev/provenance/v1' },
                              },
                            }
                          : {}),
                      },
                    }
                  : null,
              }
            : {}),
        },
      });
      return;
    }
    if (request.url === '/jg-plans/-/jg-plans-0.1.1.tgz') {
      if (!state.tarball) {
        send({}, 404);
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      response.end(state.bytes);
      return;
    }
    if (request.url === '/-/npm/v1/attestations/jg-plans@0.1.1') {
      const statement = {
        predicateType: 'https://slsa.dev/provenance/v1',
        subject: [
          { name: 'pkg:npm/jg-plans@0.1.1', digest: { sha512: hashValue(state.bytes, 'sha512') } },
        ],
        predicate: {
          buildDefinition: {
            externalParameters: {
              workflow: {
                ref: 'refs/heads/main',
                repository: state.repository,
                path: '.github/workflows/check.yml',
              },
            },
            resolvedDependencies: [
              {
                uri: 'git+https://github.com/jesusgraterol/jg-plans@refs/heads/main',
                digest: { gitCommit: manifest.sourceCommit },
              },
            ],
          },
        },
      };
      send({
        attestations: [
          {
            predicateType: 'https://slsa.dev/provenance/v1',
            bundle: {
              dsseEnvelope: { payload: Buffer.from(JSON.stringify(statement)).toString('base64') },
            },
          },
        ],
      });
      return;
    }
    send({}, 404);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected an owned TCP server');
  registry = `http://127.0.0.1:${address.port}`;
  return { state, manifest, registry };
};

describe('real bounded registry observations', () => {
  it('requires matching downloadable payloads and distinguishes absence, propagation, and failure', async () => {
    const { state, manifest, registry } = await fixture();
    expect((await observePublished(manifest, { registry })).state).toBe('published');
    expect(await readLatest({ registry })).toBe(manifest.version);
    state.tarball = false;
    expect(await observePublished(manifest, { registry })).toEqual({
      state: 'pending',
      reason: 'tarball-unavailable',
    });
    state.exists = false;
    expect(await observePublished(manifest, { registry })).toEqual({ state: 'missing' });
    state.packageExists = false;
    expect(await observePublished(manifest, { registry })).toEqual({ state: 'missing' });
    expect(await readLatest({ registry })).toBeNull();
    state.packageExists = true;
    state.exists = true;
    state.validMetadata = false;
    await expectToRejectCode(
      observePublished(manifest, { registry }),
      'RELEASE_REGISTRY_UNAVAILABLE',
      'The registry could not be verified',
    );
    state.validMetadata = true;
    state.status = 503;
    await expectToRejectCode(
      observePublished(manifest, { registry }),
      'RELEASE_REGISTRY_UNAVAILABLE',
      'The registry could not be verified',
    );
    state.status = 200;
    state.exists = true;
    state.tarball = true;
    state.bytes = archive('Changed shipped docs');
    await expectToRejectCode(
      observePublished(manifest, { registry }),
      'RELEASE_CONTENTS_CHANGED',
      'Shipped contents changed without a new version',
    );
    state.bytes = Buffer.from('Not a package archive');
    await expectToRejectCode(
      observePublished(manifest, { registry }),
      'RELEASE_INTEGRITY_MISMATCH',
      'Release archive integrity does not match',
    );
  });

  it('rejects regressing versions and does not mistake a staged placeholder for a release', async () => {
    const { state, manifest, registry } = await fixture();
    state.exists = false;
    state.latest = '0.2.0';
    await expectToRejectCode(
      qualifyVersion(manifest, { registry }),
      'RELEASE_VERSION_NOT_HIGHER',
      'A new release version must be higher than the published latest version',
    );
    state.latest = '0.0.0-stage';
    expect((await qualifyVersion(manifest, { registry })).state).toBe('missing');
    state.latest = manifest.version;
    expect(await qualifyVersion(manifest, { registry })).toEqual({
      state: 'pending',
      reason: 'metadata-unavailable',
    });
  });

  it('checks the attested workflow, source identity and actual archive subject', async () => {
    const { state, manifest, registry } = await fixture();
    const observed = await observePublished(manifest, { registry });
    if (observed.state !== 'published') throw new Error('Expected published fixture');
    expect(await readProvenanceCommit(observed.metadata, observed.bytes, { registry })).toBe(
      manifest.sourceCommit,
    );
    state.repository = 'https://github.com/example/wrong';
    await expectToRejectCode(
      readProvenanceCommit(observed.metadata, observed.bytes, { registry }),
      'RELEASE_PROVENANCE_MISSING',
      'Release provenance does not identify the expected main workflow and archive',
    );
    state.repository = 'https://github.com/jesusgraterol/jg-plans';
    await expectToRejectCode(
      readProvenanceCommit(observed.metadata, archive('different'), { registry }),
      'RELEASE_PROVENANCE_MISSING',
    );
  });
});

describe('publication reconciliation', () => {
  it('does no registry or publication work when readiness is disabled', async () => {
    const { state, manifest, registry } = await fixture();
    const result = await publishRelease(manifest, {
      registry,
      ready: false,
      publish: async () => {
        throw new Error('Must not publish');
      },
      verifyProvenance: async () => {
        throw new Error('Must not verify');
      },
    });
    expect(result).toEqual({ state: 'disabled', version: '0.1.1' });
    expect(state.requests).toEqual([]);
  });

  it('skips an identical published identity only after provenance verification', async () => {
    const { manifest, registry } = await fixture();
    let verified = false;
    const result = await publishRelease(manifest, {
      registry,
      ready: true,
      publish: async () => {
        throw new Error('Must not publish');
      },
      verifyProvenance: async (metadata, bytes, signal) => {
        expect(await readProvenanceCommit(metadata, bytes, { registry, signal })).toBe(
          manifest.sourceCommit,
        );
        verified = true;
      },
    });
    expect(result.state).toBe('already-published');
    expect(verified).toBe(true);
  });

  it('reconciles an accepted publish whose response was lost, without repeating it', async () => {
    const { state, manifest, registry } = await fixture();
    state.exists = false;
    state.latest = '0.1.0';
    let attempts = 0;
    const result = await publishRelease(manifest, {
      registry,
      ready: true,
      timeoutMs: 2000,
      pollMs: 10,
      publish: async (signal) => {
        expect(signal.aborted).toBe(false);
        attempts++;
        state.exists = true;
        state.latest = '0.1.1';
        throw new Error('External publish response lost');
      },
      verifyProvenance: async (metadata, bytes, signal) => {
        await readProvenanceCommit(metadata, bytes, { registry, signal });
      },
    });
    expect(attempts).toBe(1);
    expect(result.state).toBe('published');
  });

  it('never republishes metadata awaiting its tarball and ends within its shared deadline', async () => {
    const { state, manifest, registry } = await fixture();
    state.tarball = false;
    let attempts = 0;
    await expectToRejectCode(
      publishRelease(manifest, {
        registry,
        ready: true,
        timeoutMs: 1000,
        pollMs: 10,
        publish: async () => {
          attempts++;
        },
        verifyProvenance: async () => {},
      }),
      'RELEASE_PUBLISH_FAILED',
      'Publication did not reach a verified public state; reconcile before retrying',
    );
    expect(attempts).toBe(0);
  });

  it('bounds a stalled registry request and refuses differing bytes before a publication attempt', async () => {
    const { state, manifest, registry } = await fixture();
    state.hold = true;
    await expectToRejectCode(
      observePublished(manifest, { registry, signal: AbortSignal.timeout(100) }),
      'RELEASE_REGISTRY_UNAVAILABLE',
    );
    state.hold = false;
    state.bytes = archive('Different docs');
    let attempts = 0;
    await expectToRejectCode(
      publishRelease(manifest, {
        registry,
        ready: true,
        publish: async () => {
          attempts++;
        },
        verifyProvenance: async () => {},
      }),
      'RELEASE_CONTENTS_CHANGED',
    );
    expect(attempts).toBe(0);
  });
});
