import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/authOptions';
import CreateCustomerClient from '@/components/admin/CreateCustomerClient';

export const metadata: Metadata = {
  title: 'Create Customer - Admin Dashboard',
  description: 'Create a new customer in the system',
};

export default async function CreateCustomerPage() {
  // Server-side authentication and role check
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect('/auth/signin?callbackUrl=/admin/customers/create');
  }
  
  if (session.user?.role !== 'admin') {
    redirect('/?error=AccessDenied');
  }
  
  return (
    <div className="container-fluid">
      <div className="row">
        <main className="col-md-9 ms-sm-auto col-lg-10 px-md-4">
          <div className="pt-3 pb-2 mb-3 border-bottom">
            <h1 className="h2 fw-bold">Create Customer</h1>
            <p className="text-muted">Add a new customer to the system</p>
          </div>

          <CreateCustomerClient />
        </main>
      </div>
    </div>
  );
} 