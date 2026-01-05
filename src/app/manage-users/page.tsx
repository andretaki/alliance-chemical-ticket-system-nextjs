'use client';

import { useState, useEffect, useCallback } from 'react';
import { Metadata } from 'next'; // Keep for potential future use, though not directly used by client component rendering
import { format } from 'date-fns'; // For formatting dates

// Define a type for the user data we expect from the API
interface ManagedUser {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  createdAt: string; // Assuming ISO string from server
}

// Metadata can be exported from server components or page.tsx directly if needed,
// but it's not actively used by this client component for rendering.
// export const metadata: Metadata = {
//   title: 'Manage Users - Issue Tracker',
//   description: 'Admin page for managing user accounts.',
// };

export default function ManageUsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users${filterStatus !== 'all' ? '?status=' + filterStatus : ''}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch users');
      }
      const data = await response.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
      setUsers([]); // Clear users on error
    } finally {
      setIsLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleUpdateStatus = async (userId: string, newStatus: 'approved' | 'rejected') => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to ${newStatus === 'approved' ? 'approve' : 'reject'} user`);
      }
      // Refresh users list or update locally for better UX
      // For simplicity, we'll refetch the list based on the current filter.
      alert(`User ${newStatus === 'approved' ? 'approved' : 'rejected'} successfully!`); // Simple feedback
      fetchUsers(); 
    } catch (err: any) {
      setError(err.message);
      alert(`Error: ${err.message}`); // Simple error feedback
    }
  };

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>Manage Users</h1>
        <div>
          <label htmlFor="statusFilter" className="me-2">Filter by status:</label>
          <select 
            id="statusFilter" 
            className="form-select form-select-sm d-inline-block w-auto"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'pending' | 'approved' | 'rejected' | 'all')}
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {isLoading && <p>Loading users...</p>}
      {error && <div className="alert alert-danger">Error: {error}</div>}
      
      {!isLoading && !error && (
        <div className="card">
          <div className="card-body">
            {users.length === 0 ? (
              <p>No users found for the selected filter.</p>
            ) : (
              <table className="table table-striped" aria-label="User management">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Email</th>
                    <th scope="col">Registered</th>
                    <th scope="col">Role</th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.name || 'N/A'}</td>
                      <td>{user.email || 'N/A'}</td>
                      <td>{format(new Date(user.createdAt), 'PPpp')}</td>
                      <td>{user.role}</td>
                      <td>
                        <span className={`badge bg-${user.approvalStatus === 'pending' ? 'warning' : user.approvalStatus === 'approved' ? 'success' : 'danger'}`}>
                          {user.approvalStatus}
                        </span>
                      </td>
                      <td>
                        {user.approvalStatus === 'pending' && (
                          <>
                            <button 
                              className="btn btn-success btn-sm me-2"
                              onClick={() => handleUpdateStatus(user.id, 'approved')}
                            >
                              Approve
                            </button>
                            <button 
                              className="btn btn-danger btn-sm"
                              onClick={() => handleUpdateStatus(user.id, 'rejected')}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {(user.approvalStatus === 'approved' || user.approvalStatus === 'rejected') && (
                            <span className="text-muted">No actions</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 