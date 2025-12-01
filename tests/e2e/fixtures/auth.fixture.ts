// Authentication fixture for E2E tests
import { test as base, Page } from '@playwright/test';
import { testUsers } from './test-data';

// Extend the base test with authentication helpers
export const test = base.extend<{
  authenticatedPage: Page;
  adminPage: Page;
}>({
  // A page that's already authenticated as a regular user
  authenticatedPage: async ({ page }, use) => {
    await loginAsUser(page, testUsers.agent.email, testUsers.agent.password);
    await use(page);
  },

  // A page that's already authenticated as admin
  adminPage: async ({ page }, use) => {
    await loginAsUser(page, testUsers.admin.email, testUsers.admin.password);
    await use(page);
  },
});

export async function loginAsUser(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/auth/signin');

  // Wait for the form to be ready
  await page.waitForSelector('input[type="email"]', { state: 'visible' });

  // Fill in credentials
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  // Submit the form
  await page.click('button[type="submit"]');

  // Wait for navigation to complete (either dashboard or error)
  await page.waitForURL(/\/(dashboard|auth)/, { timeout: 10000 });
}

export async function logout(page: Page): Promise<void> {
  // Look for logout button/link in navigation
  const logoutButton = page.locator('button:has-text("Sign Out"), a:has-text("Sign Out"), button:has-text("Logout"), a:has-text("Logout")');

  if (await logoutButton.isVisible()) {
    await logoutButton.click();
    await page.waitForURL(/.*signin/);
  }
}

export async function isAuthenticated(page: Page): Promise<boolean> {
  // Check if we're on an authenticated page or if we have session indicators
  const url = page.url();
  return !url.includes('/auth/signin') && !url.includes('/auth/register');
}

export { expect } from '@playwright/test';
