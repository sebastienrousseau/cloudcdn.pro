/**
 * Playwright Visual Regression Tests for CloudCDN Dashboard
 *
 * Run:   npx playwright test scripts/tests/visual/
 * Update baselines: npx playwright test scripts/tests/visual/ --update-snapshots
 *
 * Requires: npx playwright install chromium
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8788/en';

test.describe('Dashboard Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    // Wait for manifest to load and initial render to complete
    await page.goto(`${BASE}/dashboard/`, { waitUntil: 'networkidle' });
    // Wait for gallery cards to appear
    await page.waitForSelector('.asset-card', { timeout: 10000 });
  });

  test('assets tab — full grid layout', async ({ page }) => {
    await expect(page).toHaveScreenshot('dashboard-assets.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.01,
    });
  });

  test('assets tab — search filters results', async ({ page }) => {
    await page.click('#search-trigger');
    await page.fill('#search-modal-input', 'bankingonai');
    await page.locator('#search-modal-results [data-result]').first().waitFor();
    await expect(page).toHaveScreenshot('dashboard-search.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('assets tab — format filter', async ({ page }) => {
    await page.selectOption('#filter-format', 'svg');
    await page.waitForTimeout(200);
    await expect(page).toHaveScreenshot('dashboard-filter-svg.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('upload tab — form layout', async ({ page }) => {
    await page.click('[data-tab="upload"]');
    await page.locator('#panel-upload').waitFor();
    await expect(page).toHaveScreenshot('dashboard-upload.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('insights tab — empty state', async ({ page }) => {
    await page.click('[data-tab="insights"]');
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('dashboard-insights.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('copy overlay appears on card hover', async ({ page }) => {
    const firstCard = page.locator('.asset-card').first();
    await firstCard.hover();
    await page.waitForTimeout(200);
    await expect(firstCard).toHaveScreenshot('card-hover-overlay.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('responsive layout — mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('dashboard-mobile.png', {
      maxDiffPixelRatio: 0.02,
    });
  });
});

test.describe('Landing Page Visual Regression', () => {
  test('homepage — hero layout', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await expect(page).toHaveScreenshot('homepage.png', {
      maxDiffPixelRatio: 0.01,
    });
  });

  test('dist page — os detection', async ({ page }) => {
    await page.goto(`${BASE}/dist/`, { waitUntil: 'networkidle' });
    await expect(page).toHaveScreenshot('dist-page.png', {
      maxDiffPixelRatio: 0.02,
    });
  });
});
