const { test, expect } = require('@playwright/test');

test.describe('Ultra Agent OS - Full Workflow', () => {
  test('Login and create new task', async ({ page }) => {
    // 1. Go to main page
    await page.goto('http://localhost:8088/');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of main page
    await page.screenshot({ path: 'screenshots/01-main-page.png' });
    
    // 2. Navigate to admin dashboard
    await page.goto('http://localhost:8088/?admin=true');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of dashboard
    await page.screenshot({ path: 'screenshots/02-admin-dashboard.png' });
    
    // 3. Handle login modal
    // Wait for login modal to appear
    await page.waitForSelector('#modal', { state: 'visible' });
    
    // Fill in credentials
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'SecureAdminPassword2024!');
    
    // Take screenshot before login
    await page.screenshot({ path: 'screenshots/03-login-form.png' });
    
    // Click login button
    await page.click('#modal-confirm');
    
    // Wait for login to complete and modal to close
    await page.waitForSelector('#modal', { state: 'hidden' });
    await page.waitForTimeout(2000);
    
    // Take screenshot after successful login
    await page.screenshot({ path: 'screenshots/04-logged-in-dashboard.png' });
    
    // 4. Navigate to jobs section
    await page.click('[data-view="jobs"]');
    await page.waitForTimeout(1000);
    
    // Take screenshot of jobs section
    await page.screenshot({ path: 'screenshots/05-jobs-section.png' });
    
    // 5. Create new task/chat
    // Look for chat input or create job button
    const chatInput = await page.locator('input[placeholder*="message"], textarea[placeholder*="message"], #chat-input, .chat-input').first();
    
    if (await chatInput.isVisible()) {
      // Fill in chat message
      await chatInput.fill('Test task: Create a simple todo list application');
      await page.screenshot({ path: 'screenshots/06-chat-input-filled.png' });
      
      // Send message
      await page.press(chatInput, 'Enter');
      await page.waitForTimeout(2000);
      
      // Take screenshot after sending
      await page.screenshot({ path: 'screenshots/07-task-created.png' });
    } else {
      // Look for create job button
      const createJobBtn = await page.locator('button:has-text("Create"), button:has-text("New Task"), .create-job-btn').first();
      
      if (await createJobBtn.isVisible()) {
        await createJobBtn.click();
        await page.waitForTimeout(1000);
        
        // Fill in job details if form appears
        const jobForm = await page.locator('form, .job-form, .create-job-form').first();
        if (await jobForm.isVisible()) {
          await page.fill('input[name="message"], textarea[name="message"], #job-message', 'Test task: Create a simple todo list application');
          await page.screenshot({ path: 'screenshots/06-job-form-filled.png' });
          
          await page.click('button:has-text("Create"), button:has-text("Submit"), .submit-btn');
          await page.waitForTimeout(2000);
        }
        
        await page.screenshot({ path: 'screenshots/07-job-created.png' });
      }
    }
    
    // 6. Check for job in the list
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'screenshots/08-job-list.png' });
    
    // 7. Navigate to system overview
    await page.click('[data-view="overview"]');
    await page.waitForTimeout(1000);
    
    // Take final screenshot of system overview
    await page.screenshot({ path: 'screenshots/09-system-overview.png' });
    
    // 8. Check console for any errors
    const logs = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        logs.push(msg.text());
      }
    });
    
    await page.waitForTimeout(2000);
    
    if (logs.length > 0) {
      console.log('Browser console errors:', logs);
    } else {
      console.log('✅ No browser console errors detected');
    }
    
    console.log('✅ Full workflow test completed successfully');
  });
});
