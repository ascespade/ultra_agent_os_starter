const { test, expect } = require('@playwright/test');

test.describe('Ultra Agent OS Application', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8088');
  });

  test('should load the main page', async ({ page }) => {
    await expect(page).toHaveTitle(/Ultra Agent OS/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('should have the correct layout structure', async ({ page }) => {
    // Check for the main grid layout
    const root = page.locator('#root');
    await expect(root).toBeVisible();
    
    // Check for chat section
    const chatSection = page.locator('#chat');
    await expect(chatSection).toBeVisible();
  });

  test('should be responsive', async ({ page }) => {
    // Test mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('body')).toBeVisible();
    
    // Test desktop view
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('body')).toBeVisible();
  });

  test('should have proper styling', async ({ page }) => {
    const body = page.locator('body');
    await expect(body).toHaveCSS('margin', '0px');
    await expect(body).toHaveCSS('font-family', /system-ui/);
  });
});
