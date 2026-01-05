import { useState, useEffect } from 'react';
import { Info } from 'lucide-react';

interface Signature {
  id: number;
  signature: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export function SignatureManager() {
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [newSignature, setNewSignature] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch signatures on component mount
  useEffect(() => {
    fetchSignatures();
  }, []);

  const fetchSignatures = async () => {
    try {
      const response = await fetch('/api/signatures');
      if (!response.ok) throw new Error('Failed to fetch signatures');
      const data = await response.json();
      setSignatures(data);
    } catch (error) {
      console.error('Error fetching signatures:', error);
      alert('Failed to load signatures');
    }
  };

  const handleCreateSignature = async () => {
    if (!newSignature.trim()) {
      alert('Signature cannot be empty');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/signatures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature: newSignature,
          isDefault: isDefault,
        }),
      });

      if (!response.ok) throw new Error('Failed to create signature');

      await fetchSignatures();
      setNewSignature('');
      setIsDefault(false);
      alert('Signature created successfully');
    } catch (error) {
      console.error('Error creating signature:', error);
      alert('Failed to create signature');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateSignature = async (id: number, signature: string, isDefault: boolean) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/signatures/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature,
          isDefault,
        }),
      });

      if (!response.ok) throw new Error('Failed to update signature');

      await fetchSignatures();
      alert('Signature updated successfully');
    } catch (error) {
      console.error('Error updating signature:', error);
      alert('Failed to update signature');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSignature = async (id: number) => {
    if (!confirm('Are you sure you want to delete this signature?')) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/signatures/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete signature');

      await fetchSignatures();
      alert('Signature deleted successfully');
    } catch (error) {
      console.error('Error deleting signature:', error);
      alert('Failed to delete signature');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Create New Signature Card */}
      <div className="card">
        <div className="card-header">
          <h5 className="card-title mb-0">Email Signatures</h5>
          <p className="text-muted small mb-0">
            Manage your email signatures. You can create multiple signatures and set one as default.
          </p>
        </div>
        <div className="card-body">
          <div className="mb-3">
            <label htmlFor="newSignature" className="form-label">New Signature</label>
            <textarea
              id="newSignature"
              className="form-control"
              value={newSignature}
              onChange={(e) => setNewSignature(e.target.value)}
              placeholder="Enter your signature here..."
              rows={4}
            />
          </div>
          <div className="form-check mb-3">
            <input
              className="form-check-input"
              type="checkbox"
              id="isDefault"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="isDefault">
              Set as default signature
            </label>
          </div>
          <button
            onClick={handleCreateSignature}
            disabled={isLoading || !newSignature.trim()}
            className="btn btn-primary"
          >
            {isLoading ? 'Creating...' : 'Create Signature'}
          </button>
        </div>
      </div>

      {/* Existing Signatures */}
      <div className="mt-4">
        {signatures.map((sig) => (
          <div key={sig.id} className="card mb-3">
            <div className="card-header d-flex justify-content-between align-items-center">
              <div className="d-flex align-items-center">
                <h6 className="mb-0 me-2">Signature {sig.id}</h6>
                {sig.isDefault && (
                  <span className="badge bg-success">(Default)</span>
                )}
              </div>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleDeleteSignature(sig.id)}
                disabled={isLoading}
              >
                Delete
              </button>
            </div>
            <div className="card-body">
              <textarea
                className="form-control mb-3"
                value={sig.signature}
                onChange={(e) => handleUpdateSignature(sig.id, e.target.value, sig.isDefault)}
                rows={4}
              />
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={sig.isDefault}
                  onChange={(e) => handleUpdateSignature(sig.id, sig.signature, e.target.checked)}
                  disabled={isLoading}
                />
                <label className="form-check-label">
                  Set as default
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>

      {signatures.length === 0 && (
        <div className="alert alert-info">
          <Info className="w-4 h-4 me-2" />
          You haven&apos;t created any signatures yet. Create your first signature above.
        </div>
      )}
    </div>
  );
} 