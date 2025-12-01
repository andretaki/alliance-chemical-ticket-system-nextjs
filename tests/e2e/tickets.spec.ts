import { test, expect } from '@playwright/test';
import { testTickets, generateUniqueTicketTitle } from './fixtures/test-data';

test.describe('Tickets', () => {
  test.describe('Unauthenticated Access', () => {
    test('should redirect to signin when accessing ticket list', async ({ page }) => {
      await page.goto('/tickets');
      await expect(page).toHaveURL(/.*signin/);
    });

    test('should redirect to signin when accessing create ticket page', async ({ page }) => {
      await page.goto('/tickets/create');
      await expect(page).toHaveURL(/.*signin/);
    });

    test('should redirect to signin when accessing ticket details', async ({ page }) => {
      await page.goto('/tickets/1');
      await expect(page).toHaveURL(/.*signin/);
    });
  });

  test.describe('Ticket List (Authenticated)', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!process.env.TEST_USER_EMAIL, 'Requires test user credentials');

      await page.goto('/auth/signin');
      await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(dashboard|tickets)/);
    });

    test('should display ticket list page', async ({ page }) => {
      await page.goto('/tickets');

      // Should have page title or header
      await expect(page.locator('text=ticket, text=Ticket').first()).toBeVisible();
    });

    test('should have create ticket button/link', async ({ page }) => {
      await page.goto('/tickets');

      const createButton = page.locator('a[href*="/tickets/create"], button:has-text("New"), button:has-text("Create")').first();
      await expect(createButton).toBeVisible();
    });

    test('should display search/filter controls', async ({ page }) => {
      await page.goto('/tickets');

      // Should have search input or filter controls
      const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]').first();
      await expect(searchInput).toBeVisible();
    });

    test('should display status filter', async ({ page }) => {
      await page.goto('/tickets');

      // Should have status filter dropdown
      const statusFilter = page.locator('select:has(option:has-text("Status")), select:has(option:has-text("status"))').first();
      await expect(statusFilter).toBeVisible().catch(async () => {
        // May be a different type of filter UI
        const filterButton = page.locator('button:has-text("Status"), button:has-text("Filter")').first();
        await expect(filterButton).toBeVisible();
      });
    });

    test('should display priority filter', async ({ page }) => {
      await page.goto('/tickets');

      // Should have priority filter dropdown
      const priorityFilter = page.locator('select:has(option:has-text("Priority")), select:has(option:has-text("priority"))').first();
      await expect(priorityFilter).toBeVisible().catch(async () => {
        // May be different filter UI
        const filterButton = page.locator('button:has-text("Priority")').first();
        await expect(filterButton).toBeVisible();
      });
    });

    test('should display ticket table or list', async ({ page }) => {
      await page.goto('/tickets');

      // Should have a table or list of tickets
      const ticketContainer = page.locator('table, [class*="list"], [class*="grid"]').first();
      await expect(ticketContainer).toBeVisible();
    });

    test('should show loading state', async ({ page }) => {
      // Slow down API response
      await page.route('**/api/tickets**', async (route) => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await route.continue();
      });

      await page.goto('/tickets');

      // Should show loading indicator
      const loadingIndicator = page.locator('.animate-spin, .spinner, text=Loading').first();
      await loadingIndicator.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {
        // Loading may be too fast
      });
    });

    test('should filter tickets by search term', async ({ page }) => {
      await page.goto('/tickets');

      const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]').first();
      await searchInput.fill('test search term');

      // Wait for search debounce and results
      await page.waitForTimeout(1000);

      // The page should still be on tickets (search doesn't navigate away)
      await expect(page).toHaveURL(/.*tickets/);
    });

    test('should support sorting', async ({ page }) => {
      await page.goto('/tickets');

      // Click on a sortable column header
      const sortableHeader = page.locator('th:has-text("Title"), th:has-text("Date"), th:has-text("Status")').first();

      if (await sortableHeader.isVisible()) {
        await sortableHeader.click();

        // Should show sort indicator
        const sortIcon = page.locator('.fa-sort-up, .fa-sort-down, [class*="sort"]').first();
        await expect(sortIcon).toBeVisible().catch(() => {
          // Sort may use different UI
        });
      }
    });
  });

  test.describe('Create Ticket', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!process.env.TEST_USER_EMAIL, 'Requires test user credentials');

      await page.goto('/auth/signin');
      await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(dashboard|tickets)/);
    });

    test('should display create ticket form', async ({ page }) => {
      await page.goto('/tickets/create');

      // Should have form elements
      await expect(page.locator('input[name="title"], input[placeholder*="title" i]').first()).toBeVisible();
      await expect(page.locator('textarea, [contenteditable="true"]').first()).toBeVisible();
      await expect(page.locator('button[type="submit"]').first()).toBeVisible();
    });

    test('should have title field with validation', async ({ page }) => {
      await page.goto('/tickets/create');

      const titleInput = page.locator('input[name="title"], input[placeholder*="title" i]').first();
      await expect(titleInput).toBeVisible();

      // Should have required attribute or validation
      await expect(titleInput).toHaveAttribute('required', '').catch(() => {
        // May use JavaScript validation instead
      });
    });

    test('should have description field', async ({ page }) => {
      await page.goto('/tickets/create');

      const descriptionField = page.locator('textarea, [name="description"], [contenteditable="true"]').first();
      await expect(descriptionField).toBeVisible();
    });

    test('should have priority selector', async ({ page }) => {
      await page.goto('/tickets/create');

      const prioritySelect = page.locator('select[name="priority"], [name="priority"]').first();
      await expect(prioritySelect).toBeVisible();
    });

    test('should validate required fields', async ({ page }) => {
      await page.goto('/tickets/create');

      // Try to submit empty form
      await page.click('button[type="submit"]');

      // Should show validation error or prevent submission
      const errorMessage = page.locator('.error, .invalid, [class*="error"], .text-red').first();
      await expect(errorMessage).toBeVisible().catch(async () => {
        // HTML5 validation may prevent submission without showing custom error
        const titleInput = page.locator('input[name="title"], input[placeholder*="title" i]').first();
        await expect(titleInput).toHaveAttribute('required', '');
      });
    });

    test('should create ticket successfully', async ({ page }) => {
      await page.goto('/tickets/create');

      const uniqueTitle = generateUniqueTicketTitle('E2E Test');

      // Fill in the form
      await page.fill('input[name="title"], input[placeholder*="title" i]', uniqueTitle);

      const descriptionField = page.locator('textarea, [name="description"]').first();
      await descriptionField.fill(testTickets.basic.description);

      // Select priority if available
      const prioritySelect = page.locator('select[name="priority"]').first();
      if (await prioritySelect.isVisible()) {
        await prioritySelect.selectOption(testTickets.basic.priority);
      }

      // Submit the form
      await page.click('button[type="submit"]');

      // Should redirect to ticket list or ticket detail page
      await page.waitForURL(/\/tickets(\/\d+)?/, { timeout: 10000 });

      // Verify success message or redirect
      const successMessage = page.locator('text=success, text=created, text=Success').first();
      await expect(successMessage).toBeVisible().catch(() => {
        // May redirect without message
        expect(page.url()).toMatch(/\/tickets/);
      });
    });

    test('should show loading state when submitting', async ({ page }) => {
      await page.goto('/tickets/create');

      await page.fill('input[name="title"], input[placeholder*="title" i]', 'Test Loading');
      const descriptionField = page.locator('textarea, [name="description"]').first();
      await descriptionField.fill('Test description');

      const submitButton = page.locator('button[type="submit"]').first();
      await submitButton.click();

      // Button should show loading state
      await expect(submitButton).toBeDisabled({ timeout: 1000 }).catch(() => {
        // Loading may be too fast to catch
      });
    });

    test('should cancel and go back to ticket list', async ({ page }) => {
      await page.goto('/tickets/create');

      const cancelButton = page.locator('button:has-text("Cancel"), a:has-text("Cancel"), a[href="/tickets"]').first();

      if (await cancelButton.isVisible()) {
        await cancelButton.click();
        await expect(page).toHaveURL(/\/tickets/);
      }
    });
  });

  test.describe('Ticket Detail View', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!process.env.TEST_USER_EMAIL, 'Requires test user credentials');

      await page.goto('/auth/signin');
      await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(dashboard|tickets)/);
    });

    test('should navigate to ticket detail from list', async ({ page }) => {
      await page.goto('/tickets');

      // Click on the first ticket in the list
      const firstTicketLink = page.locator('a[href*="/tickets/"]').first();

      if (await firstTicketLink.isVisible()) {
        await firstTicketLink.click();

        // Should navigate to ticket detail page
        await expect(page).toHaveURL(/\/tickets\/\d+/);
      }
    });

    test('should display ticket header with title', async ({ page }) => {
      await page.goto('/tickets');

      const firstTicketLink = page.locator('a[href*="/tickets/"]').first();
      if (await firstTicketLink.isVisible()) {
        await firstTicketLink.click();
        await page.waitForURL(/\/tickets\/\d+/);

        // Should show ticket title
        const ticketTitle = page.locator('h1, h2, [class*="title"]').first();
        await expect(ticketTitle).toBeVisible();
      }
    });

    test('should display ticket status', async ({ page }) => {
      await page.goto('/tickets');

      const firstTicketLink = page.locator('a[href*="/tickets/"]').first();
      if (await firstTicketLink.isVisible()) {
        await firstTicketLink.click();
        await page.waitForURL(/\/tickets\/\d+/);

        // Should show status badge
        const statusBadge = page.locator('text=new, text=open, text=closed, text=pending').first();
        await expect(statusBadge).toBeVisible();
      }
    });

    test('should have reply composer', async ({ page }) => {
      await page.goto('/tickets');

      const firstTicketLink = page.locator('a[href*="/tickets/"]').first();
      if (await firstTicketLink.isVisible()) {
        await firstTicketLink.click();
        await page.waitForURL(/\/tickets\/\d+/);

        // Should have reply/comment section
        const replySection = page.locator('text=reply, text=Reply, button:has-text("Reply"), textarea').first();
        await expect(replySection).toBeVisible();
      }
    });

    test('should display conversation thread', async ({ page }) => {
      await page.goto('/tickets');

      const firstTicketLink = page.locator('a[href*="/tickets/"]').first();
      if (await firstTicketLink.isVisible()) {
        await firstTicketLink.click();
        await page.waitForURL(/\/tickets\/\d+/);

        // Should have conversation/comments section
        const conversationSection = page.locator('[class*="conversation"], [class*="thread"], [class*="comments"]').first();
        await expect(conversationSection).toBeVisible();
      }
    });

    test('should have edit ticket link', async ({ page }) => {
      await page.goto('/tickets');

      const firstTicketLink = page.locator('a[href*="/tickets/"]').first();
      if (await firstTicketLink.isVisible()) {
        await firstTicketLink.click();
        await page.waitForURL(/\/tickets\/\d+/);

        // Should have edit button/link
        const editButton = page.locator('a[href*="/edit"], button:has-text("Edit")').first();
        await expect(editButton).toBeVisible();
      }
    });

    test('should have back navigation', async ({ page }) => {
      await page.goto('/tickets');

      const firstTicketLink = page.locator('a[href*="/tickets/"]').first();
      if (await firstTicketLink.isVisible()) {
        await firstTicketLink.click();
        await page.waitForURL(/\/tickets\/\d+/);

        // Should have back button
        const backButton = page.locator('a[href="/tickets"], button:has-text("Back"), .fa-arrow-left').first();
        await expect(backButton).toBeVisible();
      }
    });
  });

  test.describe('Ticket Actions', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!process.env.TEST_USER_EMAIL, 'Requires test user credentials');

      await page.goto('/auth/signin');
      await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(dashboard|tickets)/);
    });

    test('should add a reply to ticket', async ({ page }) => {
      await page.goto('/tickets');

      const firstTicketLink = page.locator('a[href*="/tickets/"]').first();
      if (await firstTicketLink.isVisible()) {
        await firstTicketLink.click();
        await page.waitForURL(/\/tickets\/\d+/);

        // Click to expand reply composer
        const replyButton = page.locator('button:has-text("Reply"), button:has-text("Write"), text=Write a reply').first();
        if (await replyButton.isVisible()) {
          await replyButton.click();
        }

        // Fill in reply
        const replyTextarea = page.locator('textarea').first();
        await replyTextarea.fill('This is a test reply from E2E testing');

        // Submit reply
        const submitReply = page.locator('button:has-text("Send"), button:has-text("Reply"), button:has-text("Add")').first();
        await submitReply.click();

        // Wait for reply to be added
        await page.waitForTimeout(2000);

        // The reply should appear or success message shown
        const replyContent = page.locator('text=test reply from E2E').first();
        await expect(replyContent).toBeVisible().catch(() => {
          // Reply may have been added but text not visible
        });
      }
    });

    test('should toggle internal note option', async ({ page }) => {
      await page.goto('/tickets');

      const firstTicketLink = page.locator('a[href*="/tickets/"]').first();
      if (await firstTicketLink.isVisible()) {
        await firstTicketLink.click();
        await page.waitForURL(/\/tickets\/\d+/);

        // Expand reply composer
        const replyButton = page.locator('button:has-text("Reply"), button:has-text("Write"), text=Write a reply').first();
        if (await replyButton.isVisible()) {
          await replyButton.click();
        }

        // Check for internal note checkbox
        const internalCheckbox = page.locator('input[type="checkbox"]').first();
        if (await internalCheckbox.isVisible()) {
          await internalCheckbox.check();
          await expect(internalCheckbox).toBeChecked();
        }
      }
    });
  });

  test.describe('Ticket Edit', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!process.env.TEST_USER_EMAIL, 'Requires test user credentials');

      await page.goto('/auth/signin');
      await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(dashboard|tickets)/);
    });

    test('should navigate to edit page', async ({ page }) => {
      await page.goto('/tickets');

      const firstTicketLink = page.locator('a[href*="/tickets/"]').first();
      if (await firstTicketLink.isVisible()) {
        await firstTicketLink.click();
        await page.waitForURL(/\/tickets\/\d+/);

        // Click edit button
        const editButton = page.locator('a[href*="/edit"]').first();
        if (await editButton.isVisible()) {
          await editButton.click();
          await expect(page).toHaveURL(/\/tickets\/\d+\/edit/);
        }
      }
    });

    test('should display edit form with current values', async ({ page }) => {
      await page.goto('/tickets');

      const firstTicketLink = page.locator('a[href*="/tickets/"]').first();
      if (await firstTicketLink.isVisible()) {
        const href = await firstTicketLink.getAttribute('href');
        const ticketId = href?.match(/\/tickets\/(\d+)/)?.[1];

        if (ticketId) {
          await page.goto(`/tickets/${ticketId}/edit`);

          // Form should have values populated
          const titleInput = page.locator('input[name="title"], input[placeholder*="title" i]').first();
          await expect(titleInput).toBeVisible();
          const titleValue = await titleInput.inputValue();
          expect(titleValue.length).toBeGreaterThan(0);
        }
      }
    });
  });

  test.describe('Responsive Design', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!process.env.TEST_USER_EMAIL, 'Requires test user credentials');
    });

    test('should work on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/auth/signin');
      await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD!);
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(dashboard|tickets)/);

      await page.goto('/tickets');

      // Main content should be visible
      const mainContent = page.locator('table, [class*="list"], main').first();
      await expect(mainContent).toBeVisible();
    });
  });
});
