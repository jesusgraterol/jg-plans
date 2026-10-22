import { z } from 'zod';

export const AvailabilitySchema = z
  .strictObject({
    state: z.enum(['preview', 'published', 'unknown']),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    reason: z.enum([
      'offline',
      'version-mismatch',
      'missing',
      'pending',
      'contents-differ',
      'registry-unavailable',
      'verified',
    ]),
  })
  .refine((value) => (value.state === 'published') === (value.reason === 'verified'));
export type IAvailability = z.infer<typeof AvailabilitySchema>;

export const SiteReleaseSchema = AvailabilitySchema.safeExtend({
  schemaVersion: z.literal(1),
  protocol: z.literal('0.1'),
  sourceCommit: z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .nullable(),
});

export const readAvailability = (input: string): IAvailability =>
  AvailabilitySchema.parse(JSON.parse(input));

export const availabilityMessage = (availability: IAvailability): string =>
  availability.state === 'published'
    ? `Package ${availability.version} is available. Protocol 0.1 remains provisional.`
    : availability.state === 'unknown'
      ? `Package ${availability.version} availability could not be verified. Protocol 0.1 and source examples remain usable.`
      : `Package ${availability.version} documentation is a development preview. Protocol 0.1 and source examples remain usable.`;
