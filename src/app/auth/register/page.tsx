'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Reset error state
    setError(null);
    
    // Basic validation
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    
    // Domain validation - only allow @alliancechemical.com emails
    const emailDomain = email.toLowerCase().split('@')[1];
    if (emailDomain !== 'alliancechemical.com') {
      setError("Registration is restricted to @alliancechemical.com email addresses only");
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          password,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Something went wrong');
      }
      
      // Registration successful
      setSuccess(true);
      
      // Redirect to login page after 2 seconds
      setTimeout(() => {
        router.push('/auth/signin');
      }, 2000);
      
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-4">
          <div className="card">
            <div className="card-header">
              <h3 className="text-center">Create Employee Account</h3>
              <p className="text-center mb-0">
                <small className="text-muted">Alliance Chemical Employee Registration</small>
              </p>
            </div>
            <div className="card-body">
              {error && (
                <div className="alert alert-danger" role="alert">
                  {error}
                </div>
              )}
              
              {success && (
                <div className="alert alert-success" role="alert">
                  Registration successful! Redirecting to login page...
                </div>
              )}
              
              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label htmlFor="nameInput" className="form-label">Full Name</label>
                  <input
                    type="text"
                    className="form-control"
                    id="nameInput"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="John Doe"
                  />
                </div>
                
                <div className="mb-3">
                  <label htmlFor="emailInput" className="form-label">Email address</label>
                  <input
                    type="email"
                    className="form-control"
                    id="emailInput"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="your.name@alliancechemical.com"
                  />
                  <div className="form-text">
                    <small className="text-muted">
                      <i className="bi bi-info-circle"></i> Only @alliancechemical.com email addresses are allowed
                    </small>
                  </div>
                </div>
                
                <div className="mb-3">
                  <label htmlFor="passwordInput" className="form-label">Password</label>
                  <input
                    type="password"
                    className="form-control"
                    id="passwordInput"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Minimum 8 characters"
                  />
                </div>
                
                <div className="mb-3">
                  <label htmlFor="confirmPasswordInput" className="form-label">Confirm Password</label>
                  <input
                    type="password"
                    className="form-control"
                    id="confirmPasswordInput"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Confirm your password"
                  />
                </div>
                
                <div className="d-grid">
                  <button type="submit" className="btn btn-primary" disabled={loading || success}>
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        &nbsp;Creating Account...
                      </>
                    ) : (
                      'Register'
                    )}
                  </button>
                </div>
              </form>
              
              <div className="mt-3 text-center">
                <p>
                  Already have an account?{' '}
                  <Link href="/auth/signin" className="text-decoration-none">
                    Sign In
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