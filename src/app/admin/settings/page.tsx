import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth-helpers';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'System Settings - Alliance Chemical Support',
  description: 'System configuration and settings management',
};

export default async function AdminSettingsPage() {
  // Server-side authentication and role check
  const { session, error } = await getServerSession();
  
  if (error || !session) {
    redirect('/auth/signin?callbackUrl=/admin/settings');
  }
  
  if (session.user?.role !== 'admin') {
    redirect('/?error=AccessDenied');
  }
  
  return (
    <div className="container-fluid">
      <div className="row">
        <main className="col-md-9 ms-sm-auto col-lg-10 px-md-4">
          <div className="pt-3 pb-2 mb-3 border-bottom">
            <h1 className="h2 fw-bold">System Settings</h1>
          </div>
          
          <div className="row g-4">
            <div className="col-12">
              <div className="card">
                <div className="card-body">
                  <h5 className="card-title">General Settings</h5>
                  <p className="card-text">Configure global system settings and preferences.</p>
                  <div className="alert alert-info">
                    <strong>Coming Soon:</strong> System configuration options will be available here.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
} 