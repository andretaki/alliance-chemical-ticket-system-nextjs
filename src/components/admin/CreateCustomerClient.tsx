'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Form, Row, Col, Spinner, Modal, Badge, Tab, Tabs } from 'react-bootstrap';
import Link from 'next/link';
import { CustomerCommunicationSuggestion } from '@/services/aiCustomerCommunicationService';

interface CustomerFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  shippingAddress: {
    firstName: string;
    lastName: string;
    company: string;
    address1: string;
    address2: string;
    city: string;
    province: string;
    country: string;
    zip: string;
    phone: string;
  };
  billingAddress: {
    firstName: string;
    lastName: string;
    company: string;
    address1: string;
    address2: string;
    city: string;
    province: string;
    country: string;
    zip: string;
    phone: string;
  };
  useSameAddressForBilling: boolean;
  customerType: 'retail' | 'wholesale' | 'distributor';
  tags: string;
  notes: string;
}

interface CreateCustomerResponse {
  success: boolean;
  customerId?: string;
  customer?: any;
  alreadyExists?: boolean;
  error?: string;
  aiSuggestions?: CustomerCommunicationSuggestion | null;
}

const CreateCustomerClient: React.FC = () => {
  const router = useRouter();
  
  const [formData, setFormData] = useState<CustomerFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    shippingAddress: {
      firstName: '',
      lastName: '',
      company: '',
      address1: '',
      address2: '',
      city: '',
      province: '',
      country: 'United States',
      zip: '',
      phone: '',
    },
    billingAddress: {
      firstName: '',
      lastName: '',
      company: '',
      address1: '',
      address2: '',
      city: '',
      province: '',
      country: 'United States',
      zip: '',
      phone: '',
    },
    useSameAddressForBilling: true,
    customerType: 'retail',
    tags: '',
    notes: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<CustomerCommunicationSuggestion | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [activeTab, setActiveTab] = useState('welcome');
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [quickPreview, setQuickPreview] = useState<string | null>(null);

  // Copy personal info to addresses when they change
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      shippingAddress: {
        ...prev.shippingAddress,
        firstName: prev.firstName,
        lastName: prev.lastName,
        company: prev.company,
        phone: prev.phone,
      }
    }));
  }, [formData.firstName, formData.lastName, formData.company, formData.phone]);

  // Copy shipping to billing when useSameAddressForBilling is true
  useEffect(() => {
    if (formData.useSameAddressForBilling) {
      setFormData(prev => ({
        ...prev,
        billingAddress: { ...prev.shippingAddress }
      }));
    }
  }, [formData.useSameAddressForBilling, formData.shippingAddress]);

  const handleInputChange = (field: keyof CustomerFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear field error when user starts typing
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const handleAddressChange = (
    addressType: 'shippingAddress' | 'billingAddress',
    field: string,
    value: string
  ) => {
    setFormData(prev => ({
      ...prev,
      [addressType]: {
        ...prev[addressType],
        [field]: value
      }
    }));
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    // Required fields
    if (!formData.firstName.trim()) errors.firstName = 'First name is required';
    if (!formData.lastName.trim()) errors.lastName = 'Last name is required';
    if (!formData.email.trim()) errors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) errors.email = 'Please enter a valid email address';

    // Address validation
    if (!formData.shippingAddress.address1.trim()) errors['shippingAddress.address1'] = 'Shipping address is required';
    if (!formData.shippingAddress.city.trim()) errors['shippingAddress.city'] = 'Shipping city is required';
    if (!formData.shippingAddress.zip.trim()) errors['shippingAddress.zip'] = 'Shipping ZIP code is required';

    if (!formData.useSameAddressForBilling) {
      if (!formData.billingAddress.address1.trim()) errors['billingAddress.address1'] = 'Billing address is required';
      if (!formData.billingAddress.city.trim()) errors['billingAddress.city'] = 'Billing city is required';
      if (!formData.billingAddress.zip.trim()) errors['billingAddress.zip'] = 'Billing ZIP code is required';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      setError('Please correct the errors below');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/admin/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result: CreateCustomerResponse = await response.json();

      if (result.success) {
        if (result.alreadyExists) {
          setSuccessMessage(`Customer already exists in the system. Customer ID: ${result.customerId}`);
        } else {
          setSuccessMessage(`Customer created successfully! Customer ID: ${result.customerId}`);
        }
        
        // Handle AI suggestions
        if (result.aiSuggestions) {
          setAiSuggestions(result.aiSuggestions);
          setShowAiModal(true);
        } else {
          // If no AI suggestions, redirect after a delay
          setTimeout(() => {
            router.push('/admin');
          }, 2000);
        }
      } else {
        setError(result.error || 'Failed to create customer');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const generateQuickPreview = async () => {
    if (!formData.firstName || !formData.lastName || !formData.customerType) {
      setError('Please fill in at least the customer name and type to generate a preview');
      return;
    }

    setIsGeneratingPreview(true);
    setQuickPreview(null);

    try {
      const response = await fetch('/api/admin/customers/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          customerType: formData.customerType,
        }),
      });

      const result = await response.json();
      if (result.success && result.preview) {
        setQuickPreview(result.preview);
      } else {
        setQuickPreview('Unable to generate preview at this time.');
      }
    } catch (err) {
      setQuickPreview('Unable to generate preview at this time.');
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  return (
    <div className="create-customer-container">
      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)} className="mb-4">
          <Alert.Heading>Error</Alert.Heading>
          {error}
        </Alert>
      )}

      {successMessage && (
        <Alert variant="success" className="mb-4">
          <Alert.Heading>Success!</Alert.Heading>
          {successMessage}
        </Alert>
      )}

      <Form onSubmit={handleSubmit}>
        {/* Personal Information */}
        <Card className="mb-4">
          <Card.Header>
            <h5 className="mb-0">
              <i className="fas fa-user me-2 text-primary"></i>
              Personal Information
            </h5>
          </Card.Header>
          <Card.Body>
            <Row className="g-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>First Name <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => handleInputChange('firstName', e.target.value)}
                    isInvalid={!!fieldErrors.firstName}
                  />
                  <Form.Control.Feedback type="invalid">
                    {fieldErrors.firstName}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Last Name <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => handleInputChange('lastName', e.target.value)}
                    isInvalid={!!fieldErrors.lastName}
                  />
                  <Form.Control.Feedback type="invalid">
                    {fieldErrors.lastName}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Email Address <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    isInvalid={!!fieldErrors.email}
                  />
                  <Form.Control.Feedback type="invalid">
                    {fieldErrors.email}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Phone Number</Form.Label>
                  <Form.Control
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Group>
                  <Form.Label>Company</Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.company}
                    onChange={(e) => handleInputChange('company', e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Customer Type</Form.Label>
                  <Form.Select
                    value={formData.customerType}
                    onChange={(e) => handleInputChange('customerType', e.target.value as any)}
                  >
                    <option value="retail">Retail</option>
                    <option value="wholesale">Wholesale</option>
                    <option value="distributor">Distributor</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Tags</Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.tags}
                    onChange={(e) => handleInputChange('tags', e.target.value)}
                    placeholder="Comma-separated tags"
                  />
                  <Form.Text className="text-muted">
                    Add tags to categorize this customer (e.g., &quot;VIP, Wholesale, New&quot;)
                  </Form.Text>
                </Form.Group>
              </Col>
            </Row>

            {/* AI Preview Section */}
            <div className="mt-4 pt-3 border-top">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <div>
                  <h6 className="mb-1">
                    <i className="fas fa-magic text-primary me-2"></i>
                    AI Welcome Message Preview
                  </h6>
                  <small className="text-muted">
                    Get a preview of AI-generated customer communications
                  </small>
                </div>
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={generateQuickPreview}
                  disabled={isGeneratingPreview || !formData.firstName || !formData.lastName || !formData.customerType}
                >
                  {isGeneratingPreview ? (
                    <>
                      <Spinner as="span" animation="border" size="sm" className="me-1" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-wand-magic-sparkles me-1"></i>
                      Generate Preview
                    </>
                  )}
                </Button>
              </div>
              
              {quickPreview && (
                <Alert variant="info" className="mb-0">
                  <div className="d-flex align-items-start">
                    <i className="fas fa-quote-left text-primary me-2 mt-1"></i>
                    <div className="flex-grow-1">
                      <em>{quickPreview}</em>
                      <div className="mt-2">
                        <small className="text-muted">
                          💡 Complete the form to get full AI suggestions including welcome emails, 
                          response templates, and onboarding checklists!
                        </small>
                      </div>
                    </div>
                  </div>
                </Alert>
              )}
            </div>
          </Card.Body>
        </Card>

        {/* Shipping Address */}
        <Card className="mb-4">
          <Card.Header>
            <h5 className="mb-0">
              <i className="fas fa-shipping-fast me-2 text-primary"></i>
              Shipping Address
            </h5>
          </Card.Header>
          <Card.Body>
            <Row className="g-3">
              <Col md={12}>
                <Form.Group>
                  <Form.Label>Address Line 1 <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.shippingAddress.address1}
                    onChange={(e) => handleAddressChange('shippingAddress', 'address1', e.target.value)}
                    isInvalid={!!fieldErrors['shippingAddress.address1']}
                  />
                  <Form.Control.Feedback type="invalid">
                    {fieldErrors['shippingAddress.address1']}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Group>
                  <Form.Label>Address Line 2</Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.shippingAddress.address2}
                    onChange={(e) => handleAddressChange('shippingAddress', 'address2', e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>City <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.shippingAddress.city}
                    onChange={(e) => handleAddressChange('shippingAddress', 'city', e.target.value)}
                    isInvalid={!!fieldErrors['shippingAddress.city']}
                  />
                  <Form.Control.Feedback type="invalid">
                    {fieldErrors['shippingAddress.city']}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>State/Province</Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.shippingAddress.province}
                    onChange={(e) => handleAddressChange('shippingAddress', 'province', e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group>
                  <Form.Label>ZIP/Postal Code <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.shippingAddress.zip}
                    onChange={(e) => handleAddressChange('shippingAddress', 'zip', e.target.value)}
                    isInvalid={!!fieldErrors['shippingAddress.zip']}
                  />
                  <Form.Control.Feedback type="invalid">
                    {fieldErrors['shippingAddress.zip']}
                  </Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Country</Form.Label>
                  <Form.Select
                    value={formData.shippingAddress.country}
                    onChange={(e) => handleAddressChange('shippingAddress', 'country', e.target.value)}
                  >
                    <option value="United States">United States</option>
                    <option value="Canada">Canada</option>
                    <option value="Mexico">Mexico</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {/* Billing Address */}
        <Card className="mb-4">
          <Card.Header>
            <h5 className="mb-0">
              <i className="fas fa-file-invoice me-2 text-primary"></i>
              Billing Address
            </h5>
          </Card.Header>
          <Card.Body>
            <Form.Check
              type="checkbox"
              label="Use same address for billing"
              checked={formData.useSameAddressForBilling}
              onChange={(e) => handleInputChange('useSameAddressForBilling', e.target.checked)}
              className="mb-3"
            />

            {!formData.useSameAddressForBilling && (
              <Row className="g-3">
                <Col md={12}>
                  <Form.Group>
                    <Form.Label>Address Line 1 <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="text"
                      value={formData.billingAddress.address1}
                      onChange={(e) => handleAddressChange('billingAddress', 'address1', e.target.value)}
                      isInvalid={!!fieldErrors['billingAddress.address1']}
                    />
                    <Form.Control.Feedback type="invalid">
                      {fieldErrors['billingAddress.address1']}
                    </Form.Control.Feedback>
                  </Form.Group>
                </Col>
                <Col md={12}>
                  <Form.Group>
                    <Form.Label>Address Line 2</Form.Label>
                    <Form.Control
                      type="text"
                      value={formData.billingAddress.address2}
                      onChange={(e) => handleAddressChange('billingAddress', 'address2', e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>City <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="text"
                      value={formData.billingAddress.city}
                      onChange={(e) => handleAddressChange('billingAddress', 'city', e.target.value)}
                      isInvalid={!!fieldErrors['billingAddress.city']}
                    />
                    <Form.Control.Feedback type="invalid">
                      {fieldErrors['billingAddress.city']}
                    </Form.Control.Feedback>
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>State/Province</Form.Label>
                    <Form.Control
                      type="text"
                      value={formData.billingAddress.province}
                      onChange={(e) => handleAddressChange('billingAddress', 'province', e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col md={4}>
                  <Form.Group>
                    <Form.Label>ZIP/Postal Code <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="text"
                      value={formData.billingAddress.zip}
                      onChange={(e) => handleAddressChange('billingAddress', 'zip', e.target.value)}
                      isInvalid={!!fieldErrors['billingAddress.zip']}
                    />
                    <Form.Control.Feedback type="invalid">
                      {fieldErrors['billingAddress.zip']}
                    </Form.Control.Feedback>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Country</Form.Label>
                    <Form.Select
                      value={formData.billingAddress.country}
                      onChange={(e) => handleAddressChange('billingAddress', 'country', e.target.value)}
                    >
                      <option value="United States">United States</option>
                      <option value="Canada">Canada</option>
                      <option value="Mexico">Mexico</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
              </Row>
            )}
          </Card.Body>
        </Card>

        {/* Additional Information */}
        <Card className="mb-4">
          <Card.Header>
            <h5 className="mb-0">
              <i className="fas fa-sticky-note me-2 text-primary"></i>
              Additional Information
            </h5>
          </Card.Header>
          <Card.Body>
            <Form.Group>
              <Form.Label>Notes</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Add any additional notes about this customer..."
              />
            </Form.Group>
          </Card.Body>
        </Card>

        {/* Action Buttons */}
        <div className="d-flex justify-content-between">
          <Link href="/admin" className="btn btn-outline-secondary">
            <i className="fas fa-arrow-left me-2"></i>
            Back to Admin
          </Link>
          
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
            className="px-4"
          >
            {isSubmitting ? (
              <>
                <Spinner as="span" animation="border" size="sm" role="status" className="me-2" />
                Creating Customer...
              </>
            ) : (
              <>
                <i className="fas fa-plus me-2"></i>
                Create Customer
              </>
            )}
          </Button>
        </div>
      </Form>

      {/* AI Suggestions Modal */}
      <Modal 
        show={showAiModal} 
        onHide={() => setShowAiModal(false)} 
        size="xl" 
        backdrop="static"
        keyboard={false}
      >
        <Modal.Header>
          <Modal.Title className="d-flex align-items-center">
            <i className="fas fa-magic text-primary me-2"></i>
            AI Customer Communication Suggestions
            {aiSuggestions?.estimatedCostSavings && (
              <Badge bg="success" className="ms-2">
                Save {aiSuggestions.estimatedCostSavings.timeInMinutes} min
              </Badge>
            )}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {aiSuggestions && (
            <Tabs activeKey={activeTab} onSelect={(k) => setActiveTab(k || 'welcome')} className="mb-3">
              {/* Welcome Email Tab */}
              <Tab eventKey="welcome" title={<><i className="fas fa-envelope me-1"></i>Welcome Email</>}>
                <Card className="mb-3">
                  <Card.Header className="d-flex justify-content-between align-items-center">
                    <h6 className="mb-0">📧 Welcome Email</h6>
                    <Button 
                      size="sm" 
                      variant="outline-primary"
                      onClick={() => navigator.clipboard.writeText(`Subject: ${aiSuggestions.welcomeEmail.subject}\n\n${aiSuggestions.welcomeEmail.body}`)}
                    >
                      <i className="fas fa-copy me-1"></i>Copy
                    </Button>
                  </Card.Header>
                  <Card.Body>
                    <div className="mb-2">
                      <strong>Subject:</strong> {aiSuggestions.welcomeEmail.subject}
                    </div>
                    <div className="border p-3 bg-light rounded">
                      <div style={{ whiteSpace: 'pre-line' }}>
                        {aiSuggestions.welcomeEmail.body}
                      </div>
                    </div>
                  </Card.Body>
                </Card>
              </Tab>

              {/* Follow-up Actions Tab */}
              <Tab eventKey="actions" title={<><i className="fas fa-tasks me-1"></i>Follow-up Actions</>}>
                <Card className="mb-3">
                  <Card.Header className="d-flex justify-content-between align-items-center">
                    <h6 className="mb-0">🎯 Recommended Follow-up Actions</h6>
                    <Button 
                      size="sm" 
                      variant="outline-primary"
                      onClick={() => navigator.clipboard.writeText(aiSuggestions.followUpActions.join('\n'))}
                    >
                      <i className="fas fa-copy me-1"></i>Copy List
                    </Button>
                  </Card.Header>
                  <Card.Body>
                    {aiSuggestions.followUpActions.map((action, index) => (
                      <div key={index} className="d-flex align-items-start mb-2">
                        <Badge bg="primary" className="me-2 mt-1">{index + 1}</Badge>
                        <span>{action}</span>
                      </div>
                    ))}
                  </Card.Body>
                </Card>
              </Tab>

              {/* Response Templates Tab */}
              <Tab eventKey="templates" title={<><i className="fas fa-reply me-1"></i>Response Templates</>}>
                <Row className="g-3">
                  {Object.entries(aiSuggestions.commonResponseTemplates).map(([key, template]) => (
                    <Col md={6} key={key}>
                      <Card className="h-100">
                        <Card.Header className="d-flex justify-content-between align-items-center">
                          <h6 className="mb-0 text-capitalize">
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </h6>
                          <Button 
                            size="sm" 
                            variant="outline-primary"
                            onClick={() => navigator.clipboard.writeText(template)}
                          >
                            <i className="fas fa-copy"></i>
                          </Button>
                        </Card.Header>
                        <Card.Body>
                          <div style={{ whiteSpace: 'pre-line', fontSize: '0.9rem' }}>
                            {template}
                          </div>
                        </Card.Body>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </Tab>

              {/* Customer Service Tips Tab */}
              <Tab eventKey="tips" title={<><i className="fas fa-lightbulb me-1"></i>Service Tips</>}>
                <Card className="mb-3">
                  <Card.Header>
                    <h6 className="mb-0">💡 Customer Service Tips</h6>
                  </Card.Header>
                  <Card.Body>
                    {aiSuggestions.customerServiceTips.map((tip, index) => (
                      <div key={index} className="d-flex align-items-start mb-3">
                        <i className="fas fa-star text-warning me-2 mt-1"></i>
                        <span>{tip}</span>
                      </div>
                    ))}
                  </Card.Body>
                </Card>

                <Card>
                  <Card.Header>
                    <h6 className="mb-0">📋 Onboarding Checklist</h6>
                  </Card.Header>
                  <Card.Body>
                    {aiSuggestions.onboardingChecklist.map((item, index) => (
                      <div key={index} className="d-flex align-items-start mb-2">
                        <Form.Check 
                          type="checkbox" 
                          className="me-2" 
                          id={`checklist-${index}`}
                        />
                        <label htmlFor={`checklist-${index}`} className="form-check-label">
                          {item}
                        </label>
                      </div>
                    ))}
                  </Card.Body>
                </Card>
              </Tab>
            </Tabs>
          )}

          {aiSuggestions?.estimatedCostSavings && (
            <Alert variant="success" className="mt-3">
              <div className="d-flex align-items-center">
                <i className="fas fa-dollar-sign me-2"></i>
                <div>
                  <strong>Estimated Cost Savings:</strong> {aiSuggestions.estimatedCostSavings.timeInMinutes} minutes
                  <br />
                  <small>{aiSuggestions.estimatedCostSavings.description}</small>
                </div>
              </div>
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowAiModal(false)}>
            Close
          </Button>
          <Button 
            variant="primary" 
            onClick={() => {
              setShowAiModal(false);
              router.push('/admin');
            }}
          >
            <i className="fas fa-check me-1"></i>
            Continue to Admin Dashboard
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default CreateCustomerClient; 