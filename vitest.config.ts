import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    // Script-shell tests (build, container) live under their own config
    // (vitest.script.config.ts) using the forks pool. Exclude them here so they
    // don't get picked up by the Workers pool, which would crash with a
    // workerd Fallback service network error.
    exclude: ['**/node_modules/**', 'tests/script-*.test.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        // Use in-memory DO storage to avoid Windows EBUSY/SQLITE_CANTOPEN errors
        // caused by miniflare's SQLite file-locking between isolated storage frames.
        // Tests use distinct mission IDs so in-memory state is sufficient.
        miniflare: {
          unsafeEphemeralDurableObjects: true,
          bindings: { AI_MOCK: '1' },
        },
      },
    },
  },
});
