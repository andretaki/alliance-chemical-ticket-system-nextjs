'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Clock, Plus, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface SlaPolicy {
  id: number;
  name: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  firstResponseMinutes: number;
  resolutionMinutes: number;
  isActive: boolean;
  createdAt: string;
}

export default function SlaPolicyManager() {
  const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<SlaPolicy | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
    firstResponseMinutes: 60,
    resolutionMinutes: 480,
    isActive: true
  });

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/admin/sla-policies');
      setPolicies(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch SLA policies');
      console.error('Error fetching SLA policies:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPolicy) {
        await axios.put(`/api/admin/sla-policies/${editingPolicy.id}`, formData);
      } else {
        await axios.post('/api/admin/sla-policies', formData);
      }

      setShowModal(false);
      setEditingPolicy(null);
      resetForm();
      fetchPolicies();
    } catch (err) {
      setError('Failed to save SLA policy');
      console.error('Error saving SLA policy:', err);
    }
  };

  const handleEdit = (policy: SlaPolicy) => {
    setEditingPolicy(policy);
    setFormData({
      name: policy.name,
      priority: policy.priority,
      firstResponseMinutes: policy.firstResponseMinutes,
      resolutionMinutes: policy.resolutionMinutes,
      isActive: policy.isActive
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this SLA policy?')) return;

    try {
      await axios.delete(`/api/admin/sla-policies/${id}`);
      fetchPolicies();
    } catch (err) {
      setError('Failed to delete SLA policy');
      console.error('Error deleting SLA policy:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
      firstResponseMinutes: 60,
      resolutionMinutes: 480,
      isActive: true
    });
  };

  const formatMinutes = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  };

  const getPriorityBadgeVariant = (priority: string): 'destructive' | 'secondary' | 'outline' | 'default' => {
    switch (priority) {
      case 'urgent': return 'destructive';
      case 'high': return 'secondary';
      case 'medium': return 'default';
      case 'low': return 'outline';
      default: return 'outline';
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="w-4 h-4" />
          SLA Policy Management
        </CardTitle>
        <Button
          size="sm"
          onClick={() => {
            resetForm();
            setEditingPolicy(null);
            setShowModal(true);
          }}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Policy
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription className="flex items-center justify-between">
              {error}
              <Button variant="ghost" size="sm" onClick={() => setError(null)}>
                Dismiss
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="text-center py-4">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          </div>
        ) : (
          <Table aria-label="SLA policies">
            <TableHeader>
              <TableRow>
                <TableHead>Policy Name</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>First Response</TableHead>
                <TableHead>Resolution</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.map((policy) => (
                <TableRow key={policy.id}>
                  <TableCell className="font-medium">{policy.name}</TableCell>
                  <TableCell>
                    <Badge variant={getPriorityBadgeVariant(policy.priority)}>
                      {policy.priority.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatMinutes(policy.firstResponseMinutes)}</TableCell>
                  <TableCell>{formatMinutes(policy.resolutionMinutes)}</TableCell>
                  <TableCell>
                    <Badge variant={policy.isActive ? 'default' : 'secondary'}>
                      {policy.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(policy)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(policy.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {policies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-4">
                    No SLA policies configured yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingPolicy ? 'Edit SLA Policy' : 'Add New SLA Policy'}
            </DialogTitle>
            <DialogDescription>
              Configure response and resolution times for this SLA policy.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" required>Policy Name</Label>
                  <Input
                    id="name"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="e.g., Standard Support Policy"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="priority" required>Priority Level</Label>
                  <select
                    id="priority"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                    required
                    className="h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm shadow-sm transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstResponse" required>First Response Time (minutes)</Label>
                  <Input
                    id="firstResponse"
                    type="number"
                    value={formData.firstResponseMinutes}
                    onChange={(e) => setFormData({ ...formData, firstResponseMinutes: parseInt(e.target.value) || 0 })}
                    required
                    min="1"
                    placeholder="60"
                  />
                  <p className="text-xs text-muted-foreground">
                    Time until first response is due
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="resolution" required>Resolution Time (minutes)</Label>
                  <Input
                    id="resolution"
                    type="number"
                    value={formData.resolutionMinutes}
                    onChange={(e) => setFormData({ ...formData, resolutionMinutes: parseInt(e.target.value) || 0 })}
                    required
                    min="1"
                    placeholder="480"
                  />
                  <p className="text-xs text-muted-foreground">
                    Time until resolution is due
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <Label htmlFor="isActive" className="font-normal">Active Policy</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Only active policies will be applied to new tickets
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingPolicy ? 'Update Policy' : 'Create Policy'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
