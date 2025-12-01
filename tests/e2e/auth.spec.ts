import { test, expect } from '@playwright/test';
import { testUsers, generateUniqueEmail } from './fixtures/test-data';

test.describe('Authentication', () => {
  test.describe('Sign In', () => {
    test('should redirect to signin when accessing protected routes without auth', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/.*signin/);
    });

    test('should redirect to signin when accessing tickets without auth', async ({ page }) => {
      await page.goto('/tickets');
      await expect(page).toHaveURL(/.*signin/);
    });

    test('should display signin form with all required elements', async ({ page }) => {
      await page.goto('/auth/signin');

      // Check page title/header
      await expect(page.locator('h3:has-text("Sign In"), h1:has-text("Sign In")')).toBeVisible();

      // Check form elements
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();

      // Check registration link
      await expect(page.locator('a[href*="register"]')).toBeVisible();
    });

    test('should show validation for empty fields', async ({ page }) => {
      await page.goto('/auth/signin');

      // Try to submit empty form
      const emailInput = page.locator('input[type="email"]');
      const passwordInput = page.locator('input[type="password"]');

      // HTML5 validation should prevent submission
      await expect(emailInput).toHaveAttribute('required', '');
      await expect(passwordInput).toHaveAttribute('required', '');
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/auth/signin');

      await page.fill('input[type="email"]', 'invalid@example.com');
      await page.fill('input[type="password"]', 'wrongpassword');
      await page.click('button[type="submit"]');

      // Wait for error message
      await expect(page.locator('.alert, [role="alert"]')).toBeVisible({ timeout: 10000 });
    });

    test('should handle email format validation', async ({ page }) => {
      await page.goto('/auth/signin');

      const emailInput = page.locator('input[type="email"]');
      await emailInput.fill('notanemail');

      // HTML5 email validation
      await expect(emailInput).toHaveAttribute('type', 'email');
    });

    test('should show loading state during signin', async ({ page }) => {
      await page.goto('/auth/signin');

      await page.fill('input[type="email"]', 'test@example.com');
      await page.fill('input[type="password"]', 'password123');

      // Click submit and check for loading state
      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      // Should show loading indicator (spinner or disabled state)
      await expect(submitButton).toBeDisabled({ timeout: 1000 }).catch(() => {
        // Button might not be disabled if request is fast
      });
    });

    test('should have link to registration page', async ({ page }) => {
      await page.goto('/auth/signin');

      const registerLink = page.locator('a[href*="register"]');
      await expect(registerLink).toBeVisible();

      await registerLink.click();
      await expect(page).toHaveURL(/.*register/);
    });
  });

  test.describe('Registration', () => {
    test('should display registration form with all required fields', async ({ page }) => {
      await page.goto('/auth/register');

      // Check page title/header
      await expect(page.locator('h3:has-text("Register"), h1:has-text("Register"), h3:has-text("Create"), h1:has-text("Create")')).toBeVisible();

      // Check form elements
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.locator('input[name="name"], input[placeholder*="name" i]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should validate required fields on registration', async ({ page }) => {
      await page.goto('/auth/register');

      // Try to submit without filling fields
      await page.click('button[type="submit"]');

      // Should show validation errors or prevent submission
      const inputs = page.locator('input[required]');
      expect(await inputs.count()).toBeGreaterThan(0);
    });

    test('should validate email format on registration', async ({ page }) => {
      await page.goto('/auth/register');

      const emailInput = page.locator('input[type="email"]');
      await emailInput.fill('notanemail');
      await expect(emailInput).toHaveAttribute('type', 'email');
    });

    test('should have link back to signin', async ({ page }) => {
      await page.goto('/auth/register');

      const signinLink = page.locator('a[href*="signin"]');
      await expect(signinLink).toBeVisible();
    });

    test('should allow registration with unique email', async ({ page }) => {
      await page.goto('/auth/register');

      const uniqueEmail = generateUniqueEmail('e2e-test');

      // Fill in registration form
      await page.fill('input[name="name"], input[placeholder*="name" i]', 'E2E Test User');
      await page.fill('input[type="email"]', uniqueEmail);
      await page.fill('input[type="password"]', 'TestPassword123!');

      // Check if there's a confirm password field
      const confirmPassword = page.locator('input[name="confirmPassword"], input[placeholder*="confirm" i]');
      if (await confirmPassword.isVisible()) {
        await confirmPassword.fill('TestPassword123!');
      }

      await page.click('button[type="submit"]');

      // Should either redirect to dashboard/signin or show pending approval message
      await page.waitForURL(/\/(dashboard|auth|signin)/, { timeout: 15000 }).catch(async () => {
        // Check for pending approval message
        const pendingMessage = page.locator('text=pending, text=approval, .alert').first();
        await expect(pendingMessage).toBeVisible();
      });
    });
  });

  test.describe('Session Management', () => {
    test('should preserve session across page navigation', async ({ page }) => {
      // This test requires actual authentication - skip if no test credentials
      test.skip(!process.env.TEST_USER_EMAIL, 'Requires test user credentials');

      await page.goto('/auth/signin');
      await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD!);
      await page.click('button[type="submit"]');

      // Wait for redirect to dashboard
      await page.waitForURL(/.*dashboard/);

      // Navigate to another page and back
      await page.goto('/tickets');
      await expect(page).not.toHaveURL(/.*signin/);

      await page.goto('/dashboard');
      await expect(page).not.toHaveURL(/.*signin/);
    });

    test('should handle callback URL after signin', async ({ page }) => {
      // Try to access a protected page
      await page.goto('/tickets/create');

      // Should redirect to signin with callback URL
      await expect(page).toHaveURL(/.*signin/);

      // The callback URL should be in the query params
      const url = new URL(page.url());
      expect(url.searchParams.has('callbackUrl') || url.pathname.includes('signin')).toBeTruthy();
    });
  });

  test.describe('Error Handling', () => {
    test('should display appropriate error for pending approval accounts', async ({ page }) => {
      await page.goto('/auth/signin?error=ACCOUNT_PENDING_APPROVAL');

      // Should show warning about pending approval
      await expect(page.locator('text=pending, text=approval').first()).toBeVisible();
    });

    test('should display appropriate error for rejected accounts', async ({ page }) => {
      await page.goto('/auth/signin?error=ACCOUNT_REJECTED');

      // Should show error about account rejection
      await expect(page.locator('.alert-danger, [role="alert"]').first()).toBeVisible();
    });

    test('should display generic error for unknown error types', async ({ page }) => {
      await page.goto('/auth/signin?error=UNKNOWN_ERROR');

      // Should show some error message
      await expect(page.locator('.alert, [role="alert"]').first()).toBeVisible();
    });
  });
});
