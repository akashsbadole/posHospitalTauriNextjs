import { test, expect } from '@playwright/test';

test('verify patient workflow', async ({ page }) => {
  // Mock session
  await page.addInitScript(() => {
    window.localStorage.setItem('medicore-store', JSON.stringify({
      state: {
        authUser: {
          id: 1,
          username: 'admin',
          role: 'Admin',
          full_name: 'Administrator'
        },
        isAuthenticated: true,
        sidebarCollapsed: false,
        lastSync: null
      },
      version: 0
    }));
  });

  // 1. Check OPD Queue Actions
  await page.goto('http://localhost:3000/opd-queue');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/opd_queue_v2.png', fullPage: true });

  // Verify Generate Token modal
  await page.click('button:has-text("Generate Token")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/opd_generate_token_modal.png' });
  await page.click('button:has-text("Cancel")');

  // 2. Check Patient Detail Actions
  // Assuming patient ID 1 exists from seed data or previous runs
  await page.goto('http://localhost:3000/patients/1');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/patient_detail_v2.png', fullPage: true });

  // 3. Check Billing Charge Aggregation
  await page.goto('http://localhost:3000/billing');
  await page.waitForTimeout(1000);
  await page.click('button:has-text("New Invoice")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/billing_new_invoice_modal.png' });
});
