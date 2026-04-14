import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        // Use in-memory DO storage to avoid Windows EBUSY/SQLITE_CANTOPEN errors
        // caused by miniflare's SQLite file-locking between isolated storage frames.
        // Tests use distinct mission IDs so in-memory state is sufficient.
        miniflare: {
          unsafeEphemeralDurableObjects: true,
        },
      },
    },
  },
});
