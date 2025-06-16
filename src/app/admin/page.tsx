import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/authOptions';
import Link from 'next/link';
import WebhookStatus from '@/components/admin/WebhookStatus';
import SubscriptionManager from '@/components/admin/SubscriptionManager';
import GraphApiTester from '@/components/admin/GraphApiTester';

export const metadata: Metadata = {
  title: 'Admin Dashboard - Alliance Chemical Support',
  description: 'Administrative controls and system management',
};

export default async function AdminPage() {
  // Server-side authentication and role check
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect('/auth/signin?callbackUrl=/admin');
  }
  
  if (session.user?.role !== 'admin') {
    redirect('/?error=AccessDenied');
  }
  
  return (
    <div className="container-fluid">
      <div className="row">
        <main className="col-md-9 ms-sm-auto col-lg-10 px-md-4">
          <div className="pt-3 pb-2 mb-3 border-bottom">
            <h1 className="h2 fw-bold">Admin Dashboard</h1>
          </div>

          {/* NEW: API Tester Card */}
          <div className="row mb-4">
            <div className="col-12">
              <GraphApiTester />
            </div>
          </div>

          {/* Webhook Status Card */}
          <div className="row mb-4">
            <div className="col-12">
              <div className="card">
                <div className="card-header"><h5 className="card-title mb-0">System Status</h5></div>
                <div className="card-body py-2">
                  <WebhookStatus />
                </div>
              </div>
            </div>
          </div>

          {/* Subscription Manager Card */}
          <div className="row mb-4">
            <div className="col-12">
              <div className="card">
                <div className="card-header"><h5 className="card-title mb-0">Email Subscription Manager</h5></div>
                <div className="card-body"><SubscriptionManager /></div>
              </div>
            </div>
          </div>
          
          <div className="row g-4">
            <div className="col-md-4">
              <div className="card h-100">
                <div className="card-body">
                  <h5 className="card-title">User Management</h5>
                  <p className="card-text">Manage system users, roles, and permissions.</p>
                  <Link href="/manage-users" className="btn btn-primary">Manage Users</Link>
                </div>
              </div>
            </div>
            
            <div className="col-md-4">
              <div className="card h-100">
                <div className="card-body">
                  <h5 className="card-title">Email Processing</h5>
                  <p className="card-text">Configure and monitor automated email processing.</p>
                  <Link href="/admin/email-processing" className="btn btn-primary">Email Settings</Link>
                </div>
              </div>
            </div>
            
            <div className="col-md-4">
              <div className="card h-100">
                <div className="card-body">
                  <h5 className="card-title">System Settings</h5>
                  <p className="card-text">Configure global system settings and preferences.</p>
                  <Link href="/admin/settings" className="btn btn-primary">System Settings</Link>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
} 