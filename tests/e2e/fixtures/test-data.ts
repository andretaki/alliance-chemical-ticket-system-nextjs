// Test data and utilities for E2E tests

export const testUsers = {
  admin: {
    email: 'test-admin@example.com',
    password: 'TestPassword123!',
    name: 'Test Admin',
    role: 'admin',
  },
  agent: {
    email: 'test-agent@example.com',
    password: 'TestPassword123!',
    name: 'Test Agent',
    role: 'user',
  },
  newUser: {
    email: `test-${Date.now()}@example.com`,
    password: 'TestPassword123!',
    name: 'Test New User',
  },
};

export const testTickets = {
  basic: {
    title: 'Test Ticket - Basic Issue',
    description: 'This is a test ticket description for E2E testing.',
    priority: 'medium',
  },
  urgent: {
    title: 'Test Ticket - Urgent Matter',
    description: 'This is an urgent test ticket that needs immediate attention.',
    priority: 'urgent',
  },
  withOrder: {
    title: 'Test Ticket - Order Issue',
    description: 'I have an issue with my order #12345.',
    priority: 'high',
    orderNumber: '12345',
  },
};

export const testCustomers = {
  basic: {
    name: 'Test Customer',
    email: 'customer@testexample.com',
    phone: '555-123-4567',
    company: 'Test Company Inc.',
  },
};

// Helper to generate unique test data
export function generateUniqueEmail(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
}

export function generateUniqueTicketTitle(prefix: string = 'Test Ticket'): string {
  return `${prefix} - ${Date.now()}`;
}
