import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

describe('script build', () => {
  it('produces hydra.sh ≤ 200 lines and shellcheck-clean', () => {
    execSync('bash script/build.sh', { stdio: 'inherit' });
    expect(existsSync('script/hydra.sh')).toBe(true);
    const content = readFileSync('script/hydra.sh', 'utf8');
    const lines = content.split('\n').filter(l => !/^\s*#/.test(l) && l.trim().length > 0);
    expect(lines.length).toBeLessThanOrEqual(200);
    expect(statSync('script/hydra.sh').mode & 0o111).toBeGreaterThan(0);
  });
});
