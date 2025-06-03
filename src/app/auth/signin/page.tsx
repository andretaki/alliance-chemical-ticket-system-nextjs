'use client'; // This will be a client component to handle form submission

import { signIn, getProviders } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';

// Fix provider types
type Provider = {
  id: string;
  name: string;
};

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get('callbackUrl') || '/dashboard';
  const error = searchParams?.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(error ? "Authentication failed. Please check your credentials." : null);

  // To handle other providers like Google, GitHub, etc., if you add them later
  const [providers, setProviders] = useState<Record<string, Provider> | null>(null);

  useEffect(() => {
    const fetchProviders = async () => {
      const res = await getProviders();
      setProviders(res);
    };
    fetchProviders();
  }, []);

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
      setSignInError(result.error === "CredentialsSignin" ? "Invalid email or password." : "An unknown error occurred.");
      console.error("Sign-in error:", result.error);
    } else if (result?.ok && result.url) {
      // Successfully signed in
      router.push(result.url); // Redirect to callbackUrl or dashboard
    } else if (result?.ok) {
        router.push(callbackUrl);
    }
  };

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-4">
          <div className="card">
            <div className="card-header">
              <h3 className="text-center">Sign In</h3>
            </div>
            <div className="card-body">
              {signInError && (
                <div className="alert alert-danger" role="alert">
                  {signInError}
                </div>
              )}
              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label htmlFor="emailInput" className="form-label">Email address</label>
                  <input
                    type="email"
                    className="form-control"
                    id="emailInput"
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                  />
                </div>
                <div className="mb-3">
                  <label htmlFor="passwordInput" className="form-label">Password</label>
                  <input
                    type="password"
                    className="form-control"
                    id="passwordInput"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                    required
                    placeholder="Password"
                  />
                </div>
                <div className="d-grid">
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        Signing In...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </button>
                </div>
              </form>
              <hr />
              {/* This section is for OAuth providers, can be uncommented if you add them */}
              {/* {providers &&
                Object.values(providers).map((provider) => {
                  if (provider.id === 'credentials') return null; // Don't show button for credentials
                  return (
                    <div key={provider.name} className="mt-2 d-grid">
                      <button onClick={() => signIn(provider.id, { callbackUrl })} className="btn btn-outline-secondary">
                        Sign in with {provider.name}
                      </button>
                    </div>
                  );
              })} */}
              
              <div className="mt-3 text-center">
                <p>
                  Don&apos;t have an account?{' '}
                  <Link href="/auth/register" className="text-decoration-none">
                    Register here
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 