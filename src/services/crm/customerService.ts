import type { CustomerOverview } from '@/lib/contracts';
import { customerRepository } from '@/repositories/CustomerRepository';

class CustomerService {
  async getOverviewById(customerId: number): Promise<CustomerOverview | null> {
    return customerRepository.getOverviewById(customerId);
  }
}

export const customerService = new CustomerService();
