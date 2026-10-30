import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { isPathWithin, readBoundedFile } from 'jg-fs';
import { resolvePackageManagerCommand, runProcess } from 'jg-process';
import { parse, stringify } from 'yaml';
import { z } from 'zod';

import { packageRoot } from './utilities.ts';
import { ARCHIVE_LIMITS, inspectPackageArchive } from './archive.ts';

const PackedFilesSchema = z.array(z.object({ files: z.array(z.object({ path: z.string() })) }));
const PolicySchema = z.object({
  minimumReleaseAge: z.number(),
  minimumReleaseAgeExclude: z.array(z.string()),
});

/** Install one exact archive and exercise its actual root export, declarations, and bin shim. */
export const verifyPackedConsumer = async (
  archive: string,
  signal?: AbortSignal,
): Promise<string[]> => {
  let directory = await mkdtemp(join(tmpdir(), 'jg-plans-consumer-'));
  try {
    // macOS /var and other OS temp roots can be aliases of their real paths.
    directory = await realpath(directory);
    const cancellation = signal ? { signal } : {};
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !['npm_config_userconfig', 'npm_config_cache'].includes(key.toLowerCase()),
      ),
    );
    env.NPM_CONFIG_USERCONFIG = join(directory, 'empty.npmrc');
    env.NPM_CONFIG_CACHE = join(directory, 'npm-cache');
    await writeFile(env.NPM_CONFIG_USERCONFIG, '');
    const policy = PolicySchema.parse(
      parse(
        (await readBoundedFile(join(packageRoot, 'pnpm-workspace.yaml'), 1024 * 1024)).toString(
          'utf8',
        ),
      ),
    );
    await writeFile(
      join(directory, 'pnpm-workspace.yaml'),
      stringify({ packages: [], ...policy, strictDepBuilds: true, allowBuilds: {} }),
    );
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({ name: 'jg-plans-public-consumer', private: true, type: 'module' }),
    );
    const dryRun = await runProcess({
      ...cancellation,
      ...resolvePackageManagerCommand(['pack', '--dry-run', '--ignore-scripts', '--json'], {
        packageManager: 'npm',
        cwd: packageRoot,
      }),
      cwd: packageRoot,
      env,
      timeoutSeconds: 60,
      maxOutputBytes: 1024 * 1024,
    });
    assert.equal(dryRun.exitCode, 0, dryRun.stderr);
    const files = PackedFilesSchema.parse(JSON.parse(dryRun.stdout)).flatMap((entry) =>
      entry.files.map((file) => file.path),
    );
    for (const file of files) {
      assert.ok(
        /^(?:dist\/|protocol\/|api\/|cli\/|errors\/|examples\/|docs\/(?:getting-started|integrations)\.md$|(?:package\.json|README\.md|LICENSE|NOTICE|CHANGELOG\.md)$)/.test(
          file,
        ),
        `Unexpected shipped path: ${file}`,
      );
      assert.ok(
        !/\.test-|(?:^|\/)(?:AGENTS\.md|SKILL\.md|_archive|_archives|_backup|_backups)(?:\/|$)/.test(
          file,
        ),
        `Private/test file ships: ${file}`,
      );
    }
    for (const required of [
      'dist/index.js',
      'dist/index.d.ts',
      'dist/cli/cli.js',
      'protocol/0.1/README.md',
      'protocol/0.2/README.md',
      'examples/criteria/expected.json',
      'api/README.md',
      'cli/README.md',
      'errors/README.md',
      'docs/getting-started.md',
      'docs/integrations.md',
      'examples/library.mjs',
      'CHANGELOG.md',
      'NOTICE',
    ])
      assert.ok(files.includes(required), `Missing shipped path: ${required}`);
    const payload = await inspectPackageArchive(
      await readBoundedFile(archive, ARCHIVE_LIMITS.compressedBytes),
    );
    assert.deepEqual(
      [...payload.keys()].sort(),
      [...files].sort(),
      'Archive payload differs from the inspected packed file list',
    );
    for (const [name, bytes] of payload) {
      if (!name.endsWith('.md')) continue;
      for (const match of bytes.toString('utf8').matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
        const href = match[1]!;
        if (/^(?:[a-z]+:|#|\/)/i.test(href)) continue;
        const file = decodeURIComponent(href.split('#')[0]!);
        assert.ok(
          payload.has(posix.normalize(posix.join(posix.dirname(name), file))),
          `Broken packaged document link: ${name} -> ${href}`,
        );
      }
    }
    const install = await runProcess({
      ...cancellation,
      ...resolvePackageManagerCommand(['add', '--ignore-scripts', '--save-exact', archive], {
        packageManager: 'pnpm',
        cwd: directory,
      }),
      cwd: directory,
      env,
      timeoutSeconds: 120,
      maxOutputBytes: 1024 * 1024,
    });
    assert.equal(install.exitCode, 0, install.stderr || install.stdout);
    const installedRoot = await realpath(join(directory, 'node_modules/jg-plans'));
    assert.ok(isPathWithin(directory, installedRoot));
    for (const [name, bytes] of payload)
      assert.deepEqual(
        await readBoundedFile(join(installedRoot, name), ARCHIVE_LIMITS.entryBytes),
        bytes,
        `Installed bytes differ from archive: ${name}`,
      );

    const smoke = await runProcess({
      ...cancellation,
      command: process.execPath,
      args: [
        '--input-type=module',
        '-e',
        `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      import * as plans from 'jg-plans';
      assert.equal(plans.PROTOCOL_VERSION, '0.2');
      assert.deepEqual(Object.keys(plans).sort(), ['CreatePlanOptionsSchema','CriterionIdSchema','DiagnosticSchema','ERRORS','ErrorCodeRangeSchema','InspectPlanOptionsSchema','MilestoneSelectorSchema','MilestoneSetSchema','PRIORITY_VALUES','PROGRESS_VALUES','PROTOCOL_VERSION','PROTOCOL_VERSIONS','ProgressSchema','ProtocolVersionSchema','PlanDocumentsSchema','PlanDocumentWriteSchema','RemoveMilestonesSchema','PlanFingerprintOptionsSchema','PlanFingerprintSchema','PlanMetadataSchema','PlanSetSchema','PlanUpdateSchema','PrioritySchema','ReadOptionsSchema','RepositoryIdSchema','SourceLocationSchema','checkPlan','createPlan','fingerprintPlan','inspectPlan','observeCriteria','parseMilestones','parsePlan','updatePlan','preparePlanUpdate','preparePlanDocumentWrite','writePlanDocument','removeMilestones','withPlanDocumentLocks'].sort());
      assert.equal(plans.parsePlan('# Useful document').body, '# Useful document');
      assert.match(plans.fingerprintPlan('# Work').sha256, /^[a-f0-9]{64}$/);
      assert.equal(plans.parseMilestones('## Milestone 1: Work\\n**Status:** custom').milestones[0].status, 'custom');
      assert.equal(plans.observeCriteria(plans.parsePlan('---\\nprotocol: "0.2"\\n---\\n- AC-01: Done.')).criteria[0].id, 'AC-01');
      assert.equal(plans.checkPlan({}).conforms, false);
      const result = await plans.inspectPlan('missing-directory');
      assert.equal(result.plan.state, 'missing');
      assert.equal(plans.ReadOptionsSchema.safeParse({maxBytes: 0}).success, false);
      const require = createRequire(import.meta.url);
      assert.equal(require('jg-plans').PROTOCOL_VERSION, '0.2');
      assert.throws(() => require('jg-plans/dist/documents/plan.js'), {code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'});
      const created = await plans.createPlan({root: 'library-sample', slug: 'typed', body: '# Work'});
      assert.equal((await plans.updatePlan(created.directory, {document: 'plan', set: {revision: 2}})).changed, true);
      const observed = await plans.inspectPlan(created.directory, {fingerprint: {excludeMetadataKeys: ['status']}});
      assert.equal(observed.plan.state, 'readable');
      assert.match(observed.plan.sha256, /^[a-f0-9]{64}$/);
      assert.match(observed.fingerprint.sha256, /^[a-f0-9]{64}$/);
    `,
      ],
      cwd: directory,
      env,
      timeoutSeconds: 30,
      maxOutputBytes: 1024 * 1024,
    });
    assert.equal(smoke.exitCode, 0, smoke.stderr);
    assert.equal(smoke.stdout, '');
    assert.equal(smoke.stderr, '');

    await writeFile(
      join(directory, 'types.mts'),
      `import { parsePlan, inspectPlan, createPlan, updatePlan, fingerprintPlan, preparePlanUpdate, preparePlanDocumentWrite, writePlanDocument, removeMilestones, withPlanDocumentLocks, type IPreparedPlanEdit, type IAssignedMilestoneId, type IPlanDocumentWrite, type IPlanDocumentWriteResult, type IRemoveMilestones, type IRemoveMilestonesResult, type IPlanUpdate, type IPlanCreation, type IParsedPlan, type IPlanInspection, type IDiagnostic, type ISourceSpan, type IHeadingSection, type IPlanFingerprint, type IInspectPlanOptions, type IPlanFingerprintOptions } from 'jg-plans';
const plan: IParsedPlan = parsePlan('# Work');
const inspection: IPlanInspection = await inspectPlan('.');
const diagnostics: IDiagnostic[] = plan.diagnostics;
const created: IPlanCreation = await createPlan({slug: 'typed-example', body: '# Work'});
const patch: IPlanUpdate = {document: 'plan', set: {revision: 2}};
const changed: boolean = (await updatePlan(created.directory, patch)).changed;
const fingerprintOptions: IPlanFingerprintOptions = {excludeMetadataKeys: ['status']};
const inspectOptions: IInspectPlanOptions = {fingerprint: fingerprintOptions};
const fingerprint: IPlanFingerprint = fingerprintPlan(plan.source, fingerprintOptions);
const preamble: ISourceSpan = plan.preamble;
const sections: IHeadingSection[] = plan.sections;
const input: IPlanDocumentWrite = {document: 'plan', expectedSha256: created.plan.sha256, body: '# Revised'};
const prepared: IPreparedPlanEdit = preparePlanDocumentWrite(created.plan.source, input);
const narrow: IPreparedPlanEdit = preparePlanUpdate(created.plan.source, {document: 'plan', set: {status: 'custom'}});
const assignments: IAssignedMilestoneId[] = prepared.assignedMilestoneIds;
const written: IPlanDocumentWriteResult = await writePlanDocument(created.directory, input);
const removal: IRemoveMilestones = {expectedSha256: prepared.sha256};
const removed: IRemoveMilestonesResult = await removeMilestones(created.directory, removal);
const locked: number = await withPlanDocumentLocks(created.directory, ['milestones', 'plan'], () => 1);
void [inspection, diagnostics, changed, fingerprint, preamble, sections, inspectOptions, narrow, assignments, written, removed, locked];\n`,
    );
    const require = createRequire(import.meta.url);
    const typecheck = await runProcess({
      ...cancellation,
      command: process.execPath,
      args: [
        require.resolve('typescript/bin/tsc'),
        '--noEmit',
        '--strict',
        '--module',
        'nodenext',
        '--target',
        'es2023',
        '--types',
        'node',
        join(directory, 'types.mts'),
        '--typeRoots',
        join(packageRoot, 'node_modules/@types'),
      ],
      cwd: directory,
      env,
      timeoutSeconds: 60,
      maxOutputBytes: 1024 * 1024,
    });
    assert.equal(typecheck.exitCode, 0, typecheck.stdout || typecheck.stderr);

    const cli = await runProcess({
      ...cancellation,
      ...resolvePackageManagerCommand(
        ['exec', 'jg-plans', 'inspect', '--directory', join(directory, 'absent'), '--json'],
        { packageManager: 'pnpm', cwd: directory },
      ),
      cwd: directory,
      env,
      timeoutSeconds: 30,
      maxOutputBytes: 1024 * 1024,
    });
    assert.equal(cli.exitCode, 0, cli.stderr);
    assert.equal(cli.stderr, '');
    const envelope = z
      .object({
        schemaVersion: z.literal(1),
        command: z.literal('inspect'),
        data: z.object({
          plan: z.object({ state: z.literal('missing') }),
          milestones: z.object({ state: z.literal('missing') }),
        }),
        error: z.null(),
      })
      .parse(JSON.parse(cli.stdout));
    assert.equal(envelope.data.plan.state, 'missing');

    const runCli = async (args: string[], expectedExit = 0): Promise<unknown> => {
      const result = await runProcess({
        ...cancellation,
        ...resolvePackageManagerCommand(['exec', 'jg-plans', ...args, '--json'], {
          packageManager: 'pnpm',
          cwd: directory,
        }),
        cwd: directory,
        env,
        timeoutSeconds: 30,
        maxOutputBytes: 1024 * 1024,
      });
      assert.equal(result.exitCode, expectedExit, result.stderr || result.stdout);
      assert.equal(result.stderr, '');
      return JSON.parse(result.stdout) as unknown;
    };
    const markerId = '6cc499ed-c9ab-4986-a16b-7e910c6b9521';
    const milestoneSource = `## Milestone 1: Consumer\n**Status:** pending\n**Milestone ID:** ${markerId}\n\nKeep this prose.\n`;
    const createInput = join(directory, 'create.json');
    await writeFile(
      createInput,
      JSON.stringify({ body: '# Installed executable', milestones: milestoneSource }),
    );
    const created = z
      .object({
        command: z.literal('create'),
        error: z.null(),
        data: z.object({ directory: z.string() }),
      })
      .parse(await runCli(['create', '--slug', 'consumer', '--input', createInput]));
    assert.ok(isPathWithin(join(directory, 'jg-plans'), created.data.directory));
    const observed = z
      .object({
        command: z.literal('inspect'),
        error: z.null(),
        data: z.object({ plan: z.object({ state: z.literal('readable') }) }),
      })
      .parse(await runCli(['inspect', '--directory', created.data.directory]));
    assert.equal(observed.data.plan.state, 'readable');
    const updateInput = join(directory, 'update.json');
    await writeFile(
      updateInput,
      JSON.stringify({
        document: 'milestones',
        changes: [{ select: { id: markerId }, set: { status: 'done' } }],
      }),
    );
    const updated = z
      .object({
        command: z.literal('update'),
        error: z.null(),
        data: z.object({ changed: z.literal(true) }),
      })
      .parse(
        await runCli(['update', '--directory', created.data.directory, '--input', updateInput]),
      );
    assert.equal(updated.data.changed, true);
    assert.equal(
      (await readBoundedFile(join(created.data.directory, 'milestones.md'), 1024 * 1024)).toString(
        'utf8',
      ),
      milestoneSource.replace('pending', 'done'),
    );
    const checked = z
      .object({
        command: z.literal('check'),
        error: z.null(),
        data: z.object({ conforms: z.literal(true) }),
      })
      .parse(await runCli(['check', '--directory', created.data.directory]));
    assert.equal(checked.data.conforms, true);
    const writeInput = join(directory, 'write.json');
    const removeInput = join(directory, 'remove.json');
    const observedForWrite = z
      .object({
        data: z.object({
          plan: z.object({ sha256: z.string() }),
          milestones: z.object({ sha256: z.string() }),
        }),
      })
      .parse(await runCli(['inspect', '--directory', created.data.directory]));
    await writeFile(
      writeInput,
      JSON.stringify({
        document: 'plan',
        expectedSha256: observedForWrite.data.plan.sha256,
        body: '# Revised installed example\n',
        set: { revision: 2 },
      }),
    );
    const bodyWritten = z
      .object({
        data: z.object({
          changed: z.literal(true),
          sha256: z.string(),
          assignedMilestoneIds: z.array(z.unknown()),
        }),
        error: z.null(),
      })
      .parse(await runCli(['write', '--directory', created.data.directory, '--input', writeInput]));
    assert.notEqual(bodyWritten.data.sha256, observedForWrite.data.plan.sha256);
    const stale = z
      .object({ data: z.null(), error: z.object({ code: z.literal('JG_PLANS_SOURCE_CHANGED') }) })
      .parse(
        await runCli(['write', '--directory', created.data.directory, '--input', writeInput], 2),
      );
    assert.equal(stale.data, null);
    await writeFile(
      removeInput,
      JSON.stringify({ expectedSha256: observedForWrite.data.milestones.sha256 }),
    );
    const removed = z
      .object({ data: z.object({ changed: z.literal(true), sha256: z.null() }), error: z.null() })
      .parse(
        await runCli([
          'remove-milestones',
          '--directory',
          created.data.directory,
          '--input',
          removeInput,
        ]),
      );
    assert.equal(removed.data.sha256, null);
    await writeFile(
      writeInput,
      JSON.stringify({
        document: 'milestones',
        expectedSha256: null,
        source: '## Milestone 1: New scope\n**Status:** pending\n',
        assignMissingIds: true,
      }),
    );
    const assigned = z
      .object({
        data: z.object({
          sha256: z.string(),
          assignedMilestoneIds: z.array(z.object({ ordinal: z.number(), id: z.uuid() })),
        }),
        error: z.null(),
      })
      .parse(await runCli(['write', '--directory', created.data.directory, '--input', writeInput]));
    assert.equal(assigned.data.assignedMilestoneIds.length, 1);
    await runCli(['check', '--directory', created.data.directory]);
    const lockSmoke = await runProcess({
      ...cancellation,
      command: process.execPath,
      args: [
        '--input-type=module',
        '-e',
        `
        import assert from 'node:assert/strict';
        import { withPlanDocumentLocks, updatePlan, preparePlanDocumentWrite } from 'jg-plans';
        const prepared = preparePlanDocumentWrite(null, {document: 'milestones', expectedSha256: null, source: '## Milestone 1: Work\\n**Status:** pending', assignMissingIds: true});
        assert.equal(prepared.assignedMilestoneIds.length, 1);
        await withPlanDocumentLocks(process.argv[1], ['plan'], async () => {
          await assert.rejects(updatePlan(process.argv[1], {document: 'plan', set: {status: 'done'}}), {code: 'JG_PLANS_LOCK_BUSY'});
        });
      `,
        created.data.directory,
      ],
      cwd: directory,
      env,
      timeoutSeconds: 30,
      maxOutputBytes: 1024 * 1024,
    });
    assert.equal(lockSmoke.exitCode, 0, lockSmoke.stderr);
    const example = await runProcess({
      ...cancellation,
      command: process.execPath,
      args: [join(installedRoot, 'examples/library.mjs')],
      cwd: directory,
      env,
      timeoutSeconds: 30,
      maxOutputBytes: 1024 * 1024,
    });
    assert.equal(example.exitCode, 0, example.stderr);
    assert.equal(example.stderr, '');
    assert.equal(
      z.object({ conforms: z.literal(true) }).parse(JSON.parse(example.stdout)).conforms,
      true,
    );
    return files;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
