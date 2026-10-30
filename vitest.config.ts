import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test-unit.ts', 'scripts/**/*.test-unit.ts'],
          exclude: [...configDefaults.exclude, '**/{_archive,_archives,_backup,_backups}/**'],
          tags: [
            { name: 'full', description: 'Secondary observations and formatting permutations.' },
          ],
          retry: 0,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['src/**/*.test-integration.ts', 'scripts/**/*.test-integration.ts'],
          exclude: [...configDefaults.exclude, '**/{_archive,_archives,_backup,_backups}/**'],
          tags: [
            { name: 'full', description: 'Secondary observations and formatting permutations.' },
          ],
          retry: 0,
        },
      },
    ],
  },
});
