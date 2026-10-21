import { join } from 'node:path';
import { getErrorCode } from 'jg-exception';
import { readBoundedFile } from 'jg-fs';
import { z } from 'zod';

import { checkPlan } from '../documents/index.ts';
import { ERRORS, planErrors } from '../errors/index.ts';
import { inspectPlan, type IPlanInspection } from '../files/index.ts';
import type { IDiagnostic } from '../protocol/index.ts';

import { parseArguments } from './arguments.ts';

const HELP = `jg-plans — inspect Markdown plans without enforcing a workflow

Commands:
  inspect --directory <path> [--include-body] [--json] [--max-bytes <bytes>]
  check   --directory <path> [--json] [--max-bytes <bytes>]
  --help, -h
  --version, -v

Only the selected plan.md and optional milestones.md are read.
The default bound is 1048576 bytes per file. Checks are optional.
Exit 0: completed inspection or conforming check; 1: conformance errors;
2: invalid command or operational failure. Missing files do not imply completion.`;

const projectInspection = (inspection: IPlanInspection, includeBody: boolean): object => {
  const plan = inspection.plan;
  const milestones = inspection.milestones;
  const planValue = plan.state === 'readable' ? plan.value : undefined;
  const milestoneValue = milestones.state === 'readable' ? milestones.value : undefined;
  return {
    directory: inspection.directory,
    plan: {
      state: plan.state,
      path: plan.path,
      ...(planValue
        ? {
            metadata: planValue.metadata,
            rawMetadata: planValue.rawMetadata,
            frontmatter: planValue.frontmatter,
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
            overviewPresent: milestoneValue.overviewPresent,
            milestones: milestoneValue.milestones.map(({ body, ...entry }) => ({
              ...entry,
              ...(includeBody ? { body } : {}),
            })),
            ...(includeBody ? { source: milestoneValue.source } : {}),
          }
        : {}),
    },
  };
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
    let error: { code: string; message: string } | null = null;
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
    } else {
      const inspection = await inspectPlan(
        options.directory!,
        options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes },
      );
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
    const failure = planErrors.create(
      getErrorCode(cause) === ERRORS.INVALID_INPUT ? 'invalidInput' : 'readFailed',
      { cause },
    );
    const error = { code: failure.code, message: failure.message };
    if (json)
      console.log(
        JSON.stringify({ schemaVersion: 1, command, data: null, diagnostics: [], error }),
      );
    else console.error(`${error.code}: ${error.message}. Run jg-plans --help.`);
    return 2;
  }
};
