#!/usr/bin/env node

import { readFileSync } from 'node:fs';

export function nextVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`invalid version: ${version}`);

  const parts = match.slice(1).map(Number);
  parts[2] += 1;
  if (parts[2] === 1000) {
    parts[1] += 1;
    parts[2] = 0;
  }
  return parts.join('.');
}

if (process.argv[1]?.endsWith('next-version.mjs')) {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  console.log(nextVersion(packageJson.version));
}
