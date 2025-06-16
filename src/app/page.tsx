import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import Link from 'next/link';

// This page will immediately redirect users to the dashboard
export default async function RootPage() {
  const session = await getServerSession(authOptions);

  // If user is authenticated and approved, redirect to dashboard
  if (session?.user) {
    redirect('/dashboard');
  }

  // Show landing page for unauthenticated users
  return (
    <div className="min-vh-100 d-flex align-items-center bg-light">
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-md-8 col-lg-6">
            <div className="card shadow-lg border-0">
              <div className="card-body p-5 text-center">
                <div className="mb-4">
                  <h1 className="h2 fw-bold text-primary mb-3">
                    Alliance Chemical Support
                  </h1>
                  <p className="text-muted fs-5">
                    Ticketing and Support System
                  </p>
                </div>

                <div className="d-grid gap-3 mb-4">
                  <Link href="/auth/signin" className="btn btn-primary btn-lg">
                    <i className="fas fa-sign-in-alt me-2"></i>
                    Sign In
                  </Link>
                  <Link href="/auth/register" className="btn btn-outline-primary btn-lg">
                    <i className="fas fa-user-plus me-2"></i>
                    Create Account
                  </Link>
                </div>

                <div className="border-top pt-4">
                  <h5 className="fw-semibold mb-3">Features</h5>
                  <div className="row text-start">
                    <div className="col-md-6">
                      <ul className="list-unstyled">
                        <li className="mb-2">
                          <i className="fas fa-ticket-alt text-primary me-2"></i>
                          Create Support Tickets
                        </li>
                        <li className="mb-2">
                          <i className="fas fa-search text-primary me-2"></i>
                          Order Tracking
                        </li>
                      </ul>
                    </div>
                    <div className="col-md-6">
                      <ul className="list-unstyled">
                        <li className="mb-2">
                          <i className="fas fa-chart-bar text-primary me-2"></i>
                          Dashboard Analytics
                        </li>
                        <li className="mb-2">
                          <i className="fas fa-envelope text-primary me-2"></i>
                          Email Integration
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <small className="text-muted">
                    Need help? Contact{' '}
                    <a href="mailto:andre@alliancechemical.com" className="text-decoration-none">
                      andre@alliancechemical.com
                    </a>
                  </small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
