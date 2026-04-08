# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: playwright/verify_sharing.spec.ts >> verify digital documents and sharing
- Location: playwright/verify_sharing.spec.ts:17:5

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
Call log:
  - navigating to "http://localhost:3002/prescriptions", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  |
  3  | test.beforeEach(async ({ page }) => {
  4  |     await page.goto('http://localhost:3002/login');
  5  |     await page.evaluate(() => {
  6  |         const authData = {
  7  |             state: {
  8  |                 user: { id: 1, username: 'admin', role: 'Admin', full_name: 'Administrator' },
  9  |                 isAuthenticated: true
  10 |             },
  11 |             version: 0
  12 |         };
  13 |         localStorage.setItem('medicore-store', JSON.stringify(authData));
  14 |     });
  15 | });
  16 |
  17 | test('verify digital documents and sharing', async ({ page }) => {
  18 |     // 1. Prescriptions page
> 19 |     await page.goto('http://localhost:3002/prescriptions');
     |                ^ Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
  20 |     await page.waitForLoadState('networkidle');
  21 |     await expect(page.locator('button[title="Download / Print PDF"]')).toBeVisible();
  22 |     await expect(page.locator('button[title="Share via WhatsApp"]')).toBeVisible();
  23 |     await page.screenshot({ path: 'verification_results/prescriptions_sharing.png' });
  24 |
  25 |     // 2. Billing page
  26 |     await page.goto('http://localhost:3002/billing');
  27 |     await page.waitForLoadState('networkidle');
  28 |     await expect(page.locator('button[title="Download / Print PDF"]')).toBeVisible();
  29 |     await expect(page.locator('button[title="Share via WhatsApp"]')).toBeVisible();
  30 |     await page.screenshot({ path: 'verification_results/billing_sharing.png' });
  31 |
  32 |     // 3. Discharge page
  33 |     await page.goto('http://localhost:3002/discharge');
  34 |     await page.waitForLoadState('networkidle');
  35 |     await expect(page.locator('button[title="Download / Print PDF"]')).toBeVisible();
  36 |     await expect(page.locator('button[title="Share via WhatsApp"]')).toBeVisible();
  37 |     await page.screenshot({ path: 'verification_results/discharge_sharing.png' });
  38 |
  39 |     // 4. Lab page
  40 |     await page.goto('http://localhost:3002/lab');
  41 |     await page.waitForLoadState('networkidle');
  42 |     await expect(page.locator('button[title="Share via WhatsApp"]')).toBeVisible();
  43 |     await page.screenshot({ path: 'verification_results/lab_sharing.png' });
  44 | });
  45 |
```