import { join } from 'node:path';
import { getErrorCode, isException } from 'jg-exception';
import { readBoundedFile } from 'jg-fs';
import { readStdin } from 'jg-process';
import { z } from 'zod';

import { checkPlan } from '../documents/index.ts';
import { decodeSource } from '../edits/index.ts';
import { planErrors } from '../errors/index.ts';
import {
  createPlan,
  inspectPlan,
  updatePlan,
  writePlanDocument,
  removeMilestones,
  type IPlanInspection,
} from '../files/index.ts';
import {
  CreatePlanOptionsSchema,
  DEFAULT_MAX_BYTES,
  PlanUpdateSchema,
  PlanDocumentWriteSchema,
  RemoveMilestonesSchema,
  type IDiagnostic,
} from '../protocol/index.ts';

import { parseArguments } from './arguments.ts';

const HELP = `jg-plans — read and edit Markdown plans without enforcing a workflow

Commands:
  inspect --directory <path> [--fingerprint-exclude <JSON-array>] [--include-body] [--json] [--max-bytes <bytes>]
  check   --directory <path> [--json] [--max-bytes <bytes>]
  create  --slug <slug> --input <file-or-dash> [--root <path>] [--json] [--max-bytes <bytes>]
  update  --directory <path> --input <file-or-dash> [--json] [--max-bytes <bytes>]
  write   --directory <path> --input <file-or-dash> [--json] [--max-bytes <bytes>]
  remove-milestones --directory <path> --input <file-or-dash> [--json] [--max-bytes <bytes>]
  --help, -h
  --version, -v

Only the selected plan.md and optional milestones.md are read.
The default bound is 1048576 bytes per file. Checks are optional.
Mutations share local document locks. Busy owners require explicit recovery. No history is required.
Exit 0: completed inspection, successful mutation, or conforming check; 1: conformance errors;
2: invalid command or operational failure. Missing files do not imply completion.`;

const projectInspection = (inspection: IPlanInspection, includeBody: boolean): object => {
  const plan = inspection.plan;
  const milestones = inspection.milestones;
  const planValue = plan.state === 'readable' ? plan.value : undefined;
  const milestoneValue = milestones.state === 'readable' ? milestones.value : undefined;
  return {
    directory: inspection.directory,
    ...(inspection.fingerprint ? { fingerprint: inspection.fingerprint } : {}),
    plan: {
      state: plan.state,
      path: plan.path,
      ...(planValue
        ? {
            metadata: planValue.metadata,
            sha256: plan.state === 'readable' ? plan.sha256 : undefined,
            rawMetadata: planValue.rawMetadata,
            frontmatter: planValue.frontmatter,
            preamble: planValue.preamble,
            sections: planValue.sections,
            protocol: planValue.protocol,
            criteria: planValue.criteria,
            ...(includeBody ? { source: planValue.source, body: planValue.body } : {}),
          }
        : {}),
    },
    milestones: {
      state: milestones.state,
      path: milestones.path,
      ...(milestoneValue
        ? {
            overview: milestoneValue.overview,
            sha256: milestones.state === 'readable' ? milestones.sha256 : undefined,
            rawMetadata: milestoneValue.rawMetadata,
            frontmatter: milestoneValue.frontmatter,
            preamble: milestoneValue.preamble,
            sections: milestoneValue.sections,
            overviewTables: milestoneValue.overviewTables,
            overviewPresent: milestoneValue.overviewPresent,
            milestones: milestoneValue.milestones.map(({ body, ...entry }) => ({
              ...entry,
              ...(includeBody ? { body } : {}),
            })),
            ...(includeBody ? { source: milestoneValue.source, body: milestoneValue.body } : {}),
          }
        : {}),
    },
    // the envelope already carries the criteria diagnostics
    criteria: inspection.criteria
      ? { protocol: inspection.criteria.protocol, criteria: inspection.criteria.criteria }
      : null,
  };
};

const readMutationInput = async (input: string, maxBytes: number): Promise<unknown> => {
  let bytes: Uint8Array;
  try {
    bytes = input === '-' ? await readStdin({ maxBytes }) : await readBoundedFile(input, maxBytes);
  } catch (cause) {
    const reason = getErrorCode(cause);
    throw planErrors.create('readFailed', { cause, ...(reason ? { data: { reason } } : {}) });
  }
  let text: string;
  try {
    text = decodeSource(bytes);
  } catch {
    throw planErrors.create('unsupportedEncoding');
  }
  try {
    return JSON.parse(text.replace(/^\uFEFF/, '')) as unknown;
  } catch {
    // JSON syntax errors may contain input snippets; keep those unsafe causes out of errors.
    throw planErrors.create('invalidInput');
  }
};

