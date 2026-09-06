#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const pkgPath = resolve(rootDir, 'package.json');

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { cwd: rootDir, encoding: 'utf-8', stdio: 'pipe', ...opts }).trim();
  } catch {
    return '';
  }
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const pkgName = pkg.name;
const currentLocalVersion = pkg.version;

console.log(`[auto-release] Package: ${pkgName}, local version: ${currentLocalVersion}`);

let npmVersion = run(`npm view ${pkgName} version 2>/dev/null`) || '';

console.log(`[auto-release] Published version on npm: ${npmVersion || '(none)'}`);

let targetVersion = currentLocalVersion;

function parseSemver(v) {
  const [major, minor, patch] = (v || '0.0.0').split('.').map((x) => parseInt(x, 10) || 0);
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
  console.log(`[auto-release] Local version ${currentLocalVersion} is newer than npm (${npmVersion || 'none'}).`);
  targetVersion = currentLocalVersion;
} else {
  // Local version equals or is behind npm version -> automatically bump
  const baseSemver = parseSemver(npmVersion);
  let lastCommitMsg = run('git log -1 --pretty=%B') || '';

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

  try {
    execSync('npm i --package-lock-only', { cwd: rootDir, stdio: 'ignore' });
  } catch {}

  try {
    execSync('git config user.name "github-actions[bot]"', { cwd: rootDir, stdio: 'ignore' });
    execSync('git config user.email "github-actions[bot]@users.noreply.github.com"', { cwd: rootDir, stdio: 'ignore' });
    execSync('git add package.json package-lock.json', { cwd: rootDir, stdio: 'ignore' });
    execSync(`git commit -m "chore(release): v${targetVersion} [skip ci]"`, { cwd: rootDir, stdio: 'ignore' });
    execSync('git push origin HEAD:main', { cwd: rootDir, stdio: 'ignore' });
    console.log(`[auto-release] Pushed version bump v${targetVersion} to main.`);
  } catch (err) {
    console.warn(`[auto-release] Git commit/push note: ${err.message}`);
  }
}

// Tag git release
try {
  execSync(`git tag -a v${targetVersion} -m "Release v${targetVersion}"`, { cwd: rootDir, stdio: 'ignore' });
  execSync(`git push origin v${targetVersion}`, { cwd: rootDir, stdio: 'ignore' });
  console.log(`[auto-release] Created and pushed tag v${targetVersion}`);
} catch (err) {
  console.log(`[auto-release] Note on tag v${targetVersion}: ${err.message}`);
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${targetVersion}\n`);
}
