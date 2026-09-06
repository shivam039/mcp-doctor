#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const pkgPath = resolve(rootDir, 'package.json');

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: rootDir, encoding: 'utf-8', ...opts }).trim();
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const pkgName = pkg.name;
const currentLocalVersion = pkg.version;

console.log(`[auto-release] Package: ${pkgName}, local version: ${currentLocalVersion}`);

let npmVersion = '';
try {
  npmVersion = run(`npm view ${pkgName} version 2>/dev/null || echo ""`);
} catch {
  npmVersion = '';
}

console.log(`[auto-release] Published version on npm: ${npmVersion || '(none)'}`);

let targetVersion = currentLocalVersion;

function parseSemver(v) {
  const [major, minor, patch] = v.split('.').map((x) => parseInt(x, 10) || 0);
  return { major, minor, patch };
}

function formatSemver({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

function isHigher(v1, v2) {
  const p1 = parseSemver(v1);
  const p2 = parseSemver(v2);
  if (p1.major !== p2.major) return p1.major > p2.major;
  if (p1.minor !== p2.minor) return p1.minor > p2.minor;
  return p1.patch > p2.patch;
}

if (!npmVersion || isHigher(currentLocalVersion, npmVersion)) {
  console.log(`[auto-release] Local version ${currentLocalVersion} is already newer than npm ${npmVersion || '0.0.0'}.`);
  targetVersion = currentLocalVersion;
} else {
  // Local version equals or is behind npm version -> automatically bump
  const baseSemver = parseSemver(npmVersion);
  let lastCommitMsg = '';
  try {
    lastCommitMsg = run('git log -1 --pretty=%B');
  } catch {
    lastCommitMsg = '';
  }

  console.log(`[auto-release] Analyzing last commit message: "${lastCommitMsg}"`);

  if (/BREAKING CHANGE|feat!:/i.test(lastCommitMsg)) {
    baseSemver.major += 1;
    baseSemver.minor = 0;
    baseSemver.patch = 0;
  } else if (/^feat(\(.*\))?:/i.test(lastCommitMsg)) {
    baseSemver.minor += 1;
    baseSemver.patch = 0;
  } else {
    baseSemver.patch += 1;
  }

  targetVersion = formatSemver(baseSemver);
  console.log(`[auto-release] Auto-bumping version to: ${targetVersion}`);

  pkg.version = targetVersion;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  // Update package-lock.json if present
  try {
    run('npm i --package-lock-only');
  } catch (err) {
    console.warn(`[auto-release] Could not update package-lock.json: ${err.message}`);
  }

  // Commit version bump if in git
  try {
    run('git config user.name "github-actions[bot]"');
    run('git config user.email "github-actions[bot]@users.noreply.github.com"');
    run(`git add package.json package-lock.json`);
    run(`git commit -m "chore(release): v${targetVersion} [skip ci]"`);
    run('git push origin HEAD:main');
    console.log(`[auto-release] Pushed version bump v${targetVersion} to main.`);
  } catch (err) {
    console.warn(`[auto-release] Git commit/push step skipped or failed: ${err.message}`);
  }
}

// Tag git release
try {
  run(`git tag -a v${targetVersion} -m "Release v${targetVersion}"`);
  run(`git push origin v${targetVersion}`);
  console.log(`[auto-release] Created and pushed tag v${targetVersion}`);
} catch (err) {
  console.log(`[auto-release] Tag v${targetVersion} might already exist: ${err.message}`);
}

console.log(`::set-output name=version::${targetVersion}`);
// For GitHub Actions environment files
if (process.env.GITHUB_OUTPUT) {
  const fs = await import('node:fs');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${targetVersion}\n`);
}
