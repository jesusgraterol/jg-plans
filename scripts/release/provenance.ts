import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'jg-fetch';
import { resolvePackageManagerCommand, runProcess } from 'jg-process';

import { packageRoot } from '../package/index.ts';

import { REGISTRY, releaseErrors } from './constants.ts';
import { subjectDigest } from './registry.ts';
import {
  AttestationsSchema,
  ProvenanceStatementSchema,
  type IRegistryOptions,
  type IRegistryVersion,
} from './types.ts';

/**
 * Check provenance identity/digest; npm audit signatures supplies cryptographic verification separately.
 * @throws
 * - RELEASE_PROVENANCE_MISSING: Release provenance does not identify the expected main workflow and archive
 */
export const readProvenanceCommit = async (
  metadata: IRegistryVersion,
  bytes: Uint8Array,
  options: IRegistryOptions = {},
): Promise<string> => {
  const registry = options.registry ?? REGISTRY;
  const endpoint = `${registry}/-/npm/v1/attestations/jg-plans@${metadata.version}`;
  if (
    metadata.dist.attestations?.url !== endpoint ||
    metadata.dist.attestations.provenance?.predicateType !== 'https://slsa.dev/provenance/v1'
  )
    throw releaseErrors.create('provenanceMissing');
  const result = await request(endpoint, {
    schema: AttestationsSchema,
    timeoutSeconds: 20,
    retryDelaysSeconds: [],
    maxResponseBytes: 4 * 1024 * 1024,
    init: { redirect: 'error' },
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (result.error) throw releaseErrors.create('provenanceMissing', { cause: result.error });
  const attestation = result.data.attestations.filter(
    (item) => item.predicateType === 'https://slsa.dev/provenance/v1',
  );
  if (attestation.length !== 1) throw releaseErrors.create('provenanceMissing');
  let raw: unknown;
  try {
    raw = JSON.parse(
      Buffer.from(attestation[0]!.bundle.dsseEnvelope.payload, 'base64').toString('utf8'),
    );
  } catch {
    throw releaseErrors.create('provenanceMissing');
  }
  const parsed = ProvenanceStatementSchema.safeParse(raw);
  if (!parsed.success) throw releaseErrors.create('provenanceMissing');
  const statement = parsed.data;
  if (
    !statement.subject.some(
      (item) =>
        item.name === `pkg:npm/jg-plans@${metadata.version}` &&
        item.digest.sha512 === subjectDigest(bytes),
    )
  )
    throw releaseErrors.create('provenanceMissing');
  const dependencies = statement.predicate.buildDefinition.resolvedDependencies.filter(
    (item) => item.uri === 'git+https://github.com/jesusgraterol/jg-plans@refs/heads/main',
  );
  if (dependencies.length !== 1) throw releaseErrors.create('provenanceMissing');
  return dependencies[0]!.digest.gitCommit;
};

/**
 * Verify the published source ancestry and registry/attestation signatures in an isolated npm install.
 * @throws
 * - RELEASE_PROVENANCE_MISSING: Release provenance does not identify the expected main workflow and archive
 */
export const verifyRegistryProvenance = async (
  metadata: IRegistryVersion,
  bytes: Uint8Array,
  sourceCommit: string,
  signal: AbortSignal,
): Promise<void> => {
  const publishedCommit = await readProvenanceCommit(metadata, bytes, { signal });
  // Identical bytes may have been published by an earlier main commit before a website-only change.
  const ancestry = await runProcess({
    command: 'git',
    args: ['merge-base', '--is-ancestor', publishedCommit, sourceCommit],
    cwd: packageRoot,
    signal,
    timeoutSeconds: 30,
    maxOutputBytes: 1024 * 1024,
  });
  if (ancestry.exitCode !== 0) throw releaseErrors.create('provenanceMissing');
  const directory = await mkdtemp(join(tmpdir(), 'jg-plans-provenance-'));
  try {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          !['npm_config_userconfig', 'npm_config_cache', 'node_auth_token', 'npm_token'].includes(
            key.toLowerCase(),
          ),
      ),
    );
    env.NPM_CONFIG_USERCONFIG = join(directory, 'empty.npmrc');
    env.NPM_CONFIG_CACHE = join(directory, 'npm-cache');
    await writeFile(env.NPM_CONFIG_USERCONFIG, '', { mode: 0o600 });
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({ name: 'jg-plans-signature-check', private: true }),
    );
    for (const args of [
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--save-exact',
        `jg-plans@${metadata.version}`,
      ],
      ['audit', 'signatures'],
    ]) {
      const result = await runProcess({
        ...resolvePackageManagerCommand(args, { packageManager: 'npm', cwd: directory }),
        cwd: directory,
        env,
        signal,
        timeoutSeconds: 120,
        maxOutputBytes: 1024 * 1024,
      });
      if (result.exitCode !== 0)
        throw releaseErrors.create('provenanceMissing', { data: { step: args[0] } });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
