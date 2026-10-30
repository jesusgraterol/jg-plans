import { z } from 'zod';

import {
  ErrorCodeRangeSchema,
  ProtocolVersionSchema,
  type IErrorCodeRange,
} from '../protocol/index.ts';

/** One plan's identity, state, and error code declarations, as findErrorCodeOverlaps reads them. */
export const OverlapPlanSchema = z.strictObject({
  directory: z.string(),
  id: z.string().nullable(),
  protocol: ProtocolVersionSchema,
  status: z.string().nullable(),
  errorCodes: z.array(ErrorCodeRangeSchema),
});

export type IOverlapPlan = z.infer<typeof OverlapPlanSchema>;

// one plan's declaration inside an overlap group
export type IOverlapDeclaration = {
  directory: string;
  id: string | null;
  entry: IErrorCodeRange;
};

/**
 * A maximal run of declarations from at least two plans whose ranges chain together by
 * intersection in one registry of one repository. `first` and `last` span the run. An overlap is
 * an observation; it grants nothing.
 */
export type IErrorCodeOverlap = {
  repository: string;
  registry: string;
  first: number;
  last: number;
  plans: IOverlapDeclaration[];
};
