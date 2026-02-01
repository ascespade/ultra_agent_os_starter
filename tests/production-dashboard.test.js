const { test, expect } = require('@playwright/test');

test.describe('Ultra Agent OS Production Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the production dashboard
    await page.goto('https://ultra-agent-ui-production.up.railway.app/');
  });

  test('Dashboard loads successfully', async ({ page }) => {
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check if page loads without errors
    const title = await page.title();
    console.log('Page title:', title);
    
    // Take a screenshot for verification
    await page.screenshot({ path: 'production-dashboard.png', fullPage: true });
    
    // Check for any error messages
    const errorElements = await page.locator('text=/error|Error|ERROR/').count();
    expect(errorElements).toBe(0);
  });

  test('Check for essential UI elements', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    // Look for common dashboard elements
    const possibleSelectors = [
      'h1', 'h2', '.dashboard', '.app', '.container',
      'nav', 'header', 'main', '[data-testid]',
      'button', 'input', 'form'
    ];
    
    let foundElements = 0;
    for (const selector of possibleSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        foundElements += count;
        console.log(`Found ${count} elements with selector: ${selector}`);
      }
    }
    
    expect(foundElements).toBeGreaterThan(0);
    console.log(`Total UI elements found: ${foundElements}`);
  });

  test('Check API connectivity', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    // Listen for network requests to check API calls
    const apiRequests = [];
    page.on('request', request => {
      if (request.url().includes('/api/')) {
        apiRequests.push({
          url: request.url(),
          method: request.method()
        });
      }
    });
    
    // Wait a bit to capture any initial API calls
    await page.waitForTimeout(3000);
    
    console.log('API requests detected:', apiRequests);
    
    // Check if env.js is loaded (indicates API configuration)
    const envScript = await page.locator('script[src*="env.js"]').count();
    console.log('Environment script found:', envScript > 0);
  });

  test('Check console for errors', async ({ page }) => {
    const consoleMessages = [];
    const errorMessages = [];
    
    page.on('console', msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text()
      });
      
      if (msg.type() === 'error') {
        errorMessages.push(msg.text());
      }
    });
    
    page.on('pageerror', error => {
      errorMessages.push(error.message);
    });
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    console.log('Console messages:', consoleMessages);
    
    if (errorMessages.length > 0) {
      console.error('JavaScript errors found:', errorMessages);
    }
    
    // Allow some warnings but no critical errors
    const criticalErrors = errorMessages.filter(msg => 
      !msg.includes('Warning') && !msg.includes('Deprecated')
    );
    
    expect(criticalErrors.length).toBe(0);
  });

  test('Check responsive design', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    // Test different viewport sizes
    const viewports = [
      { width: 1920, height: 1080, name: 'Desktop' },
      { width: 768, height: 1024, name: 'Tablet' },
      { width: 375, height: 667, name: 'Mobile' }
    ];
    
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(1000);
      
      const screenshotName = `production-dashboard-${viewport.name.toLowerCase()}.png`;
      await page.screenshot({ path: screenshotName, fullPage: true });
      
      console.log(`Screenshot taken for ${viewport.name} view`);
    }
  });

  test('Check service health indicators', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    // Look for health indicators or status messages
    const healthIndicators = [
      'text=/healthy|Healthy|HEALTHY/',
      'text=/online|Online|ONLINE/',
      'text=/connected|Connected|CONNECTED/',
      'text=/ready|Ready|READY/',
      '.status', '.health', '.indicator'
    ];
    
    let healthFound = false;
    for (const indicator of healthIndicators) {
      const element = await page.locator(indicator).first();
      if (await element.count() > 0) {
        const text = await element.textContent();
        console.log('Health indicator found:', text);
        healthFound = true;
        break;
      }
    }
    
    console.log('Health indicators found:', healthFound);
  });
});
