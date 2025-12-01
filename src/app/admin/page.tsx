import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth-helpers';
import type { Metadata } from 'next';
import Link from 'next/link';
import WebhookStatus from '@/components/admin/WebhookStatus';
import SubscriptionManager from '@/components/admin/SubscriptionManager';
import GraphApiTester from '@/components/admin/GraphApiTester';
import CustomerAutoCreateManager from '@/components/admin/CustomerAutoCreateManager';
import SlaPolicyManager from '@/components/admin/SlaPolicyManager';

export const metadata: Metadata = {
  title: 'Admin Dashboard - Alliance Chemical Support',
  description: 'Administrative controls and system management',
};

export default async function AdminPage() {
  // BYPASS AUTH
  // const { session, error } = await getServerSession();
  // if (error || !session) {
  //   redirect('/auth/signin?callbackUrl=/admin');
  // }
  // if (session.user?.role !== 'admin') {
  //   redirect('/?error=AccessDenied');
  // }

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

          {/* Customer Auto-Create Manager */}
          <div className="row mb-4">
              <div className="col-12">
                  <div className="card">
                      <div className="card-body">
                          <CustomerAutoCreateManager />
                      </div>
                  </div>
              </div>
          </div>

          {/* SLA Policy Manager */}
          <div className="row mb-4">
              <div className="col-12">
                  <div className="card">
                      <SlaPolicyManager />
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
                  <h5 className="card-title">Customer Management</h5>
                  <p className="card-text">Create and manage customers in the system.</p>
                  <Link href="/admin/customers/create" className="btn btn-primary">Create Customer</Link>
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