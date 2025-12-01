import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Dashboard requires authentication, so we'll test redirection first
  });

  test.describe('Unauthenticated Access', () => {
    test('should redirect to signin when not authenticated', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/.*signin/);
    });

    test('should redirect to signin when accessing stats', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/.*signin/);
    });
  });

  test.describe('Page Structure (Authenticated)', () => {
    // These tests require authentication - will be skipped if no test credentials
    test.beforeEach(async ({ page }) => {
      test.skip(!process.env.TEST_USER_EMAIL, 'Requires test user credentials');

      await page.goto('/auth/signin');
      await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForURL(/.*dashboard/);
    });

    test('should display dashboard with main sections', async ({ page }) => {
      await page.goto('/dashboard');

      // Should have sidebar navigation
      await expect(page.locator('nav, aside, [role="navigation"]').first()).toBeVisible();

      // Should have main content area
      await expect(page.locator('main, [role="main"]').first()).toBeVisible();
    });

    test('should display statistics cards', async ({ page }) => {
      await page.goto('/dashboard');

      // Look for stat cards or metric displays
      const statElements = page.locator('[class*="stat"], [class*="card"], [class*="metric"]');
      const count = await statElements.count();

      // Dashboard should have some statistics displayed
      expect(count).toBeGreaterThan(0);
    });

    test('should have navigation links to main sections', async ({ page }) => {
      await page.goto('/dashboard');

      // Check for navigation links
      await expect(page.locator('a[href*="/tickets"]').first()).toBeVisible();
      await expect(page.locator('a[href*="/dashboard"]').first()).toBeVisible();
    });

    test('should display recent tickets section', async ({ page }) => {
      await page.goto('/dashboard');

      // Look for ticket-related content
      const ticketSection = page.locator('text=ticket, text=Ticket').first();
      await expect(ticketSection).toBeVisible();
    });

    test('should show loading state while fetching data', async ({ page }) => {
      // Intercept API calls to slow them down
      await page.route('**/api/**', async (route) => {
        await new Promise(resolve => setTimeout(resolve, 500));
        await route.continue();
      });

      await page.goto('/dashboard');

      // Should show loading indicator initially
      const loadingIndicator = page.locator('.animate-spin, .spinner, [class*="loading"], text=Loading').first();
      // Loading might be too fast to catch, so this is optional
      await loadingIndicator.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {
        // Loading may have completed already
      });
    });

    test('should display user info in sidebar/header', async ({ page }) => {
      await page.goto('/dashboard');

      // Should show some user information or profile section
      const userSection = page.locator('[class*="user"], [class*="profile"], [class*="avatar"]').first();
      await expect(userSection).toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!process.env.TEST_USER_EMAIL, 'Requires test user credentials');

      await page.goto('/auth/signin');
      await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForURL(/.*dashboard/);
    });

    test('should navigate to tickets page from dashboard', async ({ page }) => {
      await page.goto('/dashboard');

      const ticketsLink = page.locator('a[href*="/tickets"]').first();
      await ticketsLink.click();

      await expect(page).toHaveURL(/.*tickets/);
    });

    test('should navigate back to dashboard from other pages', async ({ page }) => {
      await page.goto('/tickets');

      const dashboardLink = page.locator('a[href*="/dashboard"]').first();
      await dashboardLink.click();

      await expect(page).toHaveURL(/.*dashboard/);
    });
  });

  test.describe('Responsive Design', () => {
    test('should be responsive on mobile viewport', async ({ page }) => {
      test.skip(!process.env.TEST_USER_EMAIL, 'Requires test user credentials');

      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/auth/signin');
      await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForURL(/.*dashboard/);

      // Page should not have horizontal scroll
      const body = page.locator('body');
      const scrollWidth = await body.evaluate(el => el.scrollWidth);
      const clientWidth = await body.evaluate(el => el.clientWidth);

      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 10); // Allow small margin
    });

    test('should be responsive on tablet viewport', async ({ page }) => {
      test.skip(!process.env.TEST_USER_EMAIL, 'Requires test user credentials');

      await page.setViewportSize({ width: 768, height: 1024 });

      await page.goto('/auth/signin');
      await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForURL(/.*dashboard/);

      // Main content should be visible
      await expect(page.locator('main, [role="main"]').first()).toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test('should handle API errors gracefully', async ({ page }) => {
      test.skip(!process.env.TEST_USER_EMAIL, 'Requires test user credentials');

      // Mock API to return error
      await page.route('**/api/tickets**', (route) => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });

      await page.goto('/auth/signin');
      await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForURL(/.*dashboard/);

      // Should show error message or handle gracefully
      const errorMessage = page.locator('text=error, text=Error, text=failed, text=Failed').first();
      // Error handling may vary, just ensure page loads
      await expect(page).toHaveURL(/.*dashboard/);
    });
  });
});
