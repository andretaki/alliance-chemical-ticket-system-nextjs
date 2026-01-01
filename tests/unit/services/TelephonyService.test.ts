/**
 * Tests for TelephonyService
 *
 * These tests verify the core telephony logic without hitting the database.
 * For full integration tests, use the e2e tests with a test database.
 */

// Mock the database module
jest.mock('@/lib/db', () => ({
  db: {
    query: {
      contacts: { findMany: jest.fn() },
      customers: { findMany: jest.fn() },
      customerIdentities: { findMany: jest.fn() },
      calls: { findFirst: jest.fn() },
      tickets: { findFirst: jest.fn() },
    },
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        onConflictDoNothing: jest.fn(() => ({
          returning: jest.fn(() => Promise.resolve([])),
        })),
        returning: jest.fn(() => Promise.resolve([])),
      })),
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({
          returning: jest.fn(() => Promise.resolve([])),
        })),
      })),
    })),
  },
  calls: {},
  contacts: {},
  customers: {},
  customerIdentities: {},
  interactions: {},
  tickets: {},
  interactionDirectionEnum: { enumValues: ['inbound', 'outbound'] },
}));

// Mock the identity service
jest.mock('@/services/crm/identityService', () => ({
  identityUtils: {
    normalizePhone: (phone: string | null | undefined) => {
      if (!phone) return null;
      const digits = phone.replace(/\D/g, '');
      if (!digits) return null;
      if (digits.length === 10) return `+1${digits}`;
      if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
      if (digits.length > 10) return `+${digits}`;
      return digits;
    },
  },
}));

import { findCustomerAndContactByPhone } from '@/services/telephony/TelephonyService';
import { db } from '@/lib/db';

describe('TelephonyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findCustomerAndContactByPhone', () => {
    it('should return empty array for empty phone', async () => {
      const result = await findCustomerAndContactByPhone('');
      expect(result).toEqual([]);
    });

    it('should return empty array for invalid phone', async () => {
      const result = await findCustomerAndContactByPhone('abc');
      expect(result).toEqual([]);
    });

    it('should find customers by contact phone match', async () => {
      (db.query.contacts.findMany as jest.Mock).mockResolvedValue([
        {
          id: 1,
          phone: '+15551234567',
          name: 'John Contact',
          customerId: 100,
          customer: {
            id: 100,
            firstName: null,
            lastName: null,
            company: 'Acme Corp',
            primaryPhone: null,
          },
        },
      ]);
      (db.query.customers.findMany as jest.Mock).mockResolvedValue([]);
      (db.query.customerIdentities.findMany as jest.Mock).mockResolvedValue([]);

      const result = await findCustomerAndContactByPhone('555-123-4567');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        customerId: 100,
        contactId: 1,
        customerName: 'Acme Corp',
        contactName: 'John Contact',
        customerPhone: null,
        contactPhone: '+15551234567',
      });
    });

    it('should find customers by primary phone match', async () => {
      (db.query.contacts.findMany as jest.Mock).mockResolvedValue([]);
      (db.query.customers.findMany as jest.Mock).mockResolvedValue([
        {
          id: 200,
          firstName: 'Jane',
          lastName: 'Doe',
          company: null,
          primaryPhone: '+15559876543',
        },
      ]);
      (db.query.customerIdentities.findMany as jest.Mock).mockResolvedValue([]);

      const result = await findCustomerAndContactByPhone('555-987-6543');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        customerId: 200,
        customerName: 'Jane Doe',
        customerPhone: '+15559876543',
      });
    });

    it('should find customers by identity phone match', async () => {
      (db.query.contacts.findMany as jest.Mock).mockResolvedValue([]);
      (db.query.customers.findMany as jest.Mock).mockResolvedValue([]);
      (db.query.customerIdentities.findMany as jest.Mock).mockResolvedValue([
        {
          id: 1,
          customerId: 300,
          phone: '+15551112222',
          customer: {
            id: 300,
            firstName: 'Bob',
            lastName: 'Smith',
            company: null,
            primaryPhone: null,
          },
        },
      ]);

      const result = await findCustomerAndContactByPhone('555-111-2222');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        customerId: 300,
        customerName: 'Bob Smith',
        customerPhone: null,
      });
    });

    it('should prefer contact match over customer match for same customer', async () => {
      (db.query.contacts.findMany as jest.Mock).mockResolvedValue([
        {
          id: 5,
          phone: '+15551234567',
          name: 'Primary Contact',
          customerId: 100,
          customer: {
            id: 100,
            firstName: 'Test',
            lastName: 'Customer',
            company: null,
            primaryPhone: '+15551234567',
          },
        },
      ]);
      (db.query.customers.findMany as jest.Mock).mockResolvedValue([
        {
          id: 100,
          firstName: 'Test',
          lastName: 'Customer',
          company: null,
          primaryPhone: '+15551234567',
        },
      ]);
      (db.query.customerIdentities.findMany as jest.Mock).mockResolvedValue([]);

      const result = await findCustomerAndContactByPhone('555-123-4567');

      // Should deduplicate and prefer the contact match
      expect(result).toHaveLength(1);
      expect(result[0].contactId).toBe(5);
      expect(result[0].contactName).toBe('Primary Contact');
    });

    it('should return multiple matches for different customers', async () => {
      (db.query.contacts.findMany as jest.Mock).mockResolvedValue([
        {
          id: 1,
          phone: '+15551234567',
          name: 'Contact A',
          customerId: 100,
          customer: {
            id: 100,
            firstName: 'Customer',
            lastName: 'A',
            company: null,
            primaryPhone: null,
          },
        },
        {
          id: 2,
          phone: '+15551234567',
          name: 'Contact B',
          customerId: 200,
          customer: {
            id: 200,
            firstName: 'Customer',
            lastName: 'B',
            company: null,
            primaryPhone: null,
          },
        },
      ]);
      (db.query.customers.findMany as jest.Mock).mockResolvedValue([]);
      (db.query.customerIdentities.findMany as jest.Mock).mockResolvedValue([]);

      const result = await findCustomerAndContactByPhone('555-123-4567');

      expect(result).toHaveLength(2);
      expect(result.map(r => r.customerId)).toEqual([100, 200]);
    });
  });
});
