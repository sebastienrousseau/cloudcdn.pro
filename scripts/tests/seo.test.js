import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

import { LANGUAGES } from '../i18n/translations.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CDN = path.join(ROOT, 'cdn');
const homepage = fs.readFileSync(path.join(CDN, 'en/index.html'), 'utf8');
const sitemap = fs.readFileSync(path.join(CDN, 'sitemap.xml'), 'utf8');

function languageUrl(language) {
  return language.code === 'en'
    ? 'https://cloudcdn.pro/'
    : `https://cloudcdn.pro/${language.code}/`;
}

function metaContent(attribute, value) {
  const direct = new RegExp(`<meta[^>]+${attribute}="${value}"[^>]+content="([^"]+)"`);
  const reverse = new RegExp(`<meta[^>]+content="([^"]+)"[^>]+${attribute}="${value}"`);
  return homepage.match(direct)?.[1] || homepage.match(reverse)?.[1];
}

describe('public search metadata', () => {
  it('uses durable homepage positioning and large social cards', () => {
    expect(homepage).toContain('<title>CloudCDN | Self-Hosted CDN &amp; Digital Asset Management</title>');
    expect(metaContent('name', 'description')).toHaveLength(149);
    expect(homepage).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(homepage).toContain('https://cloudcdn.pro/shared/social/cloudcdn-social-card.png');
    expect(homepage).not.toMatch(/300\+|&lt;100ms|99\.9%/);
  });

  it('publishes valid SoftwareSourceCode structured data', () => {
    const match = homepage.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    const structured = JSON.parse(match[1]);
    expect(structured).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      name: 'CloudCDN',
      codeRepository: 'https://github.com/sebastienrousseau/cloudcdn.pro',
    });
    expect(structured.license).toHaveLength(2);
  });

  it('lists every locale with reciprocal sitemap alternates', () => {
    const blocks = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(match => match[1]);
    expect(blocks).toHaveLength(LANGUAGES.length + 1);
    for (const language of LANGUAGES) {
      const block = blocks.find(value => value.includes(`<loc>${languageUrl(language)}</loc>`));
      expect(block).toBeDefined();
      for (const alternate of LANGUAGES) {
        expect(block).toContain(`hreflang="${alternate.hreflang}" href="${languageUrl(alternate)}"`);
      }
      expect(block).toContain('hreflang="x-default" href="https://cloudcdn.pro/"');
    }
  });

  it('uses each locale URL for canonical and Open Graph metadata', () => {
    for (const language of LANGUAGES) {
      const html = fs.readFileSync(path.join(CDN, language.code, 'index.html'), 'utf8');
      const url = languageUrl(language);
      expect(html).toContain(`<link rel="canonical" href="${url}">`);
      expect(html).toContain(`<meta property="og:url" content="${url}">`);
    }
  });

  it('generates share artwork in the declared dimensions and formats', async () => {
    const formats = { png: 'png', webp: 'webp', avif: 'heif' };
    for (const [extension, format] of Object.entries(formats)) {
      const image = path.join(CDN, `shared/social/cloudcdn-social-card.${extension}`);
      const metadata = await sharp(image).metadata();
      expect(metadata.width).toBe(1200);
      expect(metadata.height).toBe(630);
      expect(metadata.format).toBe(format);
    }
  });

  it('uses machine-detectable files for the dual licence choice', () => {
    const apache = fs.readFileSync(path.join(ROOT, 'LICENSE-APACHE'), 'utf8');
    expect(fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8')).toBe(apache);
    expect(fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')).toContain(
      '[Apache License 2.0](LICENSE-APACHE) or [MIT license](LICENSE-MIT)',
    );
  });
});
