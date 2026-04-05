import { test, expect } from '@playwright/test';
import fs from 'fs';

test('verify phase 2 modules', async ({ page }) => {
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

  const modules = [
    { name: 'ot', path: '/ot' },
    { name: 'emergency', path: '/emergency' },
    { name: 'blood-bank', path: '/blood-bank' },
    { name: 'ambulance', path: '/ambulance' },
    { name: 'expenses', path: '/expenses' }
  ];

  for (const mod of modules) {
    console.log(`Verifying module: ${mod.name}`);
    await page.goto(`http://localhost:3000${mod.path}`);
    // Wait for content to load
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `test-results/${mod.name}_mocked.png`, fullPage: true });

    // Check for common elements like headers or "New" buttons
    const h1 = await page.locator('main h1').first().textContent();
    console.log(`${mod.name} header: ${h1}`);
  }
});
