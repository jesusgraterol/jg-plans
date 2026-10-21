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
export const verifyPackedConsumer = async (archive: string): Promise<string[]> => {
  const directory = await mkdtemp(join(tmpdir(), 'jg-plans-consumer-'));
  try {
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
      'api/README.md',
      'cli/README.md',
      'errors/README.md',
      'docs/getting-started.md',
      'docs/integrations.md',
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
      command: process.execPath,
      args: [
        '--input-type=module',
        '-e',
        `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      import * as plans from 'jg-plans';
      assert.equal(plans.PROTOCOL_VERSION, '0.1');
      assert.deepEqual(Object.keys(plans).sort(), ['DiagnosticSchema','ERRORS','PROTOCOL_VERSION','PlanDocumentsSchema','PlanMetadataSchema','ReadOptionsSchema','SourceLocationSchema','checkPlan','inspectPlan','parseMilestones','parsePlan'].sort());
      assert.equal(plans.parsePlan('# Legacy document').body, '# Legacy document');
      assert.equal(plans.parseMilestones('## Milestone 1: Work\\n**Status:** custom').milestones[0].status, 'custom');
      assert.equal(plans.checkPlan({}).conforms, false);
      const result = await plans.inspectPlan('missing-directory');
      assert.equal(result.plan.state, 'missing');
      assert.equal(plans.ReadOptionsSchema.safeParse({maxBytes: 0}).success, false);
      const require = createRequire(import.meta.url);
      assert.equal(require('jg-plans').PROTOCOL_VERSION, '0.1');
      assert.throws(() => require('jg-plans/dist/documents/plan.js'), {code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'});
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
      `import { parsePlan, inspectPlan, type IParsedPlan, type IPlanInspection, type IDiagnostic } from 'jg-plans';
const plan: IParsedPlan = parsePlan('# Work');
const inspection: IPlanInspection = await inspectPlan('.');
const diagnostics: IDiagnostic[] = plan.diagnostics;
void [inspection, diagnostics];\n`,
    );
    const require = createRequire(import.meta.url);
    const typecheck = await runProcess({
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
    return files;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
