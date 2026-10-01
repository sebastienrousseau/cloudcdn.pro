#!/usr/bin/env node

/**
 * Synchronise every owned public GitHub repository with a published latest
 * release into the hand-curated distribution catalogue.
 *
 * Existing package metadata stays authoritative. The synchroniser adds a
 * GitHub Releases registry to matching entries and creates a conservative
 * metadata-only entry for repositories the catalogue does not know yet.
 *
 * Usage:
 *   GITHUB_TOKEN=... node scripts/dist/sync-github-releases.mjs
 *   node scripts/dist/sync-github-releases.mjs --inventory repos.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const DEFAULT_OWNER = 'sebastienrousseau';
const DEFAULT_CATALOGUE = new URL('./packages-catalogue.json', import.meta.url);
const GITHUB_API = 'https://api.github.com/graphql';
const MAX_TAGLINE = 160;

const EXTRA_CATEGORIES = [
  {
    id: 'developer-tools',
    name: 'Developer Tooling',
    tagline: 'Shared configuration, conformance, automation, and engineering utilities.',
  },
  {
    id: 'apps',
    name: 'Apps & Services',
    tagline: 'Installable applications and published services.',
  },
];

const QUERY = `query($login:String!,$cursor:String){
  user(login:$login){
    repositories(first:100,after:$cursor,ownerAffiliations:OWNER,
      privacy:PUBLIC,orderBy:{field:NAME,direction:ASC}){
      nodes{
        name nameWithOwner description isArchived isFork
        primaryLanguage{name}
        latestRelease{
          tagName url publishedAt isDraft isPrerelease
          releaseAssets(first:1){totalCount}
        }
      }
      pageInfo{hasNextPage endCursor}
    }
  }
}`;

export function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function taglineFor(repo) {
  const fallback = `Latest published GitHub release for ${repo.name}.`;
  const text = String(repo.description || fallback).replace(/\s+/g, ' ').trim();
  if (text.length <= MAX_TAGLINE) return text;
  return `${text.slice(0, MAX_TAGLINE - 3).trimEnd()}...`;
}

export function categoryFor(repo) {
  const name = repo.name.toLowerCase();
  const text = `${name} ${repo.description || ''}`.toLowerCase();
  const language = repo.primaryLanguage?.name || '';
  if (/iso ?20022|pain\.?001|pacs\.?008|camt\.?0|acmt\.?0|bankstatement|reconcil/.test(text)) return 'iso20022';
  if (/\bmcp\b|\bagent\b|agtmls|language model|\bllm\b/.test(text)) return 'ai';
  if (/-config$|^(config|config-kit|codex|commons|devkit|pipelines|pulse)$/.test(name)) return 'developer-tools';
  if (/app$/.test(name) || language === 'Swift') return 'apps';
  const webLanguages = ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'Stylus'];
  if (name.endsWith('.github.io') || webLanguages.includes(language)) return 'web';
  if (/command.?line|\bcli\b|terminal|scanner/.test(text) || ['Go', 'Shell', 'C++'].includes(language)) return 'cli';
  if (language === 'Rust') return 'rust-libs';
  return 'apps';
}

function githubInstall(repo) {
  const command = repo.latestRelease.releaseAssets.totalCount > 0
    ? `gh release download --repo ${repo.nameWithOwner}`
    : `gh release view --repo ${repo.nameWithOwner} --web`;
  return { github: command };
}

function addGithubRegistry(pkg, repoName) {
  const registries = pkg.registries || [];
  if (registries.some((registry) => registry.type === 'github-releases')) return pkg;
  return {
    ...pkg,
    registries: [...registries, { type: 'github-releases', repo: repoName }],
  };
}

function newPackage(repo) {
  return {
    name: repo.name,
    slug: slugify(repo.name),
    category: categoryFor(repo),
    tagline: taglineFor(repo),
    repo: repo.nameWithOwner,
    archived: repo.isArchived,
    registries: [{ type: 'github-releases', repo: repo.nameWithOwner }],
    install: githubInstall(repo),
  };
}

export function mergeGithubReleases(catalogue, repositories) {
  const published = repositories.filter((repo) => !repo.isFork && repo.latestRelease);
  const byRepo = new Map(published.map((repo) => [repo.nameWithOwner, repo]));
  const bySlug = new Map(published.map((repo) => [slugify(repo.name), repo]));
  const linkedRepos = new Set();
  const packages = catalogue.packages.map((pkg) => {
    const releaseRepo = bySlug.get(pkg.slug) || byRepo.get(pkg.repo);
    if (!releaseRepo) return pkg;
    linkedRepos.add(releaseRepo.nameWithOwner);
    return addGithubRegistry(pkg, releaseRepo.nameWithOwner);
  });
  const added = published
    .filter((repo) => !linkedRepos.has(repo.nameWithOwner))
    .map(newPackage)
    .sort((a, b) => a.name.localeCompare(b.name));
  const categoryIds = new Set(catalogue.categories.map((category) => category.id));
  const categories = [
    ...catalogue.categories,
    ...EXTRA_CATEGORIES.filter((category) => !categoryIds.has(category.id)),
  ];
  return { ...catalogue, categories, packages: [...packages, ...added] };
}

async function fetchPage(token, owner, cursor) {
  const response = await fetch(GITHUB_API, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'cloudcdn-dist-catalogue (+https://cloudcdn.pro)',
    },
    body: JSON.stringify({ query: QUERY, variables: { login: owner, cursor } }),
  });
  if (!response.ok) throw new Error(`GitHub GraphQL returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join('; '));
  return payload.data.user.repositories;
}

export async function fetchGithubReleases(token, owner = DEFAULT_OWNER) {
  const repositories = [];
  let cursor = null;
  do {
    const page = await fetchPage(token, owner, cursor);
    repositories.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return repositories;
}

export async function main(options = {}) {
  const cataloguePath = options.catalogue || DEFAULT_CATALOGUE;
  const catalogue = JSON.parse(readFileSync(cataloguePath, 'utf8'));
  const repositories = options.inventory
    ? JSON.parse(readFileSync(options.inventory, 'utf8'))
    : await fetchGithubReleases(options.token, options.owner);
  const merged = mergeGithubReleases(catalogue, repositories);
  writeFileSync(cataloguePath, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`synchronised ${repositories.length} repositories; catalogue now has ${merged.packages.length} packages`);
  return merged;
}

const isMain = process.argv[1]?.endsWith('sync-github-releases.mjs');
if (isMain) {
  const { values } = parseArgs({
    options: {
      inventory: { type: 'string' },
      catalogue: { type: 'string' },
      owner: { type: 'string', default: DEFAULT_OWNER },
    },
  });
  const token = process.env.GITHUB_TOKEN;
  if (!values.inventory && !token) {
    console.error('GITHUB_TOKEN is required unless --inventory is provided');
    process.exit(2);
  }
  main({ ...values, token }).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
