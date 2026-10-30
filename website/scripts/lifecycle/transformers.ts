import type {
  IPlanCreation,
  IPlanInspection,
  IPlanUpdateResult,
  IPlanDocumentWriteResult,
} from 'jg-plans';

// public example paths replace only filesystem result fields, never document contents
const PUBLIC_DIRECTORY = 'jg-plans/search-feedback';

/**
 * Present a complete operation result with its runtime directory replaced by the public path.
 * @param result The actual public operation return.
 * @returns Every original field, with only directory substituted.
 */
export const presentDirectory = <
  T extends IPlanCreation | IPlanUpdateResult | IPlanDocumentWriteResult,
>(
  result: T,
): T => ({
  ...result,
  directory: PUBLIC_DIRECTORY,
});

/**
 * Present a complete inspection with only its directory and two document paths substituted.
 * @param result The actual public inspection return.
 * @returns Every original field, including complete parsed documents and diagnostics.
 */
export const presentInspection = (result: IPlanInspection): IPlanInspection => ({
  ...result,
  directory: PUBLIC_DIRECTORY,
  plan: { ...result.plan, path: `${PUBLIC_DIRECTORY}/plan.md` },
  milestones: { ...result.milestones, path: `${PUBLIC_DIRECTORY}/milestones.md` },
});
