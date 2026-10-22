import { hashValue } from 'jg-crypto';
import { request } from 'jg-fetch';

import { ARCHIVE_LIMITS } from '../package/index.ts';

import { REGISTRY, releaseErrors } from './constants.ts';
import { archiveIntegrity, payloadHashes, samePayload } from './manifest.ts';
import {
  RegistryVersionSchema,
  RegistryPackageSchema,
  type IPublishedObservation,
  type IRegistryOptions,
  type IReleaseManifest,
} from './types.ts';

const requestOptions = (options: IRegistryOptions) => ({
  timeoutSeconds: 20,
  retryDelaysSeconds: [],
  init: { redirect: 'error' as const },
  ...(options.signal ? { signal: options.signal } : {}),
});

// The full package record contains versions and tags, including when the selected version is absent.
const readPackage = async (options: IRegistryOptions) => {
  const result = await request(`${options.registry ?? REGISTRY}/jg-plans`, {
    ...requestOptions(options),
    maxResponseBytes: 1024 * 1024,
    schema: RegistryPackageSchema,
  });
  if (result.error) {
    if (result.error.status === 404) return null;
    throw releaseErrors.create('registryUnavailable', { cause: result.error });
  }
  return result.data;
};

/**
 * Distinguish confirmed absence, metadata-before-tarball propagation, and unavailable registry evidence.
 * @throws
 * - RELEASE_REGISTRY_UNAVAILABLE: The registry could not be verified
 * - RELEASE_INTEGRITY_MISMATCH: Release archive integrity does not match
 * - RELEASE_CONTENTS_CHANGED: Shipped contents changed without a new version
 */
export const observePublished = async (
  manifest: IReleaseManifest,
  options: IRegistryOptions = {},
): Promise<IPublishedObservation> => {
  const registry = options.registry ?? REGISTRY;
  const packument = await readPackage(options);
  if (packument === null || !Object.hasOwn(packument.versions, manifest.version))
    return { state: 'missing' };
  const parsed = RegistryVersionSchema.safeParse(packument.versions[manifest.version]);
  if (!parsed.success) throw releaseErrors.create('registryUnavailable');
  const metadata = parsed.data;
  if (
    metadata.version !== manifest.version ||
    metadata.dist.tarball !== `${registry}/jg-plans/-/jg-plans-${manifest.version}.tgz`
  )
    throw releaseErrors.create('registryUnavailable');
  const archive = await request(metadata.dist.tarball, {
    ...requestOptions(options),
    parseAs: 'bytes',
    maxResponseBytes: ARCHIVE_LIMITS.compressedBytes,
  });
  if (archive.error) {
    if (archive.error.status === 404) return { state: 'pending', reason: 'tarball-unavailable' };
    throw releaseErrors.create('registryUnavailable', { cause: archive.error });
  }
  if (archiveIntegrity(archive.data) !== metadata.dist.integrity)
    throw releaseErrors.create('integrityMismatch');
  const published = await payloadHashes(archive.data);
  if (!samePayload(published, manifest.files)) throw releaseErrors.create('contentsChanged');
  return { state: 'published', metadata, bytes: archive.data };
};

/**
 * Registry latest is independent of version metadata; a stage placeholder is never accepted.
 * @throws
 * - RELEASE_REGISTRY_UNAVAILABLE: The registry could not be verified
 */
export const readLatest = async (options: IRegistryOptions = {}): Promise<string | null> => {
  const packument = await readPackage(options);
  return packument?.['dist-tags'].latest ?? null;
};

/** Compare stable numeric versions without floating-point rounding. */
export const compareVersions = (left: string, right: string): number => {
  const a = left.split('.').map(BigInt),
    b = right.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]! ? 1 : -1;
  return 0;
};

/**
 * An already published identity may be reused only with the exact same shipped paths and bytes.
 * @throws
 * - RELEASE_REGISTRY_UNAVAILABLE: The registry could not be verified
 * - RELEASE_INTEGRITY_MISMATCH: Release archive integrity does not match
 * - RELEASE_CONTENTS_CHANGED: Shipped contents changed without a new version
 * - RELEASE_VERSION_NOT_HIGHER: A new release version must be higher than the published latest version
 */
export const qualifyVersion = async (
  manifest: IReleaseManifest,
  options: IRegistryOptions = {},
): Promise<IPublishedObservation> => {
  const observed = await observePublished(manifest, options);
  const latest = await readLatest(options);
  if (latest && latest !== '0.0.0-stage') {
    const parsed = /^\d+\.\d+\.\d+$/.test(latest);
    if (!parsed) throw releaseErrors.create('registryUnavailable');
    if (compareVersions(manifest.version, latest) < 0)
      throw releaseErrors.create('versionNotHigher');
    if (observed.state === 'missing' && latest === manifest.version)
      return { state: 'pending', reason: 'metadata-unavailable' };
  }
  return observed;
};

/** SHA-512 subject digest used by npm's provenance statement. */
export const subjectDigest = (bytes: Uint8Array): string => hashValue(bytes, 'sha512');
