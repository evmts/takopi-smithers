import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TestRepo {
  path: string;
  cleanup: () => void;
}

export async function createTestRepo(options?: { installDeps?: boolean }): Promise<TestRepo> {
  const testPath = join(tmpdir(), `takopi-smithers-test-${Date.now()}`);

  // Create fresh directory
  mkdirSync(testPath, { recursive: true });

  // Initialize git repo (required by takopi-smithers)
  await Bun.$`git init`.cwd(testPath).quiet();
  await Bun.$`git config user.email "test@example.com"`.cwd(testPath).quiet();
  await Bun.$`git config user.name "Test User"`.cwd(testPath).quiet();

  // Create dummy package.json with smithers dependencies
  const pkg = {
    name: 'test-repo',
    version: '1.0.0',
    dependencies: {
      smithers: '*',
      react: '*',
      'drizzle-orm': '*',
    },
  };
  await Bun.write(join(testPath, 'package.json'), JSON.stringify(pkg, null, 2));

  // Symlink node_modules from main project if requested (required for smithers workflows)
  // This is much faster than installing deps for each test
  if (options?.installDeps) {
    const mainNodeModules = join(process.cwd(), 'node_modules');
    const testNodeModules = join(testPath, 'node_modules');
    try {
      symlinkSync(mainNodeModules, testNodeModules, 'dir');
    } catch (err) {
      // Fallback to installing if symlink fails
      await Bun.$`bun install`.cwd(testPath).quiet();
    }
  }

  return {
    path: testPath,
    cleanup: () => rmSync(testPath, { recursive: true, force: true }),
  };
}
