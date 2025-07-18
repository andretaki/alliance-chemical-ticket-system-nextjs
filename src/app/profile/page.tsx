'use client';

import { useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useEffect } from 'react';
import { SignatureManager } from '@/components/SignatureManager';

export default function ProfilePage() {
  const session = useSession();
  const router = useRouter();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!session?.data?.user) {
      router.push('/auth/signin?callbackUrl=/profile');
    }
  }, [session, router]);

  // Show loading state
  if (session?.isPending) {
    return (
      <div className="container mt-5">
        <div className="text-center">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-2">Loading your profile...</p>
        </div>
      </div>
    );
  }

  // Show profile if authenticated
  if (session?.data?.user) {
    return (
      <div className="container mt-5">
        <div className="card mb-4">
          <div className="card-header">
            <h2 className="m-0">User Profile</h2>
          </div>
          <div className="card-body">
            <div className="row">
              <div className="col-md-3 text-center mb-4">
                {session.data.user.image ? (
                  <Image
                    src={session.data.user.image} 
                    alt={session.data.user.name || 'User'} 
                    className="img-thumbnail rounded-circle" 
                    width="150"
                    height="150"
                  />
                ) : (
                  <div className="bg-secondary text-white rounded-circle d-flex align-items-center justify-content-center" 
                       style={{width: '150px', height: '150px', fontSize: '4rem'}}>
                    {session.data.user.name?.charAt(0) || session.data.user.email?.charAt(0) || 'U'}
                  </div>
                )}
              </div>
              <div className="col-md-9">
                <h3>{session.data.user.name || 'User'}</h3>
                <p className="text-muted">{session.data.user.email}</p>
                
                <div className="mt-3">
                  <h5>Account Details</h5>
                  <table className="table table-striped">
                    <tbody>
                      <tr>
                        <th style={{width: '150px'}}>User ID:</th>
                        <td>{session.data.user.id}</td>
                      </tr>
                      <tr>
                        <th>Role:</th>
                        <td>
                          <span className="badge bg-primary">User</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Email Signature Management */}
        <div className="card mb-4">
          <div className="card-header">
            <h4 className="m-0">Email Signature Management</h4>
          </div>
          <div className="card-body">
            <SignatureManager />
          </div>
        </div>
        
        <div className="mt-4">
          <div className="card">
            <div className="card-header">
              <h4 className="m-0">Session Information</h4>
            </div>
            <div className="card-body">
              <pre className="bg-light p-3 rounded">
                {JSON.stringify(session, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // This shouldn't normally happen - unauthenticated users should be redirected
  return null;
} 