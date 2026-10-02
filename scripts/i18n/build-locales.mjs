#!/usr/bin/env node
/**
 * Build localized homepage HTML for all languages.
 *
 * Reads cdn/en/index.html as the EN template, extracts translatable strings,
 * and generates cdn/{lang}/index.html for each non-English language
 * using strings from translations.mjs.
 *
 * Run: node scripts/i18n/build-locales.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LANGUAGES, TRANSLATIONS } from './translations.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const CDN = path.join(ROOT, 'cdn');

function loadTemplate() {
  return fs.readFileSync(path.join(CDN, 'en', 'index.html'), 'utf8');
}

/**
 * Render the language switcher HTML for the nav bar.
 * Current language is marked with class="active".
 */
function renderLangSwitcher(currentLang, t) {
  const items = LANGUAGES.map(l => {
    const href = l.code === 'en' ? '/' : `/${l.code}/`;
    const active = l.code === currentLang ? ' class="active"' : '';
    return `          <a href="${href}"${active}>${l.flag} ${l.name}</a>`;
  }).join('\n');

  return `      <div class="lang-switcher">
        <button type="button" aria-label="${t.changeLanguage}" class="lang-toggle">
          🌐 ${currentLang.toUpperCase()}
        </button>
        <div class="lang-menu">
          <div class="lang-menu-grid">
${items}
          </div>
        </div>
      </div>`;
}

/**
 * Render hreflang link tags for SEO.
 */
function renderHreflangs() {
  return LANGUAGES.map(l => {
    const href = l.code === 'en'
      ? 'https://cloudcdn.pro/'
      : `https://cloudcdn.pro/${l.code}/`;
    return `  <link rel="alternate" hreflang="${l.hreflang}" href="${href}">`;
  }).join('\n')
    + '\n  <link rel="alternate" hreflang="x-default" href="https://cloudcdn.pro/">';
}

function publicUrl(language) {
  return language.code === 'en'
    ? 'https://cloudcdn.pro/'
    : `https://cloudcdn.pro/${language.code}/`;
}

function renderSitemapAlternates() {
  const localized = LANGUAGES.map(language => {
    const url = publicUrl(language);
    return `    <xhtml:link rel="alternate" hreflang="${language.hreflang}" href="${url}"/>`;
  });
  localized.push('    <xhtml:link rel="alternate" hreflang="x-default" href="https://cloudcdn.pro/"/>');
  return localized.join('\n');
}

function renderSitemap() {
  const alternates = renderSitemapAlternates();
  const localized = LANGUAGES.map(language => `  <url>
    <loc>${publicUrl(language)}</loc>
    <changefreq>monthly</changefreq>
    <priority>${language.code === 'en' ? '1.0' : '0.8'}</priority>
${alternates}
  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${localized}
  <url>
    <loc>https://cloudcdn.pro/api-reference</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>
`;
}

function renderHead(template, lang, t) {
  const langInfo = LANGUAGES.find(l => l.code === lang);
  let html = template;
  const direction = langInfo.dir === 'rtl' ? ' dir="rtl"' : '';
  html = html.replace(
    /<html lang="en">/,
    `<html lang="${langInfo.hreflang}"${direction}>`
  );
  html = html.replace(/<title>[^<]+<\/title>/, `<title>${escHtml(t.title)}</title>`);
  const description = escAttr(t.description);
  const title = escAttr(t.title);
  html = html.replace(
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${description}">`
  );
  html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${title}">`);
  html = html.replace(
    /<meta property="og:description" content="[^"]*">/,
    `<meta property="og:description" content="${description}">`
  );
  html = html.replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${title}">`);
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*">/,
    `<meta name="twitter:description" content="${description}">`
  );
  const canonicalHref = publicUrl(langInfo);
  html = html.replace(
    /<link rel="canonical" href="[^"]*">/,
    `<link rel="canonical" href="${canonicalHref}">`
  );
  html = html.replace(
    /<meta property="og:url" content="[^"]*">/,
    `<meta property="og:url" content="${canonicalHref}">`
  );
  if (!html.includes('hreflang="en"')) {
    html = html.replace(/<link rel="canonical"[^>]*>/, match => match + '\n' + renderHreflangs());
  }
  return html;
}

function renderNavigation(template, lang, t) {
  let html = template;
  html = html.replace(/>Skip to Concierge</, `>${escHtml(t.skipToConcierge)}<`);
  const home = lang === 'en' ? '/' : `/${lang}/`;
  html = html.replace(
    /<li><a href="\/">Home<\/a><\/li>/,
    `<li><a href="${home}">${escHtml(t.navHome)}</a></li>`
  );
  html = html.replace(/>API<\/a>/, `>${escHtml(t.navApi)}</a>`);
  html = html.replace(/>Dashboard<\/a>/, `>${escHtml(t.navDashboard)}</a>`);
  html = html.replace(/>Downloads<\/a>/, `>${escHtml(t.navDownloads)}</a>`);
  html = html.replace(/>Login</, `>${escHtml(t.navLogin)}<`);
  html = html.replace(/aria-label="Toggle menu"/, `aria-label="${escAttr(t.navToggleMenu)}"`);
  if (!html.includes('class="lang-switcher"')) {
    html = html.replace(
      /<button class="nav-hamburger"/,
      `${renderLangSwitcher(lang, t)}\n      <button class="nav-hamburger"`
    );
  }
  return html;
}

