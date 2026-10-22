import { defineErrorCatalog } from 'jg-exception';

export const REGISTRY = 'https://registry.npmjs.org';
// Registry propagation can lag metadata. All requests, attempts and waits share this budget.
export const PUBLICATION_TIMEOUT_MS = 15 * 60 * 1000;
export const PUBLICATION_POLL_MS = 10 * 1000;

export const releaseErrors = defineErrorCatalog({
  invalidInput: { code: 'RELEASE_INVALID_INPUT', message: 'Invalid release input' },
  sourceMismatch: {
    code: 'RELEASE_SOURCE_MISMATCH',
    message: 'Release source identity does not match the qualified archive',
  },
  contentsChanged: {
    code: 'RELEASE_CONTENTS_CHANGED',
    message: 'Shipped contents changed without a new version',
  },
  integrityMismatch: {
    code: 'RELEASE_INTEGRITY_MISMATCH',
    message: 'Release archive integrity does not match',
  },
  registryUnavailable: {
    code: 'RELEASE_REGISTRY_UNAVAILABLE',
    message: 'The registry could not be verified',
  },
  notPublished: {
    code: 'RELEASE_NOT_PUBLISHED',
    message: 'The qualified release is not publicly downloadable',
  },
  versionNotHigher: {
    code: 'RELEASE_VERSION_NOT_HIGHER',
    message: 'A new release version must be higher than the published latest version',
  },
  publishFailed: {
    code: 'RELEASE_PUBLISH_FAILED',
    message: 'Publication did not reach a verified public state; reconcile before retrying',
  },
  provenanceMissing: {
    code: 'RELEASE_PROVENANCE_MISSING',
    message: 'Release provenance does not identify the expected main workflow and archive',
  },
});
