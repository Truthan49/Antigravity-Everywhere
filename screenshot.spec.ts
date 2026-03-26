import { test, expect } from '@playwright/test';
test('screenshot', async ({ page }) => {
  await page.goto('http://localhost:3001');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'test-results/pro_max_screenshot.png', fullPage: true });
});
