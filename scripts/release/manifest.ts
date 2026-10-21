import { writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { hashValue } from 'jg-crypto';
import { readBoundedFile } from 'jg-fs';
import { runProcess } from 'jg-process';

import { ARCHIVE_LIMITS, inspectPackageArchive, packageRoot } from '../package/index.ts';

import { releaseErrors } from './constants.ts';
import { PackageIdentitySchema, ReleaseManifestSchema, type IReleaseManifest } from './types.ts';

const parseReleaseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw releaseErrors.create('invalidInput');
  }
};

const readPayload = async (bytes: Uint8Array): Promise<Map<string, Buffer>> => {
  try {
    return await inspectPackageArchive(bytes);
  } catch (cause) {
    throw releaseErrors.create('integrityMismatch', { cause });
  }
};
const hashPayload = (payload: Map<string, Buffer>): Record<string, string> =>
  Object.fromEntries([...payload].map(([path, content]) => [path, hashValue(content)]));

const packageIdentity = (payload: Map<string, Buffer>) => {
  const file = payload.get('package.json');
  if (!file) throw releaseErrors.create('invalidInput');
  const parsed = PackageIdentitySchema.safeParse(parseReleaseJson(file.toString('utf8')));
  if (!parsed.success) throw releaseErrors.create('invalidInput');
  return parsed.data;
};

/**
 * Hash the actual payload, so documentation and example changes affect release identity.
 * @throws
 * - RELEASE_INTEGRITY_MISMATCH: Release archive integrity does not match
 */
export const payloadHashes = async (bytes: Uint8Array): Promise<Record<string, string>> =>
  hashPayload(await readPayload(bytes));

/** Compare complete shipped path sets and each content digest, independent of entry order. */
export const samePayload = (left: Record<string, string>, right: Record<string, string>): boolean =>
  Object.keys(left).length === Object.keys(right).length &&
  Object.entries(left).every(([path, hash]) => Object.hasOwn(right, path) && right[path] === hash);

export const archiveIntegrity = (bytes: Uint8Array): string =>
  `sha512-${Buffer.from(hashValue(bytes, 'sha512'), 'hex').toString('base64')}`;

/**
 * Record source identity only after the caller verifies the exact retained archive.
 * @throws
 * - RELEASE_INVALID_INPUT: Invalid release input
 * - RELEASE_SOURCE_MISMATCH: Release source identity does not match the qualified archive
 * - RELEASE_INTEGRITY_MISMATCH: Release archive integrity does not match
 */
export const writeReleaseManifest = async (
  archive: string,
  signal?: AbortSignal,
): Promise<IReleaseManifest> => {
  const bytes = await readBoundedFile(archive, ARCHIVE_LIMITS.compressedBytes);
  const payload = await readPayload(bytes);
  const identity = packageIdentity(payload);
  const git = async (args: string[]): Promise<string> => {
    const result = await runProcess({
      command: 'git',
      args,
      cwd: packageRoot,
      timeoutSeconds: 30,
      maxOutputBytes: 1024 * 1024,
      ...(signal ? { signal } : {}),
    });
    if (result.exitCode !== 0) throw releaseErrors.create('sourceMismatch');
    return result.stdout.trim();
  };
  const manifest = ReleaseManifestSchema.parse({
    schemaVersion: 1,
    ...identity,
    sourceCommit: await git(['rev-parse', 'HEAD']),
    sourceDirty: Boolean(await git(['status', '--porcelain', '--untracked-files=all'])),
    archive: basename(archive),
    sha256: hashValue(bytes),
    integrity: archiveIntegrity(bytes),
    files: hashPayload(payload),
  });
  await writeFile(
    join(dirname(archive), 'release-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
};

/**
 * Validate a transferred receipt and archive without rebuilding or trusting its file hashes.
 * @throws
 * - RELEASE_INVALID_INPUT: Invalid release input
 * - RELEASE_INTEGRITY_MISMATCH: Release archive integrity does not match
 */
export const readRelease = async (
  directory: string,
): Promise<{ manifest: IReleaseManifest; archive: string; bytes: Uint8Array }> => {
  const parsed = ReleaseManifestSchema.safeParse(
    parseReleaseJson(
      (await readBoundedFile(join(directory, 'release-manifest.json'), 1024 * 1024)).toString(
        'utf8',
      ),
    ),
  );
  if (!parsed.success) throw releaseErrors.create('invalidInput');
  const manifest = parsed.data;
  if (manifest.archive !== `jg-plans-${manifest.version}.tgz`)
    throw releaseErrors.create('invalidInput');
  const archive = join(directory, manifest.archive);
  const bytes = await readBoundedFile(archive, ARCHIVE_LIMITS.compressedBytes);
  if (hashValue(bytes) !== manifest.sha256 || archiveIntegrity(bytes) !== manifest.integrity)
    throw releaseErrors.create('integrityMismatch');
  const payload = await readPayload(bytes);
  const hashes = hashPayload(payload);
  if (!samePayload(hashes, manifest.files)) throw releaseErrors.create('integrityMismatch');
  const identity = packageIdentity(payload);
  if (identity.version !== manifest.version) throw releaseErrors.create('integrityMismatch');
  return { manifest, archive, bytes };
};
