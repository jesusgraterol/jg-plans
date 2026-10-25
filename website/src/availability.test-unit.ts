import { expect, it } from 'vitest';

import { availabilityMessage, AvailabilitySchema, SiteReleaseSchema } from './availability.ts';

it('reserves release presentation for verified evidence and keeps unknown distinct from absence', () => {
  expect(
    AvailabilitySchema.safeParse({ state: 'published', version: '0.1.2', reason: 'offline' })
      .success,
  ).toBe(false);
  expect(
    AvailabilitySchema.safeParse({ state: 'preview', version: '0.1.2', reason: 'verified' })
      .success,
  ).toBe(false);
  expect(
    availabilityMessage({ state: 'unknown', version: '0.1.2', reason: 'registry-unavailable' }),
  ).toContain('could not be verified');
  expect(availabilityMessage({ state: 'preview', version: '0.1.2', reason: 'missing' })).toContain(
    'development preview',
  );
  expect(
    SiteReleaseSchema.safeParse({
      schemaVersion: 1,
      protocol: '0.2',
      state: 'published',
      version: '0.1.2',
      reason: 'verified',
      sourceCommit: 'a'.repeat(40),
    }).success,
  ).toBe(true);
});
