import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    include: ['tests/script-build.test.ts', 'tests/script-container.test.ts'],
  },
});
