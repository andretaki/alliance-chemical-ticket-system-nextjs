export function extractFirstName(customerName: string | null | undefined): string {
  if (!customerName) {
    return 'Customer';
  }
  
  // Handle common name formats
  if (customerName.includes(',')) {
    // "Last, First" format - take the part after the comma
    const parts = customerName.split(',');
    if (parts.length > 1) {
      const firstName = parts[1].trim();
      if (firstName) return firstName;
    }
  }
  
  // Handle "First Last" format - take the first word
  const words = customerName.trim().split(/\s+/);
  return words[0] || 'Customer';
} 