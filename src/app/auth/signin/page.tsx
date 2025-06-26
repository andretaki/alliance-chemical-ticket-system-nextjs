'use client'; // This will be a client component to handle form submission

import { signIn, getProviders } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';

// Fix provider types
type Provider = {
  id: string;
  name: string;
};

// Create a separate component for the sign-in form that uses useSearchParams
function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get('callbackUrl') || '/dashboard';
  const error = searchParams?.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(error || null);

  // To handle other providers like Google, GitHub, etc., if you add them later
  const [providers, setProviders] = useState<Record<string, Provider> | null>(null);

  useEffect(() => {
    const fetchProviders = async () => {
      const res = await getProviders();
      setProviders(res);
    };
    fetchProviders();
  }, []);

  const getErrorMessage = (errorType: string) => {
    switch (errorType) {
      case 'ACCOUNT_PENDING_APPROVAL':
        return {
          type: 'warning',
          title: 'Account Pending Approval',
          message: 'Your account has been created successfully but is waiting for administrator approval. You will receive an email notification once your account is approved.'
        };
      case 'ACCOUNT_REJECTED':
        return {
          type: 'danger',
          title: 'Account Access Denied',
          message: 'Your account access has been denied. Please contact andre@alliancechemical.com for assistance.'
        };
      case 'CredentialsSignin':
        return {
          type: 'danger',
          title: 'Invalid Credentials',
          message: 'Invalid email or password. Please check your credentials and try again.'
        };
      default:
        return {
          type: 'danger',
          title: 'Sign In Error',
          message: 'An unexpected error occurred. Please try again.'
        };
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setSignInError(null);

    const result = await signIn('credentials', {
      redirect: false, // We'll handle redirect manually
      email,
      password,
      callbackUrl: callbackUrl,
    });

    setLoading(false);

    if (result?.error) {
      setSignInError(result.error);
      console.error("Sign-in error:", result.error);
    } else if (result?.ok && result.url) {
      // Successfully signed in
      router.push(result.url); // Redirect to callbackUrl or dashboard
    } else if (result?.ok) {
        router.push(callbackUrl);
    }
  };

  const errorInfo = signInError ? getErrorMessage(signInError) : null;

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-5">
          <div className="card shadow-sm">
            <div className="card-header bg-white text-center py-4">
              <h3 className="mb-0 fw-bold text-primary">Sign In</h3>
              <p className="text-muted mb-0">Access your Alliance Chemical account</p>
            </div>
            <div className="card-body p-4">
              {errorInfo && (
                <div className={`alert alert-${errorInfo.type} border-0 shadow-sm`} role="alert">
                  <div className="d-flex align-items-start">
                    <i className={`fas ${errorInfo.type === 'warning' ? 'fa-clock' : 'fa-exclamation-triangle'} me-3 mt-1`}></i>
                    <div>
                      <h6 className="alert-heading mb-1">{errorInfo.title}</h6>
                      <p className="mb-0 small">{errorInfo.message}</p>
                    </div>
                  </div>
                </div>
              )}
              
              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label htmlFor="emailInput" className="form-label fw-semibold">Email address</label>
                  <input
                    type="email"
                    className="form-control form-control-lg"
                    id="emailInput"
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                  />
                </div>
                <div className="mb-4">
                  <label htmlFor="passwordInput" className="form-label fw-semibold">Password</label>
                  <input
                    type="password"
                    className="form-control form-control-lg"
                    id="passwordInput"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                    required
                    placeholder="Enter your password"
                  />
                </div>
                <div className="d-grid">
                  <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Signing In...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-sign-in-alt me-2"></i>
                        Sign In
                      </>
                    )}
                  </button>
                </div>
              </form>
              
              <hr className="my-4" />
              
              <div className="text-center">
                <p className="mb-0">
                  Don&apos;t have an account?{' '}
                  <Link href="/auth/register" className="text-decoration-none fw-semibold">
                    Register here
                  </Link>
                </p>
                <div className="mt-3">
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

// Loading fallback component
function SignInLoading() {
  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-4">
          <div className="card">
            <div className="card-header">
              <h3 className="text-center">Sign In</h3>
            </div>
            <div className="card-body text-center">
              <div className="spinner-border" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInLoading />}>
      <SignInForm />
    </Suspense>
  );
} 