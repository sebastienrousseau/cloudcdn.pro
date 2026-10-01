// SPDX-License-Identifier: MIT OR Apache-2.0

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import { readFileSync } from 'node:fs';

const [tag, expectedCommit, notesPath, ...artifacts] = process.argv.slice(2);

function fail(message) {
  console.error(`release preflight: ${message}`);
  process.exit(1);
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

if (!tag || !expectedCommit || !notesPath || artifacts.length === 0) {
  console.error('usage: npm run release:preflight -- <tag> <commit> <notes> <artifact...>');
  process.exit(2);
}

if (!/^v0\.0\.[1-9]\d*$/.test(tag)) fail(`invalid CloudCDN tag: ${tag}`);

const version = tag.slice(1);
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const packageLock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
if (packageJson.version !== version) fail(`package.json is ${packageJson.version}, expected ${version}`);
if (packageLock.packages[''].version !== version) fail(`package-lock.json is not ${version}`);

if (git('cat-file', '-t', tag) !== 'tag') fail(`${tag} is not an annotated tag`);
try {
  execFileSync('git', ['verify-tag', tag], { stdio: 'pipe' });
} catch {
  fail(`${tag} does not have a valid cryptographic signature`);
}

const subject = git('tag', '-l', tag, '--format=%(contents:subject)');
if (subject !== `cloudcdn.pro ${tag}`) fail(`tag message is ${JSON.stringify(subject)}`);
const target = git('rev-list', '-n', '1', tag);
if (target !== expectedCommit) fail(`${tag} targets ${target}, expected ${expectedCommit}`);

const notes = readFileSync(notesPath, 'utf8');
for (const marker of ['## Highlights ⭐️', "## What's Changed", '## Checksums', '**Full Changelog**:']) {
  if (!notes.includes(marker)) fail(`${notesPath} is missing ${marker}`);
}

for (const artifact of artifacts) {
  const digest = createHash('sha256').update(readFileSync(artifact)).digest('hex');
  const checksum = `${digest}  ${basename(artifact)}`;
  if (!notes.includes(checksum)) fail(`${notesPath} is missing checksum: ${checksum}`);
}

console.log(`release preflight passed for ${tag} at ${target}`);
