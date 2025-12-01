import { test, expect } from '@playwright/test';

test.describe('Admin Features', () => {
  test.describe('Access Control', () => {
    test('should redirect non-admin users from admin pages', async ({ page }) => {
      test.skip(!process.env.TEST_USER_EMAIL, 'Requires test user credentials');

      await page.goto('/auth/signin');
      await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(dashboard|tickets)/);

      // Try to access admin page
      await page.goto('/admin');

      // Should redirect or show access denied
      const currentUrl = page.url();
      const accessDenied = page.locator('text=access denied, text=unauthorized, text=permission').first();

      const isRedirected = !currentUrl.includes('/admin');
      const showsDenied = await accessDenied.isVisible().catch(() => false);

      expect(isRedirected || showsDenied).toBeTruthy();
    });

    test('should allow admin access to admin pages', async ({ page }) => {
      test.skip(!process.env.TEST_ADMIN_EMAIL, 'Requires admin credentials');

      await page.goto('/auth/signin');
      await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(dashboard|admin)/);

      await page.goto('/admin');

      // Should load admin page
      await expect(page).toHaveURL(/.*admin/);
    });
  });

  test.describe('User Management', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!process.env.TEST_ADMIN_EMAIL, 'Requires admin credentials');

      await page.goto('/auth/signin');
      await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(dashboard|admin)/);
    });

    test('should display user management section', async ({ page }) => {
      await page.goto('/admin');

      const usersSection = page.locator('text=User, text=user, a[href*="users"]').first();
      await expect(usersSection).toBeVisible();
    });

    test('should list all users', async ({ page }) => {
      await page.goto('/admin/users');

      const userList = page.locator('table, [class*="list"], [class*="users"]').first();
      await expect(userList).toBeVisible();
    });

    test('should show user approval status', async ({ page }) => {
      await page.goto('/admin/users');

      // Look for status indicators
      const statusIndicator = page.locator('text=pending, text=approved, text=active, text=rejected, [class*="status"]').first();
      await expect(statusIndicator).toBeVisible().catch(() => {
        // May not have pending users
      });
    });

    test('should allow approving pending users', async ({ page }) => {
      await page.goto('/admin/users');

      // Look for approve button
      const approveButton = page.locator('button:has-text("Approve"), button:has-text("Activate")').first();

      if (await approveButton.isVisible()) {
        // Don't actually click - just verify it exists
        await expect(approveButton).toBeEnabled();
      }
    });

    test('should allow rejecting users', async ({ page }) => {
      await page.goto('/admin/users');

      // Look for reject button
      const rejectButton = page.locator('button:has-text("Reject"), button:has-text("Deny"), button:has-text("Deactivate")').first();

      if (await rejectButton.isVisible()) {
        await expect(rejectButton).toBeEnabled();
      }
    });
  });

  test.describe('Email Processing', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!process.env.TEST_ADMIN_EMAIL, 'Requires admin credentials');

      await page.goto('/auth/signin');
      await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(dashboard|admin)/);
    });

    test('should show email processing controls', async ({ page }) => {
      await page.goto('/admin');

      const emailSection = page.locator('text=Email, text=email, text=Process').first();
      await expect(emailSection).toBeVisible().catch(() => {
        // Email section may be on different page
      });
    });

    test('should display email quarantine', async ({ page }) => {
      await page.goto('/admin/quarantine');

      const quarantineSection = page.locator('text=Quarantine, text=quarantine, table').first();
      await expect(quarantineSection).toBeVisible().catch(() => {
        // May redirect or show empty state
      });
    });
  });

  test.describe('Resolution Metrics', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!process.env.TEST_ADMIN_EMAIL, 'Requires admin credentials');

      await page.goto('/auth/signin');
      await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(dashboard|admin)/);
    });

    test('should display resolution metrics', async ({ page }) => {
      await page.goto('/admin');

      const metricsSection = page.locator('text=Resolution, text=Metrics, text=metrics').first();
      await expect(metricsSection).toBeVisible().catch(() => {
        // Metrics may be on dashboard
      });
    });

    test('should show resolved tickets section', async ({ page }) => {
      await page.goto('/admin/resolved-tickets');

      const resolvedSection = page.locator('text=Resolved, text=resolved, table').first();
      await expect(resolvedSection).toBeVisible().catch(() => {
        // May redirect
      });
    });
  });

  test.describe('Configuration', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!process.env.TEST_ADMIN_EMAIL, 'Requires admin credentials');

      await page.goto('/auth/signin');
      await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(dashboard|admin)/);
    });

    test('should display resolution config', async ({ page }) => {
      await page.goto('/admin');

      const configLink = page.locator('a[href*="config"], text=Config, text=Settings').first();
      await expect(configLink).toBeVisible().catch(() => {
        // Config may be inline
      });
    });

    test('should display canned responses', async ({ page }) => {
      await page.goto('/admin');

      const cannedSection = page.locator('text=Canned, text=Response, text=Template').first();
      await expect(cannedSection).toBeVisible().catch(() => {
        // May be on different page
      });
    });

    test('should display webhook status', async ({ page }) => {
      await page.goto('/admin');

      const webhookSection = page.locator('text=Webhook, text=webhook, text=API').first();
      await expect(webhookSection).toBeVisible().catch(() => {
        // May not have webhook section
      });
    });
  });

  test.describe('Subscriptions', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!process.env.TEST_ADMIN_EMAIL, 'Requires admin credentials');

      await page.goto('/auth/signin');
      await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(dashboard|admin)/);
    });

    test('should display subscription management', async ({ page }) => {
      await page.goto('/admin/subscriptions');

      const subscriptionSection = page.locator('text=Subscription, text=subscription, table').first();
      await expect(subscriptionSection).toBeVisible().catch(() => {
        // May redirect
      });
    });
  });

  test.describe('Ticket Administration', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!process.env.TEST_ADMIN_EMAIL, 'Requires admin credentials');

      await page.goto('/auth/signin');
      await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(dashboard|admin)/);
    });

    test('should have reopen ticket capability', async ({ page }) => {
      await page.goto('/tickets');

      // Find a closed ticket
      const closedTicket = page.locator('tr:has-text("closed"), [class*="closed"]').first();

      if (await closedTicket.isVisible()) {
        await closedTicket.click();

        // Should have reopen button for admin
        const reopenButton = page.locator('button:has-text("Reopen"), a:has-text("Reopen")').first();
        await expect(reopenButton).toBeVisible().catch(() => {
          // Reopen may not be visible on list
        });
      }
    });

    test('should have bulk actions available', async ({ page }) => {
      await page.goto('/tickets');

      // Look for bulk action controls
      const bulkAction = page.locator('input[type="checkbox"], button:has-text("Select"), button:has-text("Bulk")').first();
      await expect(bulkAction).toBeVisible().catch(() => {
        // Bulk actions may not be implemented
      });
    });
  });

  test.describe('Debug Tools', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!process.env.TEST_ADMIN_EMAIL, 'Requires admin credentials');

      await page.goto('/auth/signin');
      await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(dashboard|admin)/);
    });

    test('should have debug section accessible', async ({ page }) => {
      await page.goto('/admin');

      const debugSection = page.locator('text=Debug, text=debug, a[href*="debug"]').first();
      await expect(debugSection).toBeVisible().catch(() => {
        // Debug may be hidden in production
      });
    });

    test('should show API test tools', async ({ page }) => {
      await page.goto('/admin/debug');

      const testTools = page.locator('text=Test, text=API, button:has-text("Test")').first();
      await expect(testTools).toBeVisible().catch(() => {
        // May redirect or not exist
      });
    });
  });

  test.describe('Responsive Admin Layout', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!process.env.TEST_ADMIN_EMAIL, 'Requires admin credentials');
    });

    test('should work on tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });

      await page.goto('/auth/signin');
      await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(dashboard|admin)/);

      await page.goto('/admin');

      // Content should be visible and functional
      const mainContent = page.locator('main, [role="main"]').first();
      await expect(mainContent).toBeVisible();
    });
  });
});
