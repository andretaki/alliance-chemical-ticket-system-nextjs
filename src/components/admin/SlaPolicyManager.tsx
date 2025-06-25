'use client';

import React, { useState, useEffect } from 'react';
import { Button, Card, Table, Modal, Form, Alert, Badge } from 'react-bootstrap';
import axios from 'axios';

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

  const getPriorityBadgeVariant = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'danger';
      case 'high': return 'warning';
      case 'medium': return 'info';
      case 'low': return 'secondary';
      default: return 'secondary';
    }
  };

  return (
    <Card>
      <Card.Header className="d-flex justify-content-between align-items-center">
        <h5 className="mb-0">
          <i className="fas fa-clock me-2"></i>
          SLA Policy Management
        </h5>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            resetForm();
            setEditingPolicy(null);
            setShowModal(true);
          }}
        >
          <i className="fas fa-plus me-1"></i>
          Add Policy
        </Button>
      </Card.Header>
      <Card.Body>
        {error && (
          <Alert variant="danger" onClose={() => setError(null)} dismissible>
            {error}
          </Alert>
        )}

        {loading ? (
          <div className="text-center py-4">
            <div className="spinner-border" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        ) : (
          <Table responsive hover>
            <thead>
              <tr>
                <th>Policy Name</th>
                <th>Priority</th>
                <th>First Response</th>
                <th>Resolution</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => (
                <tr key={policy.id}>
                  <td className="fw-semibold">{policy.name}</td>
                  <td>
                    <Badge bg={getPriorityBadgeVariant(policy.priority)}>
                      {policy.priority.toUpperCase()}
                    </Badge>
                  </td>
                  <td>{formatMinutes(policy.firstResponseMinutes)}</td>
                  <td>{formatMinutes(policy.resolutionMinutes)}</td>
                  <td>
                    <Badge bg={policy.isActive ? 'success' : 'secondary'}>
                      {policy.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td>
                    <div className="d-flex gap-1">
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() => handleEdit(policy)}
                      >
                        <i className="fas fa-edit"></i>
                      </Button>
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => handleDelete(policy.id)}
                      >
                        <i className="fas fa-trash"></i>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {policies.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-4">
                    No SLA policies configured yet.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        )}
      </Card.Body>

      {/* Add/Edit Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            {editingPolicy ? 'Edit SLA Policy' : 'Add New SLA Policy'}
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <div className="row">
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Policy Name</Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="e.g., Standard Support Policy"
                  />
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Priority Level</Form.Label>
                  <Form.Select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                    required
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </Form.Select>
                </Form.Group>
              </div>
            </div>
            <div className="row">
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>First Response Time (minutes)</Form.Label>
                  <Form.Control
                    type="number"
                    value={formData.firstResponseMinutes}
                    onChange={(e) => setFormData({ ...formData, firstResponseMinutes: parseInt(e.target.value) || 0 })}
                    required
                    min="1"
                    placeholder="60"
                  />
                  <Form.Text className="text-muted">
                    Time until first response is due
                  </Form.Text>
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Resolution Time (minutes)</Form.Label>
                  <Form.Control
                    type="number"
                    value={formData.resolutionMinutes}
                    onChange={(e) => setFormData({ ...formData, resolutionMinutes: parseInt(e.target.value) || 0 })}
                    required
                    min="1"
                    placeholder="480"
                  />
                  <Form.Text className="text-muted">
                    Time until resolution is due
                  </Form.Text>
                </Form.Group>
              </div>
            </div>
            <Form.Group className="mb-3">
              <Form.Check
                type="switch"
                id="isActive"
                label="Active Policy"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              />
              <Form.Text className="text-muted">
                Only active policies will be applied to new tickets
              </Form.Text>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              {editingPolicy ? 'Update Policy' : 'Create Policy'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </Card>
  );
} 