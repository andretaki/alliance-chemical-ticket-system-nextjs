import { redirect } from 'next/navigation';
import Link from 'next/link';
import { LogIn, UserPlus, Ticket, Search, BarChart3, Mail } from 'lucide-react';
// import { getServerSession } from '@/lib/auth-helpers';

// This page will immediately redirect users to the dashboard
export default async function RootPage() {
  // BYPASS AUTH - Always redirect to dashboard
  redirect('/dashboard');

  // Original auth check commented out:
  // const { session } = await getServerSession();
  // if (session?.user) {
  //   redirect('/dashboard');
  // }

  // Landing page disabled - keeping for reference
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
                  <Link href="/auth/signin" className="btn btn-primary btn-lg d-flex align-items-center justify-content-center">
                    <LogIn className="w-5 h-5 me-2" />
                    Sign In
                  </Link>
                  <Link href="/auth/register" className="btn btn-outline-primary btn-lg d-flex align-items-center justify-content-center">
                    <UserPlus className="w-5 h-5 me-2" />
                    Create Account
                  </Link>
                </div>

                <div className="border-top pt-4">
                  <h5 className="fw-semibold mb-3">Features</h5>
                  <div className="row text-start">
                    <div className="col-md-6">
                      <ul className="list-unstyled">
                        <li className="mb-2 d-flex align-items-center">
                          <Ticket className="w-4 h-4 text-primary me-2" />
                          Create Support Tickets
                        </li>
                        <li className="mb-2 d-flex align-items-center">
                          <Search className="w-4 h-4 text-primary me-2" />
                          Order Tracking
                        </li>
                      </ul>
                    </div>
                    <div className="col-md-6">
                      <ul className="list-unstyled">
                        <li className="mb-2 d-flex align-items-center">
                          <BarChart3 className="w-4 h-4 text-primary me-2" />
                          Dashboard Analytics
                        </li>
                        <li className="mb-2 d-flex align-items-center">
                          <Mail className="w-4 h-4 text-primary me-2" />
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
