'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { toast } from 'sonner';
import { RefreshCw, Shield, Trash2 } from 'lucide-react';

interface Subscription {
  id: string;
  resource: string;
  notificationUrl: string;
  expirationDateTime: string;
  clientState: string;
}

export default function SubscriptionManager() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);

  const fetchSubscriptions = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await axios.get('/api/admin/subscriptions');
      setSubscriptions(data.subscriptions || []);
    } catch (error) {
      toast.error('Failed to fetch subscriptions.');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const handleCreate = async () => {
    setIsActionLoading(true);
    const toastId = toast.loading('Creating subscription...');
    try {
      await axios.post('/api/admin/subscriptions', { action: 'create' });
      toast.success('Subscription created successfully!', { id: toastId });
      fetchSubscriptions();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create subscription.', { id: toastId });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this subscription? This will stop email processing.')) return;
    setIsActionLoading(true);
    const toastId = toast.loading(`Deleting subscription ${id.substring(0, 8)}...`);
    try {
      await axios.post('/api/admin/subscriptions', { action: 'delete', subscriptionId: id });
      toast.success('Subscription deleted!', { id: toastId });
      fetchSubscriptions();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete subscription.', { id: toastId });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleEnsure = async () => {
    setIsActionLoading(true);
    const toastId = toast.loading('Ensuring active subscription...');
    try {
      await axios.post('/api/admin/subscriptions', { action: 'ensure' });
      toast.success('Active subscription ensured!', { id: toastId });
      fetchSubscriptions();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to ensure subscription.', { id: toastId });
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-end gap-2 mb-3">
        <button className="btn btn-sm btn-outline-secondary" onClick={fetchSubscriptions} disabled={isLoading || isActionLoading}>
          <RefreshCw className="w-4 h-4 me-1" /> Refresh
        </button>
        <button className="btn btn-sm btn-primary" onClick={handleEnsure} disabled={isLoading || isActionLoading}>
            {isActionLoading ? <span className="spinner-border spinner-border-sm"></span> : <><Shield className="w-4 h-4 me-1" /> Ensure Active</>}
        </button>
      </div>

      {isLoading ? (
        <div className="text-center"><span className="spinner-border"></span></div>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm" aria-label="Email subscriptions">
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">ID</th>
                <th scope="col">Notification URL</th>
                <th scope="col">Expires</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-muted py-3">No active subscriptions found. Click &quot;Ensure Active&quot; to create one.</td></tr>
              ) : (
                subscriptions.map(sub => {
                  const isExpired = isPast(new Date(sub.expirationDateTime));
                  return (
                    <tr key={sub.id} className={isExpired ? 'table-danger' : ''}>
                      <td>
                        <span className={`badge ${isExpired ? 'bg-danger' : 'bg-success'}`}>
                          {isExpired ? 'Expired' : 'Active'}
                        </span>
                      </td>
                      <td className="font-monospace small" title={sub.id}>{sub.id.substring(0, 15)}...</td>
                      <td><code className="small">{sub.notificationUrl}</code></td>
                      <td className="text-nowrap" title={format(new Date(sub.expirationDateTime), 'PPpp')}>
                        {formatDistanceToNow(new Date(sub.expirationDateTime), { addSuffix: true })}
                      </td>
                      <td>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(sub.id)} disabled={isActionLoading}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
} 