import { z } from 'zod';

import { ErrorCodeDeclarationSchema, ProtocolVersionSchema } from '../protocol/index.ts';

/** One plan's identity, state, and error code declarations, as findErrorCodeOverlaps reads them. */
export const OverlapPlanSchema = z.strictObject({
  directory: z.string(),
  id: z.string().nullable(),
  protocol: ProtocolVersionSchema,
  status: z.string().nullable(),
  errorCodes: z.array(ErrorCodeDeclarationSchema),
});

export type IOverlapPlan = z.infer<typeof OverlapPlanSchema>;

// a distinct participating plan, without duplicating its complete declarations
export type IOverlapPlanReference = {
  directory: string;
  id: string | null;
};

/**
 * One canonical string code claimed by distinct active plans in one repository and registry.
 * An overlap is an observation; it grants nothing.
 */
export type IErrorCodeOverlap = {
  repository: string;
  registry: string;
  code: string;
  plans: IOverlapPlanReference[];
};
