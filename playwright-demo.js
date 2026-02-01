const { chromium } = require('playwright');

(async () => {
  console.log('🚀 Starting Playwright browser demo...');
  
  // Launch browser with display capability
  const browser = await chromium.launch({ 
    headless: false, // Show browser window
    slowMo: 800, // Slow down for visibility
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ]
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  
  const page = await context.newPage();
  
  try {
    // Step 1: Go to main page
    console.log('📍 Step 1: Opening main page...');
    await page.goto('http://localhost:8088/');
    await page.waitForLoadState('networkidle');
    console.log('✅ Main page loaded');
    
    // Wait to see the page
    await page.waitForTimeout(3000);
    
    // Step 2: Go to admin dashboard
    console.log('📍 Step 2: Opening admin dashboard...');
    await page.goto('http://localhost:8088/?admin=true');
    await page.waitForLoadState('networkidle');
    console.log('✅ Admin dashboard loaded');
    
    // Wait for login modal
    await page.waitForTimeout(2000);
    
    // Step 3: Login
    console.log('📍 Step 3: Logging in...');
    
    // Wait for login modal to be visible
    await page.waitForSelector('#modal:not(.hidden)', { state: 'visible', timeout: 15000 });
    console.log('✅ Login modal appeared');
    
    // Fill credentials
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'SecureAdminPassword2024!');
    console.log('✅ Credentials filled');
    
    // Take screenshot before login
    await page.screenshot({ path: 'playwright-demo/01-login-form.png' });
    
    // Click login
    await page.click('#modal-confirm');
    console.log('✅ Login clicked');
    
    // Wait for login to complete
    await page.waitForTimeout(5000);
    
    // Try to close modal if still open
    try {
      await page.evaluate(() => {
        const modal = document.getElementById('modal');
        if (modal && !modal.classList.contains('hidden')) {
          modal.classList.add('hidden');
        }
      });
    } catch (e) {
      console.log('Modal already closed');
    }
    
    await page.waitForTimeout(2000);
    
    // Step 4: Navigate to different sections
    console.log('📍 Step 4: Exploring dashboard sections...');
    
    const sections = ['overview', 'jobs', 'dbredis', 'integrations', 'config'];
    
    for (const section of sections) {
      console.log(`🔍 Navigating to ${section}...`);
      
      try {
        await page.click(`[data-view="${section}"]`);
        await page.waitForTimeout(2000);
        await page.screenshot({ path: `playwright-demo/02-section-${section}.png` });
        console.log(`✅ ${section} loaded`);
      } catch (error) {
        console.log(`⚠️ Could not navigate to ${section}: ${error.message}`);
      }
    }
    
    // Step 5: Try to create a task
    console.log('📍 Step 5: Attempting to create a task...');
    
    // Look for input fields
    const inputs = await page.locator('input, textarea').all();
    let taskCreated = false;
    
    for (const input of inputs) {
      try {
        const isVisible = await input.isVisible();
        const placeholder = await input.getAttribute('placeholder');
        
        if (isVisible && placeholder && placeholder.toLowerCase().includes('message')) {
          console.log('✅ Found message input field');
          await input.fill('Test task: Create a simple todo list');
          await page.screenshot({ path: 'playwright-demo/03-task-input.png' });
          
          // Try to submit
          await input.press('Enter');
          await page.waitForTimeout(3000);
          
          await page.screenshot({ path: 'playwright-demo/04-task-submitted.png' });
          taskCreated = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!taskCreated) {
      console.log('⚠️ No task input field found');
    }
    
    // Step 6: Final overview
    console.log('📍 Step 6: Final system overview...');
    await page.goto('http://localhost:8088/?admin=true');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'playwright-demo/05-final-overview.png' });
    
    console.log('🎉 Playwright demo completed successfully!');
    console.log('📸 Screenshots saved in playwright-demo/ folder');
    
    // Keep browser open for 30 seconds for manual interaction
    console.log('🔍 Browser will stay open for 30 seconds for manual testing...');
    await page.waitForTimeout(30000);
    
  } catch (error) {
    console.error('❌ Error during demo:', error);
    await page.screenshot({ path: 'playwright-demo/error.png' });
  } finally {
    await browser.close();
    console.log('🏁 Browser closed');
  }
})();
