import { defineErrorCatalog } from 'jg-exception';

/** Stable operational codes; document-format observations use diagnostic codes instead. */
export const ERRORS = {
  INVALID_INPUT: 'JG_PLANS_INVALID_INPUT',
  READ_FAILED: 'JG_PLANS_READ_FAILED',
} as const;

export const planErrors = defineErrorCatalog({
  invalidInput: { code: ERRORS.INVALID_INPUT, message: 'Invalid jg-plans input' },
  readFailed: { code: ERRORS.READ_FAILED, message: 'The selected document could not be read' },
});
