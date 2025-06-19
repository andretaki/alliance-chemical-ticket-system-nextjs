'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Form, Row, Col, Spinner, Modal, Badge, Accordion } from 'react-bootstrap';
import Link from 'next/link';

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
}

interface CustomerCommunicationSuggestion {
  welcomeEmail: {
    subject: string;
    body: string;
    personalizedGreeting: string;
  };
  followUpActions: string[];
  onboardingChecklist: string[];
  commonResponseTemplates: {
    quotingProcess: string;
    shippingInquiry: string;
    productAvailability: string;
    technicalSupport: string;
  };
  customerServiceTips: string[];
  estimatedCostSavings: {
    timeInMinutes: number;
    description: string;
  };
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

  // AI Suggestions State
  const [aiSuggestions, setAiSuggestions] = useState<CustomerCommunicationSuggestion | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState<{
    welcomeEmail: boolean;
    followUpActions: boolean[];
    onboardingChecklist: boolean[];
    responseTemplates: {
      quotingProcess: boolean;
      shippingInquiry: boolean;
      productAvailability: boolean;
      technicalSupport: boolean;
    };
    customerServiceTips: boolean[];
  }>({
    welcomeEmail: false,
    followUpActions: [],
    onboardingChecklist: [],
    responseTemplates: {
      quotingProcess: false,
      shippingInquiry: false,
      productAvailability: false,
      technicalSupport: false,
    },
    customerServiceTips: [],
  });

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
        