function renderHero(template, t) {
  let html = template.replace(
    /<p class="tagline">[^<]+<\/p>/,
    `<p class="tagline">${escHtml(t.tagline)}</p>`
  );
  html = html.replace(/All systems operational/, escHtml(t.statusOperational));
  return html;
}

function renderConcierge(template, t) {
  let html = template;
  const replacements = [
    [/aria-label="Open CloudCDN Concierge"/, `aria-label="${escAttr(t.conciergeOpen)}"`],
    [/<h3>CloudCDN Concierge<\/h3>/, `<h3>${escHtml(t.conciergeTitle)}</h3>`],
    [/<p>AI-powered edge assistant<\/p>/, `<p>${escHtml(t.conciergeSubtitle)}</p>`],
    [/aria-label="New conversation" title="New conversation"/,
      `aria-label="${escAttr(t.conciergeNewChat)}" title="${escAttr(t.conciergeNewChat)}"`],
    [/aria-label="Close chat" title="Close \(Esc\)"/,
      `aria-label="${escAttr(t.conciergeClose)}" title="${escAttr(t.conciergeCloseTitle)}"`],
    [/data-msg="How do I set up CloudCDN\?">Setup guide/,
      `data-msg="${escAttr(t.quickMsgSetup)}">${escHtml(t.quickReplySetup)}`],
    [/data-msg="Compare your pricing plans">Pricing/,
      `data-msg="${escAttr(t.quickMsgPricing)}">${escHtml(t.quickReplyPricing)}`],
    [/data-msg="Is CloudCDN free for open source\?">Free for OSS\?/,
      `data-msg="${escAttr(t.quickMsgFreeOss)}">${escHtml(t.quickReplyFreeOss)}`],
    [/data-msg="What image formats do you support\?">Formats/,
      `data-msg="${escAttr(t.quickMsgFormats)}">${escHtml(t.quickReplyFormats)}`],
    [/Hi! I'm the CloudCDN Concierge\. Ask me about pricing, setup, performance, or anything about our edge CDN\./,
      escHtml(t.conciergeGreeting)],
    [/placeholder="Ask anything about CloudCDN\.\.\."/,
      `placeholder="${escAttr(t.chatInputPlaceholder)}"`],
    [/aria-label="Type your question"/, `aria-label="${escAttr(t.chatInputLabel)}"`],
    [/aria-label="Send message"/, `aria-label="${escAttr(t.chatSend)}"`],
    [/<div class="chat-footer-meta">Powered by Cloudflare Workers AI<\/div>/,
      `<div class="chat-footer-meta">${escHtml(t.chatPoweredBy)}</div>`],
  ];
  for (const [pattern, replacement] of replacements) {
    html = html.replace(pattern, replacement);
  }
  return html;
}

/** Apply a translation dictionary to the English homepage template. */
function render(template, lang, t) {
  let html = renderHead(template, lang, t);
  html = renderNavigation(html, lang, t);
  html = renderHero(html, t);
  html = renderConcierge(html, t);
  return html.replace(
    /el\.textContent = 'Logout';/,
    `el.textContent = '${escJs(t.navLogout)}';`
  );
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
function escJs(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function main() {
  const template = loadTemplate();

  // First, re-render the EN template itself (ensures it's idempotent)
  const enT = TRANSLATIONS.en;
  const enHtml = render(template, 'en', enT);
  fs.mkdirSync(path.join(CDN, 'en'), { recursive: true });
  fs.writeFileSync(path.join(CDN, 'en', 'index.html'), enHtml);
  console.log('✓ Updated EN: cdn/en/index.html');

  // Then render all other languages
  for (const lang of LANGUAGES) {
    if (lang.code === 'en') continue;
    const t = TRANSLATIONS[lang.code];
    if (!t) {
      console.warn(`⚠ Skipping ${lang.code} — no translations defined`);
      continue;
    }
    const localized = render(template, lang.code, t);
    const outDir = path.join(CDN, lang.code);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), localized);
    console.log(`✓ Generated ${lang.code}: cdn/${lang.code}/index.html`);
  }

  fs.writeFileSync(path.join(CDN, 'sitemap.xml'), renderSitemap());
  console.log('✓ Generated cdn/sitemap.xml');

  console.log(`\n${LANGUAGES.length} languages built.`);
}

main();
