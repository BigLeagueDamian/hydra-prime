import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

function dockerAvailable(): boolean {
  try {
    execSync('docker --version', { stdio: 'pipe' });
    execSync('docker info', { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

describe('script container test', () => {
  if (!dockerAvailable()) {
    it.skip('runs all bats suites in Alpine + Ubuntu containers (Docker unavailable, skipped)', () => {});
    return;
  }
  it('runs all bats suites in Alpine + Ubuntu containers', () => {
    const out = execSync('bash script/test/run-container-tests.sh', { encoding: 'utf8' });
    expect(out).toMatch(/all suites passed/);
  });
});
