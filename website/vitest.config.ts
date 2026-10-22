import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test-unit.ts', 'scripts/**/*.test-unit.ts'],
          retry: 0,
        },
      },
      { test: { name: 'integration', include: ['scripts/**/*.test-integration.ts'], retry: 0 } },
    ],
  },
});
