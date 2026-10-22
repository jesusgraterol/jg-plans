import { defineErrorCatalog } from 'jg-exception';

/** Stable operational codes; document-format observations use diagnostic codes instead. */
export const ERRORS = {
  INVALID_INPUT: 'JG_PLANS_INVALID_INPUT',
  READ_FAILED: 'JG_PLANS_READ_FAILED',
  UNSUPPORTED_ENCODING: 'JG_PLANS_UNSUPPORTED_ENCODING',
  UNSAFE_EDIT: 'JG_PLANS_UNSAFE_EDIT',
  DESTINATION_EXISTS: 'JG_PLANS_DESTINATION_EXISTS',
  SOURCE_CHANGED: 'JG_PLANS_SOURCE_CHANGED',
  WRITE_FAILED: 'JG_PLANS_WRITE_FAILED',
  LOCK_BUSY: 'JG_PLANS_LOCK_BUSY',
  LOCK_FAILED: 'JG_PLANS_LOCK_FAILED',
} as const;

// Underlying errors may contain user paths or input snippets. Stable public messages
// omit that text; causes retain diagnostics, and safe details are explicit data.
export const planErrors = defineErrorCatalog({
  invalidInput: { code: ERRORS.INVALID_INPUT, message: 'Invalid jg-plans input' },
  readFailed: { code: ERRORS.READ_FAILED, message: 'The selected document could not be read' },
  unsupportedEncoding: {
    code: ERRORS.UNSUPPORTED_ENCODING,
    message: 'Document text is not valid UTF-8',
  },
  unsafeEdit: {
    code: ERRORS.UNSAFE_EDIT,
    message: 'The requested edit is unsupported or ambiguous',
  },
  destinationExists: {
    code: ERRORS.DESTINATION_EXISTS,
    message: 'The plan destination already exists',
  },
  sourceChanged: {
    code: ERRORS.SOURCE_CHANGED,
    message: 'The document changed before replacement',
  },
  writeFailed: { code: ERRORS.WRITE_FAILED, message: 'The plan document could not be written' },
  lockBusy: { code: ERRORS.LOCK_BUSY, message: 'The plan document is locked' },
  lockFailed: { code: ERRORS.LOCK_FAILED, message: 'The plan document lock operation failed' },
});
