import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

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
      toast.error('Failed to load signatures');
    }
  };

  const handleCreateSignature = async () => {
    if (!newSignature.trim()) {
      toast.error('Signature cannot be empty');
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
      toast.success('Signature created successfully');
    } catch (error) {
      console.error('Error creating signature:', error);
      toast.error('Failed to create signature');
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
      toast.success('Signature updated successfully');
    } catch (error) {
      console.error('Error updating signature:', error);
      toast.error('Failed to update signature');
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
      toast.success('Signature deleted successfully');
    } catch (error) {
      console.error('Error deleting signature:', error);
      toast.error('Failed to delete signature');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Email Signatures</CardTitle>
          <CardDescription>
            Manage your email signatures. You can create multiple signatures and set one as default.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newSignature">New Signature</Label>
              <Textarea
                id="newSignature"
                value={newSignature}
                onChange={(e) => setNewSignature(e.target.value)}
                placeholder="Enter your signature here..."
                className="min-h-[100px]"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="isDefault"
                checked={isDefault}
                onCheckedChange={setIsDefault}
              />
              <Label htmlFor="isDefault">Set as default signature</Label>
            </div>
            <Button
              onClick={handleCreateSignature}
              disabled={isLoading || !newSignature.trim()}
            >
              Create Signature
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {signatures.map((sig) => (
          <Card key={sig.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CardTitle>Signature {sig.id}</CardTitle>
                  {sig.isDefault && (
                    <span className="text-sm text-muted-foreground">(Default)</span>
                  )}
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteSignature(sig.id)}
                  disabled={isLoading}
                >
                  Delete
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                value={sig.signature}
                onChange={(e) => handleUpdateSignature(sig.id, e.target.value, sig.isDefault)}
                className="min-h-[100px]"
              />
            </CardContent>
            <CardFooter>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={sig.isDefault}
                  onCheckedChange={(checked) => handleUpdateSignature(sig.id, sig.signature, checked)}
                  disabled={isLoading}
                />
                <Label>Set as default</Label>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
} 