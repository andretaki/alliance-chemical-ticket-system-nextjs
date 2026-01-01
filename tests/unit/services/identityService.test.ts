import { identityUtils } from '@/services/crm/identityService';

describe('identityUtils.normalizePhone', () => {
  const { normalizePhone } = identityUtils;

  describe('E.164 format normalization', () => {
    it('should convert 10-digit US number to E.164 format', () => {
      expect(normalizePhone('5551234567')).toBe('+15551234567');
    });

    it('should convert formatted 10-digit US number to E.164', () => {
      expect(normalizePhone('(555) 123-4567')).toBe('+15551234567');
      expect(normalizePhone('555-123-4567')).toBe('+15551234567');
      expect(normalizePhone('555.123.4567')).toBe('+15551234567');
      expect(normalizePhone('555 123 4567')).toBe('+15551234567');
    });

    it('should convert 11-digit US number starting with 1 to E.164', () => {
      expect(normalizePhone('15551234567')).toBe('+15551234567');
      expect(normalizePhone('1-555-123-4567')).toBe('+15551234567');
      expect(normalizePhone('1 (555) 123-4567')).toBe('+15551234567');
    });

    it('should preserve existing E.164 format', () => {
      expect(normalizePhone('+15551234567')).toBe('+15551234567');
      expect(normalizePhone('+1 555 123 4567')).toBe('+15551234567');
    });

    it('should handle international numbers', () => {
      expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
      expect(normalizePhone('+33 1 23 45 67 89')).toBe('+33123456789');
    });
  });

  describe('edge cases', () => {
    it('should return null for empty or invalid inputs', () => {
      expect(normalizePhone(null)).toBeNull();
      expect(normalizePhone(undefined)).toBeNull();
      expect(normalizePhone('')).toBeNull();
      expect(normalizePhone('   ')).toBeNull();
      expect(normalizePhone('abc')).toBeNull();
    });

    it('should handle short extension numbers', () => {
      // Short numbers (less than 10 digits) are returned as-is
      expect(normalizePhone('1234')).toBe('1234');
      expect(normalizePhone('123456789')).toBe('123456789');
    });

    it('should handle numbers with extensions', () => {
      // Extensions add extra digits, making it longer than 10 digits
      // The function treats this as an international number
      const result = normalizePhone('555-123-4567 ext 123');
      // Result should include all digits with + prefix
      expect(result).toBe('+5551234567123');
    });

    it('should add + for long numbers that look international', () => {
      expect(normalizePhone('442079460958')).toBe('+442079460958');
    });
  });
});