        // Reset form
        setTimeout(() => {
          router.push('/admin');
        }, 2000);
      } else {
        setError(result.error || 'Failed to create customer');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const generateAISuggestions = async () => {
    // Validate required fields for AI generation
    if (!formData.firstName.trim() || !formData.lastName.trim() || !formData.email.trim()) {
      setAiError('Please fill in customer name and email before generating AI suggestions');
      return;
    }

    setIsGeneratingAI(true);
    setAiError(null);

    try {
      const customerProfile = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        company: formData.company,
        customerType: formData.customerType,
        shippingAddress: {
          city: formData.shippingAddress.city || 'Not specified',
          province: formData.shippingAddress.province || 'Not specified',
          country: formData.shippingAddress.country || 'United States',
        }
      };

      const response = await fetch('/api/admin/customers/ai-suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ customerProfile }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate AI suggestions');
      }

      const result = await response.json();
      
      if (result.success && result.suggestions) {
        setAiSuggestions(result.suggestions);
        // Initialize selection states
        setSelectedSuggestions({
          welcomeEmail: false,
          followUpActions: new Array(result.suggestions.followUpActions.length).fill(false),
          onboardingChecklist: new Array(result.suggestions.onboardingChecklist.length).fill(false),
          responseTemplates: {
            quotingProcess: false,
            shippingInquiry: false,
            productAvailability: false,
            technicalSupport: false,
          },
          customerServiceTips: new Array(result.suggestions.customerServiceTips.length).fill(false),
        });
        setShowAiModal(true);
      } else {
        setAiError(result.error || 'Failed to generate AI suggestions');
      }
    } catch (err: any) {
      setAiError(err.message || 'An error occurred while generating AI suggestions');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const applySelectedSuggestions = () => {
    if (!aiSuggestions) return;

    let notesAddition = '';

    // Add AI suggestions to notes
    if (selectedSuggestions.welcomeEmail) {
      notesAddition += `\n\n**AI Welcome Email Suggestion:**\nSubject: ${aiSuggestions.welcomeEmail.subject}\n\n${aiSuggestions.welcomeEmail.body}\n`;
    }

    if (selectedSuggestions.followUpActions.some(selected => selected)) {
      notesAddition += '\n\n**AI Follow-Up Actions:**\n';
      selectedSuggestions.followUpActions.forEach((selected, index) => {
        if (selected) {
          notesAddition += `• ${aiSuggestions.followUpActions[index]}\n`;
        }
      });
    }

    if (selectedSuggestions.onboardingChecklist.some(selected => selected)) {
      notesAddition += '\n\n**AI Onboarding Checklist:**\n';
      selectedSuggestions.onboardingChecklist.forEach((selected, index) => {
        if (selected) {
          notesAddition += `• ${aiSuggestions.onboardingChecklist[index]}\n`;
        }
      });
    }

    const responseTemplateEntries = Object.entries(selectedSuggestions.responseTemplates);
    if (responseTemplateEntries.some(([_, selected]) => selected)) {
      notesAddition += '\n\n**AI Response Templates:**\n';
      responseTemplateEntries.forEach(([key, selected]) => {
        if (selected) {
          const templateKey = key as keyof typeof aiSuggestions.commonResponseTemplates;
          notesAddition += `• ${key.charAt(0).toUpperCase() + key.slice(1)}: ${aiSuggestions.commonResponseTemplates[templateKey]}\n\n`;
        }
      });
    }

    if (selectedSuggestions.customerServiceTips.some(selected => selected)) {
      notesAddition += '\n\n**AI Customer Service Tips:**\n';
      selectedSuggestions.customerServiceTips.forEach((selected, index) => {
        if (selected) {
          notesAddition += `• ${aiSuggestions.customerServiceTips[index]}\n`;
        }
      });
    }

    // Add cost savings info if any suggestions were selected
    const hasSelections = selectedSuggestions.welcomeEmail || 
      selectedSuggestions.followUpActions.some(s => s) ||
      selectedSuggestions.onboardingChecklist.some(s => s) ||
      Object.values(selectedSuggestions.responseTemplates).some(s => s) ||
      selectedSuggestions.customerServiceTips.some(s => s);

    if (hasSelections) {
      notesAddition += `\n\n**AI Cost Savings:** ${aiSuggestions.estimatedCostSavings.description} (Est. ${aiSuggestions.estimatedCostSavings.timeInMinutes} minutes saved)`;
    }

    // Update form data
    setFormData(prev => ({
      ...prev,
      notes: prev.notes + notesAddition
    }));

    setShowAiModal(false);
    
    // Show success message
    alert('AI suggestions have been added to the customer notes. You can edit them before saving.');
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

      {aiError && (
        <Alert variant="warning" dismissible onClose={() => setAiError(null)} className="mb-4">
          <Alert.Heading>AI Suggestions</Alert.Heading>
          {aiError}
        </Alert>
      )}

      <Form onSubmit={handleSubmit}>
        {/* Personal Information */}
        <Card className="mb-4">
          <Card.Header className="d-flex justify-content-between align-items-center">
            <div>
              <h5 className="mb-0">
                <i className="fas fa-user me-2 text-primary"></i>
                Personal Information
              </h5>
            </div>
            <Button
              variant="outline-primary"
              size="sm"
              onClick={generateAISuggestions}
              disabled={isGeneratingAI || !formData.firstName.trim() || !formData.lastName.trim() || !formData.email.trim()}
            >
              {isGeneratingAI ? (
                <>
                  <Spinner as="span" animation="border" size="sm" className="me-2" />
                  Generating AI Suggestions...
                </>
              ) : (
                <>
                  <i className="fas fa-magic me-2"></i>
                  Generate AI Suggestions
                </>
              )}
            </Button>
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
              {formData.notes.includes('**AI') && (
                <Badge bg="success" className="ms-2">
                  <i className="fas fa-robot me-1"></i>
                  AI Enhanced
                </Badge>
              )}
            </h5>
          </Card.Header>
          <Card.Body>
            <Form.Group>
              <Form.Label>Notes</Form.Label>
              <Form.Control
                as="textarea"
                rows={formData.notes.includes('**AI') ? 10 : 3}
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Add any additional notes about this customer..."
              />
              <Form.Text className="text-muted">
                {formData.notes.includes('**AI') && (
                  <><i className="fas fa-info-circle me-1"></i>This section contains AI-generated suggestions. You can edit them before saving.</>
                )}
              </Form.Text>
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
      <Modal show={showAiModal} onHide={() => setShowAiModal(false)} size="xl">
        <Modal.Header closeButton>
          <Modal.Title>
            <i className="fas fa-robot me-2 text-primary"></i>
            AI Customer Communication Suggestions
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {aiSuggestions && (
            <>
              <Alert variant="info" className="mb-4">
                <div className="d-flex align-items-center">
                  <i className="fas fa-clock me-2"></i>
                  <div>
                    <strong>Estimated Time Savings: {aiSuggestions.estimatedCostSavings.timeInMinutes} minutes</strong>
                    <br />
                    <small>{aiSuggestions.estimatedCostSavings.description}</small>
                  </div>
                </div>
              </Alert>

              <Accordion defaultActiveKey={['0']} alwaysOpen>
                {/* Welcome Email */}
                <Accordion.Item eventKey="0">
                  <Accordion.Header>
                    <Form.Check
                      type="checkbox"
                      checked={selectedSuggestions.welcomeEmail}
                      onChange={(e) => setSelectedSuggestions(prev => ({
                        ...prev,
                        welcomeEmail: e.target.checked
                      }))}
                      className="me-2"
                    />
                    <strong>Welcome Email Template</strong>
                  </Accordion.Header>
                  <Accordion.Body>
                    <div className="border rounded p-3 bg-light">
                      <h6><strong>Subject:</strong> {aiSuggestions.welcomeEmail.subject}</h6>
                      <div className="mt-2">
                        <strong>Body:</strong>
                        <div className="mt-1" style={{ whiteSpace: 'pre-line' }}>
                          {aiSuggestions.welcomeEmail.body}
                        </div>
                      </div>
                    </div>
                  </Accordion.Body>
                </Accordion.Item>

                {/* Follow-up Actions */}
                <Accordion.Item eventKey="1">
                  <Accordion.Header>
                    <strong>Follow-up Actions ({selectedSuggestions.followUpActions.filter(Boolean).length} selected)</strong>
                  </Accordion.Header>
                  <Accordion.Body>
                    {aiSuggestions.followUpActions.map((action, index) => (
                      <Form.Check
                        key={index}
                        type="checkbox"
                        label={action}
                        checked={selectedSuggestions.followUpActions[index] || false}
                        onChange={(e) => {
                          const newActions = [...selectedSuggestions.followUpActions];
                          newActions[index] = e.target.checked;
                          setSelectedSuggestions(prev => ({
                            ...prev,
                            followUpActions: newActions
                          }));
                        }}
                        className="mb-2"
                      />
                    ))}
                  </Accordion.Body>
                </Accordion.Item>

                {/* Onboarding Checklist */}
                <Accordion.Item eventKey="2">
                  <Accordion.Header>
                    <strong>Onboarding Checklist ({selectedSuggestions.onboardingChecklist.filter(Boolean).length} selected)</strong>
                  </Accordion.Header>
                  <Accordion.Body>
                    {aiSuggestions.onboardingChecklist.map((item, index) => (
                      <Form.Check
                        key={index}
                        type="checkbox"
                        label={item}
                        checked={selectedSuggestions.onboardingChecklist[index] || false}
                        onChange={(e) => {
                          const newChecklist = [...selectedSuggestions.onboardingChecklist];
                          newChecklist[index] = e.target.checked;
                          setSelectedSuggestions(prev => ({
                            ...prev,
                            onboardingChecklist: newChecklist
                          }));
                        }}
                        className="mb-2"
                      />
                    ))}
                  </Accordion.Body>
                </Accordion.Item>

                {/* Response Templates */}
                <Accordion.Item eventKey="3">
                  <Accordion.Header>
                    <strong>Response Templates ({Object.values(selectedSuggestions.responseTemplates).filter(Boolean).length} selected)</strong>
                  </Accordion.Header>
                  <Accordion.Body>
                    {Object.entries(aiSuggestions.commonResponseTemplates).map(([key, template]) => (
                      <div key={key} className="mb-3">
                        <Form.Check
                          type="checkbox"
                          label={<strong>{key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}</strong>}
                          checked={selectedSuggestions.responseTemplates[key as keyof typeof selectedSuggestions.responseTemplates]}
                          onChange={(e) => setSelectedSuggestions(prev => ({
                            ...prev,
                            responseTemplates: {
                              ...prev.responseTemplates,
                              [key]: e.target.checked
                            }
                          }))}
                          className="mb-2"
                        />
                        <div className="ms-4 text-muted small">
                          {template.substring(0, 100)}...
                        </div>
                      </div>
                    ))}
                  </Accordion.Body>
                </Accordion.Item>

                {/* Customer Service Tips */}
                <Accordion.Item eventKey="4">
                  <Accordion.Header>
                    <strong>Customer Service Tips ({selectedSuggestions.customerServiceTips.filter(Boolean).length} selected)</strong>
                  </Accordion.Header>
                  <Accordion.Body>
                    {aiSuggestions.customerServiceTips.map((tip, index) => (
                      <Form.Check
                        key={index}
                        type="checkbox"
                        label={tip}
                        checked={selectedSuggestions.customerServiceTips[index] || false}
                        onChange={(e) => {
                          const newTips = [...selectedSuggestions.customerServiceTips];
                          newTips[index] = e.target.checked;
                          setSelectedSuggestions(prev => ({
                            ...prev,
                            customerServiceTips: newTips
                          }));
                        }}
                        className="mb-2"
                      />
                    ))}
                  </Accordion.Body>
                </Accordion.Item>
              </Accordion>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowAiModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={applySelectedSuggestions}>
            <i className="fas fa-check me-2"></i>
            Apply Selected Suggestions
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default CreateCustomerClient; 