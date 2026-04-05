import { test, expect } from '@playwright/test';

test('basic navigation and form check', async ({ page }) => {
  // Login first
  await page.goto('http://localhost:3000/login');
  await page.click('button:has-text("Administrator")');

  // Wait for dashboard redirect
  await page.waitForTimeout(3000);
  await expect(page.locator('aside')).toBeVisible();

  // Go to Patients page
  await page.goto('http://localhost:3000/patients');
  await page.waitForTimeout(2000);

  // Try to open New Patient modal
  await page.getByText('Add Patient').first().click({ force: true });

  await expect(page.locator('h2')).toContainText(/Register New Patient/i);
  await page.getByRole('button', { name: /Cancel/i }).click({ force: true });

  // Go to Pharmacy
  await page.goto('http://localhost:3000/pharmacy');
  await page.waitForTimeout(1000);
  await page.click('button:has-text("Add Item")', { force: true });
  await expect(page.locator('h2')).toContainText('Add Inventory Item');
  await page.click('button:has-text("Cancel")');

  // Verify core clinical pages
  const clinicalPages = ['prescriptions', 'lab', 'discharge', 'opd-queue', 'emergency', 'ot'];
  for (const p of clinicalPages) {
    await page.goto(`http://localhost:3000/${p}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1').nth(0)).toContainText('MediCore');
  }

  // Verify operations pages
  const opsPages = ['wards', 'staff', 'pharmacy', 'assets', 'blood-bank', 'ambulance'];
  for (const p of opsPages) {
    await page.goto(`http://localhost:3000/${p}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1').nth(0)).toContainText('MediCore');
  }

  // Verify finance pages
  const financePages = ['billing', 'insurance', 'revenue', 'expenses'];
  for (const p of financePages) {
    await page.goto(`http://localhost:3000/${p}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1').nth(0)).toContainText('MediCore');
  }
});
