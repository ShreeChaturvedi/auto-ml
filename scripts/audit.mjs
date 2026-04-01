import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const auditTargets = [
  { name: 'root', cwd: repoRoot },
  { name: 'backend', cwd: fileURLToPath(new URL('../backend/', import.meta.url)) },
  { name: 'frontend', cwd: fileURLToPath(new URL('../frontend/', import.meta.url)) },
  { name: 'testing', cwd: fileURLToPath(new URL('../testing/', import.meta.url)) },
];

const failedTargets = [];

for (const target of auditTargets) {
  console.log(`\n=== Auditing ${target.name} dependencies ===`);

  const result = spawnSync(npmCommand, ['audit'], {
    cwd: target.cwd,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`Failed to run npm audit for ${target.name}:`, result.error.message);
    failedTargets.push(target.name);
    continue;
  }

  if (result.status !== 0) {
    failedTargets.push(target.name);
  }
}

if (failedTargets.length > 0) {
  console.error(
    `\nDependency audit failed in ${failedTargets.length} target(s): ${failedTargets.join(', ')}`,
  );
  process.exit(1);
}

console.log('\nAll dependency audits passed.');
