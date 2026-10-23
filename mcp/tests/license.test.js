import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The package ships its own copies of the repository's licence texts,
// since npm cannot pack files from outside the package directory.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const pkg = JSON.parse(read('../package.json'));
const root = JSON.parse(read('../../package.json'));

describe('licence', () => {
  it('declares the same licence as the repository', () => {
    expect(pkg.license).toBe(root.license);
  });

  it.each(['LICENSE-APACHE', 'LICENSE-MIT'])('packs %s identical to the repository copy', (name) => {
    expect(pkg.files).toContain(name);
    expect(read(`../${name}`)).toBe(read(`../../${name}`));
  });
});