/** CLI entry only: public package imports never load or run this module. */
export const runCli = async (args: string[]): Promise<number> => {
  let json = args.includes('--json');
  let command = args[0] ?? 'help';
  try {
    const options = parseArguments(args);
    json = options.json;
    command = options.command;
    let data: object;
    let diagnostics: IDiagnostic[] = [];
    let error: { code: string; message: string; data?: unknown } | null = null;
    let exitCode = 0;
    if (options.command === 'help') data = { help: HELP };
    else if (options.command === 'version') {
      const raw: unknown = JSON.parse(
        (
          await readBoundedFile(join(import.meta.dirname, '../../package.json'), 1024 * 1024)
        ).toString('utf8'),
      );
      const manifest = z.object({ version: z.string() }).safeParse(raw);
      if (!manifest.success) throw planErrors.create('readFailed');
      data = { version: manifest.data.version };
    } else if (options.command === 'create') {
      const raw = await readMutationInput(options.input!, options.maxBytes ?? DEFAULT_MAX_BYTES);
      const parsed = CreatePlanOptionsSchema.omit({ slug: true, root: true }).safeParse(raw);
      if (!parsed.success) throw planErrors.create('invalidInput');
      const result = await createPlan({
        ...parsed.data,
        slug: options.slug!,
        ...(options.root ? { root: options.root } : {}),
      });
      diagnostics = result.diagnostics;
      data = {
        directory: result.directory,
        plan: {
          sha256: result.plan.sha256,
          metadata: result.plan.metadata,
          rawMetadata: result.plan.rawMetadata,
        },
        milestones: result.milestones
          ? {
              sha256: result.milestones.sha256,
              milestones: result.milestones.milestones.map((entry) => ({
                ordinal: entry.ordinal,
                ordinalText: entry.ordinalText,
                title: entry.title,
                id: entry.id,
                status: entry.status,
                location: entry.location,
              })),
            }
          : null,
      };
    } else if (options.command === 'update') {
      const raw = await readMutationInput(options.input!, options.maxBytes ?? DEFAULT_MAX_BYTES);
      const parsed = PlanUpdateSchema.safeParse(raw);
      if (!parsed.success) throw planErrors.create('invalidInput');
      const result = await updatePlan(
        options.directory!,
        parsed.data,
        options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes },
      );
      diagnostics = result.diagnostics;
      data = {
        directory: result.directory,
        document: result.document,
        changed: result.changed,
        sha256: result.sha256,
        ...('assignedMilestoneIds' in result
          ? { assignedMilestoneIds: result.assignedMilestoneIds }
          : {}),
      };
    } else if (options.command === 'write' || options.command === 'remove-milestones') {
      const raw = await readMutationInput(options.input!, options.maxBytes ?? DEFAULT_MAX_BYTES);
      const readOptions = options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes };
      let result;
      if (options.command === 'write') {
        const parsed = PlanDocumentWriteSchema.safeParse(raw);
        if (!parsed.success) throw planErrors.create('invalidInput');
        result = await writePlanDocument(options.directory!, parsed.data, readOptions);
      } else {
        const parsed = RemoveMilestonesSchema.safeParse(raw);
        if (!parsed.success) throw planErrors.create('invalidInput');
        result = await removeMilestones(options.directory!, parsed.data, readOptions);
      }
      diagnostics = result.diagnostics;
      data = {
        directory: result.directory,
        document: result.document,
        changed: result.changed,
        sha256: result.sha256,
        ...('assignedMilestoneIds' in result
          ? { assignedMilestoneIds: result.assignedMilestoneIds }
          : {}),
      };
    } else {
      const inspection = await inspectPlan(options.directory!, {
        ...(options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
        ...(options.fingerprint ? { fingerprint: options.fingerprint } : {}),
      });
      diagnostics = inspection.diagnostics;
      const operationalFailure = diagnostics.some(
        (item) => item.code === 'UNREADABLE_DOCUMENT' || item.code === 'FILE_TOO_LARGE',
      );
      if (options.command === 'check') {
        if (
          inspection.plan.state !== 'unreadable' &&
          inspection.milestones.state !== 'unreadable'
        ) {
          diagnostics = checkPlan({
            ...(inspection.plan.state === 'readable' ? { plan: inspection.plan.value.source } : {}),
            ...(inspection.milestones.state === 'readable'
              ? { milestones: inspection.milestones.value.source }
              : {}),
          }).diagnostics;
        }
        const conforms = !diagnostics.some((item) => item.severity === 'error');
        data = { ...projectInspection(inspection, false), conforms };
        exitCode = conforms ? 0 : 1;
      } else data = projectInspection(inspection, options.includeBody);
      if (operationalFailure) {
        const failure = planErrors.create('readFailed');
        error = { code: failure.code, message: failure.message };
        exitCode = 2;
      }
    }
    if (json) console.log(JSON.stringify({ schemaVersion: 1, command, data, diagnostics, error }));
    else {
      if ('help' in data) console.log(data.help);
      else if ('version' in data) console.log(data.version);
      else console.log(JSON.stringify(data, null, 2));
      for (const item of diagnostics)
        console.error(
          `${item.document}${item.location ? `:${item.location.line}:${item.location.column}` : ''} ${item.severity} ${item.code}: ${item.message}`,
        );
      if (error) console.error(`${error.code}: ${error.message}`);
    }
    return exitCode;
  } catch (cause) {
    const failure =
      isException(cause) && planErrors.is(cause)
        ? cause
        : planErrors.create('readFailed', { cause });
    const error = {
      code: failure.code,
      message: failure.message,
      ...(failure.data ? { data: failure.data } : {}),
    };
    if (json)
      console.log(
        JSON.stringify({ schemaVersion: 1, command, data: null, diagnostics: [], error }),
      );
    else {
      console.error(`${error.code}: ${error.message}. Run jg-plans --help.`);
      if (failure.data) console.error(`Details: ${JSON.stringify(failure.data)}`);
    }
    return 2;
  }
};
