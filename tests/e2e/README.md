# E2E Tests

End-to-end tests for the Alliance Chemical Ticket System using Playwright.

## Setup

### Prerequisites

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install
```

### Environment Variables

Create a `.env.test` file or set environment variables for authenticated tests:

```bash
# Regular user credentials for standard E2E tests
TEST_USER_EMAIL=your-test-user@example.com
TEST_USER_PASSWORD=your-test-password

# Admin credentials for admin feature tests
TEST_ADMIN_EMAIL=your-admin@example.com
TEST_ADMIN_PASSWORD=your-admin-password
```

Tests that require authentication will be skipped if these variables are not set.

## Running Tests

### Run all E2E tests
```bash
npx playwright test
```

### Run specific test file
```bash
npx playwright test auth.spec.ts
npx playwright test tickets.spec.ts
npx playwright test dashboard.spec.ts
npx playwright test customers.spec.ts
npx playwright test admin.spec.ts
```

### Run in headed mode (see browser)
```bash
npx playwright test --headed
```

### Run specific browser
```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

### Run with UI mode
```bash
npx playwright test --ui
```

### Debug mode
```bash
npx playwright test --debug
```

### View test report
```bash
npx playwright show-report
```

## Test Structure

```
tests/e2e/
├── fixtures/
│   ├── test-data.ts       # Test data constants and generators
│   └── auth.fixture.ts    # Authentication helpers
├── auth.spec.ts           # Authentication tests (signin, register, session)
├── dashboard.spec.ts      # Dashboard tests
├── tickets.spec.ts        # Ticket CRUD tests
├── customers.spec.ts      # Customer management tests
├── admin.spec.ts          # Admin feature tests
└── README.md              # This file
```

## Test Categories

### Authentication Tests (auth.spec.ts)
- Sign in form display and validation
- Invalid credentials handling
- Registration flow
- Session management
- Error handling for account states

### Dashboard Tests (dashboard.spec.ts)
- Protected route access
- Statistics display
- Navigation links
- Responsive design

### Ticket Tests (tickets.spec.ts)
- Ticket list display and filtering
- Ticket creation with validation
- Ticket detail view
- Reply/comment functionality
- Ticket editing

### Customer Tests (customers.spec.ts)
- Customer search
- Customer data display
- Integration with Shopify data

### Admin Tests (admin.spec.ts)
- Access control
- User management
- Email processing
- Configuration

## Notes

- Tests use `test.skip()` for tests requiring authentication when credentials are not provided
- Playwright runs tests on port 3001 (see `playwright.config.ts`)
- Tests include mobile and tablet viewport testing
- Screenshots and videos are captured on failure
