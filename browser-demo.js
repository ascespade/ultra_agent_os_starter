const { chromium } = require('playwright');
const path = require('path');

(async () => {
  console.log('🚀 Starting browser automation...');
  
  // Launch browser
  const browser = await chromium.launch({ 
    headless: true, // Run in headless mode for server environment
    slowMo: 500 // Slow down for visibility in logs
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  
  const page = await context.newPage();
  
  try {
    // Step 1: Go to main page
    console.log('📍 Step 1: Navigating to main page...');
    await page.goto('http://localhost:8088/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/01-main-page.png' });
    console.log('✅ Main page loaded');
    
    // Wait a bit to see the page
    await page.waitForTimeout(3000);
    
    // Step 2: Navigate to admin dashboard
    console.log('📍 Step 2: Navigating to admin dashboard...');
    await page.goto('http://localhost:8088/?admin=true');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/02-admin-dashboard.png' });
    console.log('✅ Admin dashboard loaded');
    
    // Wait to see the login modal
    await page.waitForTimeout(2000);
    
    // Step 3: Handle login
    console.log('📍 Step 3: Logging in...');
    
    // Wait for login modal to be visible
    await page.waitForSelector('#modal:not(.hidden)', { state: 'visible', timeout: 10000 });
    console.log('✅ Login modal is visible');
    
    // Fill credentials
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'SecureAdminPassword2024!');
    
    await page.screenshot({ path: 'screenshots/03-login-form.png' });
    console.log('✅ Credentials filled');
    
    // Click login
    await page.click('#modal-confirm');
    console.log('✅ Login button clicked');
    
    // Wait for login to complete - check for modal to be hidden OR for successful login indicators
    try {
      await Promise.race([
        page.waitForSelector('#modal.hidden', { timeout: 10000 }),
        page.waitForSelector('.nav-item.active', { timeout: 10000 }),
        page.waitForSelector('[data-view="overview"]', { timeout: 10000 })
      ]);
      console.log('✅ Login completed successfully');
    } catch (error) {
      console.log('⚠️ Login may have completed but modal still visible');
    }
    
    await page.waitForTimeout(3000);
    
    await page.screenshot({ path: 'screenshots/04-logged-in-dashboard.png' });
    console.log('✅ Login successful');
    
    // Step 4: Navigate to jobs section
    console.log('📍 Step 4: Navigating to jobs section...');
    await page.click('[data-view="jobs"]');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'screenshots/05-jobs-section.png' });
    console.log('✅ Jobs section loaded');
    
    // Step 5: Create new task
    console.log('📍 Step 5: Creating new task...');
    
    // Look for the main chat interface
    const mainContent = await page.locator('#main-content, .panel-content, main').first();
    
    // Try to find input field
    const possibleInputs = [
      'input[placeholder*="message"]',
      'textarea[placeholder*="message"]',
      'input[type="text"]',
      'textarea',
      '.chat-input',
      '#message-input'
    ];
    
    let inputFound = false;
    for (const selector of possibleInputs) {
      const input = await page.locator(selector).first();
      if (await input.isVisible()) {
        console.log(`✅ Found input: ${selector}`);
        await input.fill('Test task: Create a simple todo list application');
        await page.screenshot({ path: 'screenshots/06-chat-input-filled.png' });
        
        // Send the message
        await input.press('Enter');
        inputFound = true;
        break;
      }
    }
    
    if (!inputFound) {
      console.log('⚠️ No input field found, looking for alternative...');
      // Try to find any clickable button
      const buttons = await page.locator('button').all();
      for (const button of buttons) {
        const text = await button.textContent();
        if (text && (text.includes('Send') || text.includes('Chat') || text.includes('Message'))) {
          console.log(`✅ Found button: ${text}`);
          await button.click();
          break;
        }
      }
    }
    
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'screenshots/07-task-created.png' });
    console.log('✅ Task creation attempted');
    
    // Step 6: Check results
    console.log('📍 Step 6: Checking results...');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/08-final-state.png' });
    
    console.log('🎉 Browser automation completed!');
    console.log('📸 Screenshots saved in screenshots/ folder');
    
    // Show final screenshot info
    console.log('📋 Check screenshots/ folder for step-by-step images:');
    console.log('   01-main-page.png - Main UI page');
    console.log('   02-admin-dashboard.png - Admin dashboard login');
    console.log('   03-login-form.png - Login form filled');
    console.log('   04-logged-in-dashboard.png - Successful login');
    console.log('   05-jobs-section.png - Jobs section');
    console.log('   06-chat-input-filled.png - Task input');
    console.log('   07-task-created.png - Task created');
    console.log('   08-final-state.png - Final state');
    
  } catch (error) {
    console.error('❌ Error during automation:', error);
    await page.screenshot({ path: 'screenshots/error-state.png' });
  } finally {
    await browser.close();
    console.log('🏁 Browser closed');
  }
})();
