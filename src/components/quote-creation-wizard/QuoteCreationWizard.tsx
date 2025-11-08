'use client';

import React, { useState, useEffect } from 'react';
import { useForm, FormProvider, SubmitHandler } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import axios, { AxiosError } from 'axios';
import { toast } from 'react-hot-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { quoteFormSchema, QuoteFormData, defaultValues } from './types';
import { SHOPIFY_TAGS, SHOPIFY_CUSTOM_ATTRIBUTES } from '@/config/constants';
import { useFormDraft } from './hooks/useFormDraft';
import CustomerStep from './steps/CustomerStep';
import ProductsStep from './steps/ProductsStep';
import AddressStep from './steps/AddressStep';
import ReviewStep from './steps/ReviewStep';

const steps = [
  { id: 1, name: 'Customer Information', component: CustomerStep, fields: ['customer'] },
  { id: 2, name: 'Product Selection', component: ProductsStep, fields: ['lineItems'] },
  { id: 3, name: 'Shipping & Billing', component: AddressStep, fields: ['shippingAddress', 'useSameAddressForBilling'] },
  { id: 4, name: 'Review & Submit', component: ReviewStep, fields: [] },
];

interface QuoteCreationWizardProps {
  ticketId?: number;
  initialCustomer?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    company?: string;
  };
}

const QuoteCreationWizard: React.FC<QuoteCreationWizardProps> = ({ ticketId: providedTicketId, initialCustomer }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<{
    success: boolean;
    draftOrder?: any;
    ticketId?: number;
    error?: string;
  } | null>(null);
  const [showDraftNotification, setShowDraftNotification] = useState(false);

  const router = useRouter();

  // Merge initial customer data with default values
  const initialValues = {
    ...defaultValues,
    customer: {
      ...defaultValues.customer,
      ...initialCustomer,
    },
  };

  const methods = useForm<QuoteFormData>({
    resolver: zodResolver(quoteFormSchema),
    mode: 'onBlur',
    defaultValues: initialValues,
  });

  const { handleSubmit, trigger, watch, reset } = methods;

  // Form draft management
  const { clearDraft, restoreDraft, hasDraft, saveDraft } = useFormDraft({
    watch,
    reset,
    ticketId: providedTicketId,
  });

  // Check for and offer to restore draft on mount
  useEffect(() => {
    if (!initialCustomer && hasDraft()) {
      setShowDraftNotification(true);
    }
  }, [initialCustomer, hasDraft]);

  const onSubmit: SubmitHandler<QuoteFormData> = async (data) => {
    console.log('🚀 Starting quote submission with data:', data);
    setIsSubmitting(true);

    try {
      // Step 1: Use provided ticketId or create a new ticket if authenticated
      let ticketId = providedTicketId || null;

      if (!providedTicketId) {
        try {
          const sessionResponse = await axios.get('/api/auth/session');

          if (sessionResponse.data && sessionResponse.data.user) {
            console.log('✅ User authenticated, creating ticket...');
            const ticketResponse = await axios.post('/api/tickets', {
              title: `Quote Request - ${data.customer.company || `${data.customer.firstName} ${data.customer.lastName}`.trim() || data.customer.email}`,
              description: `Quote request created from the quote creation wizard.\n\nCustomer: ${data.customer.firstName} ${data.customer.lastName}\nEmail: ${data.customer.email}\nPhone: ${data.customer.phone}\nCompany: ${data.customer.company}\n\nNote: ${data.note || 'No additional notes'}`,
              type: 'Quote Request',
              priority: 'medium',
              status: 'new',
              senderEmail: data.customer.email,
              senderPhone: data.customer.phone,
              senderName: `${data.customer.firstName} ${data.customer.lastName}`.trim(),
              sendercompany: data.customer.company
            });

            ticketId = ticketResponse.data.ticket.id;
            console.log(`✅ Ticket #${ticketId} created successfully`);
            toast.success(`Ticket #${ticketId} created!`);
          } else {
            console.log('ℹ️ User not authenticated, skipping ticket creation');
          }
        } catch (ticketError) {
          console.error('⚠️ Error creating ticket (continuing with quote):', ticketError);
          toast.error('Could not create ticket, but continuing with quote...');
        }
      } else {
        console.log(`ℹ️ Using provided Ticket #${providedTicketId} for quote`);
      }

      // Step 2: Prepare the draft order data
      console.log('📦 Preparing draft order data...');
      
      const filteredLineItems = data.lineItems.filter(item => item.numericVariantIdShopify && item.quantity > 0);
      if (filteredLineItems.length === 0) {
        throw new Error('No valid products selected for the quote');
      }

      // Prepare note text
      let noteText = `Quote created from quote creation wizard.`;
      if (ticketId) {
        noteText += ` Related to Ticket #${ticketId}.`;
      }
      if (data.note) {
        noteText += ` ${data.note}`;
      }
      
      // Prepare tags using constants
      const quoteTags = [SHOPIFY_TAGS.QUOTE_WIZARD];
      if (ticketId) {
        quoteTags.push(SHOPIFY_TAGS.createTicketIdTag(ticketId));
      }

      // Add quote type tag
      if (data.quoteType === 'material_only') {
        quoteTags.push(SHOPIFY_TAGS.MATERIAL_ONLY);
      } else if (data.quoteType === 'material_and_delivery') {
        quoteTags.push(SHOPIFY_TAGS.MATERIAL_AND_DELIVERY);
      }

      // Prepare custom attributes for quote metadata using constants
      const customAttributes: Array<{ key: string; value: string }> = [
        { key: SHOPIFY_CUSTOM_ATTRIBUTES.QUOTE_TYPE, value: data.quoteType },
        { key: SHOPIFY_CUSTOM_ATTRIBUTES.CREATED_VIA, value: 'QuoteWizard' }
      ];

      if (data.quoteType === 'material_only') {
        customAttributes.push(
          { key: SHOPIFY_CUSTOM_ATTRIBUTES.MATERIAL_ONLY_DISCLAIMER, value: data.materialOnlyDisclaimer || '' },
          { key: SHOPIFY_CUSTOM_ATTRIBUTES.DELIVERY_TERMS, value: data.deliveryTerms || '' }
        );
      }

      // Prepare the draft order input
      const draftOrderInput = {
        lineItems: filteredLineItems.map(({ productDisplay, unitPrice, currencyCode, ...rest }) => rest),
        customer: {
          email: data.customer.email,
          firstName: data.customer.firstName,
          lastName: data.customer.lastName,
          phone: data.customer.phone || '',
          company: data.customer.company || ''
        },
        shopifyCustomerId: data.customer.shopifyCustomerId,
        shippingAddress: data.shippingAddress,
        billingAddress: data.useSameAddressForBilling ? data.shippingAddress : data.billingAddress,
        note: noteText.trim(),
        email: data.sendShopifyInvoice ? data.customer.email : undefined,
        tags: quoteTags,
        quoteType: data.quoteType,
        materialOnlyDisclaimer: data.quoteType === 'material_only' ? data.materialOnlyDisclaimer : undefined,
        deliveryTerms: data.quoteType === 'material_only' ? data.deliveryTerms : undefined,
        customAttributes: customAttributes.length > 0 ? customAttributes : undefined,
      };

      // Add shipping line if available (from ReviewStep)
      const watchedData = watch();
      // We'll need to get shipping data from the ReviewStep somehow
      // For now, we'll skip this and let the user calculate it in the review step

      console.log('🚀 Submitting draft order to API...');
      const draftOrderResponse = await axios.post('/api/draft-orders', draftOrderInput);
      
      console.log('✅ Draft order created successfully:', draftOrderResponse.data);

      setSubmissionResult({
        success: true,
        draftOrder: draftOrderResponse.data,
        ticketId
      });

      // Clear the saved draft since submission was successful
      clearDraft();

      toast.success(`🎉 Quote #${draftOrderResponse.data.name} created successfully!`);

      // Optional: Auto-navigate to success state or ticket
      // router.push(`/tickets/${ticketId}`);

    } catch (err) {
      console.error('❌ Error in quote creation process:', err);
      const axiosError = err as AxiosError<{ error?: string }>;

      // Provide user-friendly error messages based on error type
      let errorMessage = 'An unexpected error occurred. Please try again.';
      let userFriendlyMessage = '';

      if (axiosError.response) {
        // Server responded with error
        const statusCode = axiosError.response.status;
        const serverError = axiosError.response.data?.error;

        switch (statusCode) {
          case 400:
            errorMessage = serverError || 'Invalid quote data. Please check all fields and try again.';
            userFriendlyMessage = 'Please verify that all required fields are filled out correctly.';
            break;
          case 401:
            errorMessage = 'Your session has expired. Please log in again.';
            userFriendlyMessage = 'For security, you need to log in again to create quotes.';
            break;
          case 403:
            errorMessage = 'You do not have permission to create quotes.';
            userFriendlyMessage = 'Please contact your administrator for access.';
            break;
          case 500:
            errorMessage = 'Server error. Our team has been notified.';
            userFriendlyMessage = 'Please try again in a few minutes. If the problem persists, contact support.';
            break;
          default:
            errorMessage = serverError || `Server error (${statusCode})`;
        }
      } else if (axiosError.request) {
        // Request made but no response
        errorMessage = 'Unable to reach the server. Please check your internet connection.';
        userFriendlyMessage = 'Make sure you are connected to the internet and try again.';
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }

      // Check for GraphQL errors if applicable
      if (axiosError.response?.data && (axiosError.response.data as any).errors) {
        const graphQLErrors = (axiosError.response.data as any).errors.map((e: any) => e.message).join(', ');
        errorMessage = `Shopify Error: ${graphQLErrors}`;
        userFriendlyMessage = 'There was an issue communicating with Shopify. Please verify the product and customer information.';
      }

      setSubmissionResult({
        success: false,
        error: errorMessage,
        details: userFriendlyMessage
      } as any);

      toast.error(errorMessage, { duration: 5000 });
      if (userFriendlyMessage) {
        toast.error(userFriendlyMessage, { duration: 7000 });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = async () => {
    if (currentStep < steps.length) {
      const currentStepFields = steps[currentStep - 1].fields as (keyof QuoteFormData)[];
      
      // Skip validation for review step
      if (currentStepFields.length > 0) {
        const isValid = await trigger(currentStepFields);
        if (!isValid) {
          toast.error('Please fix the errors before continuing.');
          return;
        }
      }
      
      setCurrentStep((prev) => prev + 1);
      toast.success(`Step ${currentStep + 1} completed!`);
    }
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const ActiveStepComponent = steps.find(step => step.id === currentStep)?.component;

  // Show success state
  if (submissionResult?.success) {
    return (
      <div className="card shadow-sm">
        <div className="card-header bg-success text-white text-center">
          <h4 className="mb-0">🎉 Quote Created Successfully!</h4>
        </div>
        <div className="card-body text-center">
          <div className="mb-4">
            <i className="fas fa-check-circle fa-4x text-success mb-3"></i>
            <h5>Quote #{submissionResult.draftOrder?.name} has been created!</h5>
            <p className="text-muted">Your quote has been successfully submitted and is ready for review.</p>
          </div>
          
          <div className="row justify-content-center">
            <div className="col-md-8">
              <div className="card border-success">
                <div className="card-body">
                  <h6 className="card-title">Quote Details</h6>
                  <div className="row text-start">
                    <div className="col-sm-6">
                      <p><strong>Quote ID:</strong> {submissionResult.draftOrder?.name}</p>
                      <p><strong>Status:</strong> <span className="badge bg-success">{submissionResult.draftOrder?.status}</span></p>
                    </div>
                    <div className="col-sm-6">
                      <p><strong>Total:</strong> ${submissionResult.draftOrder?.totalPrice?.toFixed(2)} {submissionResult.draftOrder?.currencyCode}</p>
                      {submissionResult.ticketId && (
                        <p><strong>Ticket:</strong> #{submissionResult.ticketId}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 d-flex justify-content-center gap-3">
            <button 
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              <i className="fas fa-plus me-2"></i>Create Another Quote
            </button>
            
            {submissionResult.ticketId && (
              <button 
                className="btn btn-outline-primary"
                onClick={() => router.push(`/tickets/${submissionResult.ticketId}`)}
              >
                <i className="fas fa-ticket-alt me-2"></i>View Ticket
              </button>
            )}
            
            {submissionResult.draftOrder?.invoiceUrl && (
              <a 
                href={submissionResult.draftOrder.invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline-success"
              >
                <i className="fas fa-external-link-alt me-2"></i>View Invoice
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Show error state
  if (submissionResult?.success === false) {
    return (
      <div className="card shadow-sm border-danger">
        <div className="card-header bg-danger text-white text-center">
          <h4 className="mb-0"><i className="fas fa-exclamation-triangle me-2"></i>Quote Creation Failed</h4>
        </div>
        <div className="card-body text-center">
          <div className="mb-4">
            <i className="fas fa-exclamation-circle fa-4x text-danger mb-3"></i>
            <h5>We couldn't create your quote</h5>
            <p className="text-muted">Don't worry - your information is safe. Let's figure out what went wrong.</p>
          </div>

          <div className="alert alert-danger text-start">
            <h6 className="alert-heading"><i className="fas fa-bug me-2"></i>Error Details:</h6>
            <p className="mb-0"><strong>{submissionResult.error}</strong></p>
            {(submissionResult as any).details && (
              <p className="mb-0 mt-2 text-muted">
                <i className="fas fa-info-circle me-1"></i>
                {(submissionResult as any).details}
              </p>
            )}
          </div>

          <div className="card bg-light mb-4">
            <div className="card-body text-start">
              <h6><i className="fas fa-lightbulb me-2 text-warning"></i>What to try next:</h6>
              <ul className="mb-0">
                <li>Click "Try Again" to go back and review your quote</li>
                <li>Check that all required fields are filled correctly</li>
                <li>Verify the customer email address is valid</li>
                <li>Make sure all products are selected and have quantities</li>
                <li>If the problem persists, contact support for assistance</li>
              </ul>
            </div>
          </div>

          <div className="mt-4 d-flex justify-content-center gap-3">
            <button
              className="btn btn-primary btn-lg"
              onClick={() => {
                setSubmissionResult(null);
                setCurrentStep(steps.length); // Go back to review step
              }}
            >
              <i className="fas fa-arrow-left me-2"></i>Try Again
            </button>

            <button
              className="btn btn-outline-secondary btn-lg"
              onClick={() => window.location.reload()}
            >
              <i className="fas fa-redo me-2"></i>Start Over
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <FormProvider {...methods}>
      {/* Draft Notification Banner */}
      {showDraftNotification && (
        <div className="alert alert-info alert-dismissible fade show mb-3" role="alert">
          <div className="d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center">
              <i className="fas fa-save me-3 fs-4"></i>
              <div>
                <h6 className="mb-1">Saved Draft Found</h6>
                <p className="mb-0 small">Would you like to restore your previous quote draft?</p>
              </div>
            </div>
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => {
                  restoreDraft();
                  setShowDraftNotification(false);
                }}
              >
                <i className="fas fa-undo me-1"></i>Restore
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => {
                  clearDraft();
                  setShowDraftNotification(false);
                  toast.success('Draft discarded');
                }}
              >
                <i className="fas fa-trash me-1"></i>Discard
              </button>
            </div>
          </div>
          <button
            type="button"
            className="btn-close"
            onClick={() => setShowDraftNotification(false)}
            aria-label="Close"
          ></button>
        </div>
      )}

      <div className="card shadow-sm">
        <div className="card-header bg-light">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h4 className="mb-0">Create New Quote</h4>
              <div className="d-flex align-items-center gap-2">
                <p className="mb-0 text-muted">Step {currentStep} of {steps.length}: {steps[currentStep - 1].name}</p>
                <span className="badge bg-secondary opacity-75">
                  <i className="fas fa-cloud me-1"></i>Auto-saving
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="progress" style={{ width: '200px', height: '8px' }}>
              <div
                className="progress-bar bg-primary"
                role="progressbar"
                style={{ width: `${(currentStep / steps.length) * 100}%` }}
                aria-valuenow={currentStep}
                aria-valuemin={0}
                aria-valuemax={steps.length}
              ></div>
            </div>
          </div>
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit(onSubmit)}>
            {ActiveStepComponent && <ActiveStepComponent />}

            <div className="d-flex justify-content-between mt-4 pt-3 border-top">
              {currentStep > 1 ? (
                <button 
                  type="button" 
                  className="btn btn-outline-secondary" 
                  onClick={handlePrev}
                  disabled={isSubmitting}
                >
                  <i className="fas fa-arrow-left me-2"></i>Previous
                </button>
              ) : (
                <span></span>
              )}

              {currentStep < steps.length ? (
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  onClick={handleNext}
                  disabled={isSubmitting}
                >
                  Next<i className="fas fa-arrow-right ms-2"></i>
                </button>
              ) : (
                <button 
                  type="submit" 
                  className="btn btn-success btn-lg" 
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Creating Quote...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-rocket me-2"></i>Create Quote
                    </>
                  )}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </FormProvider>
  );
};

export default QuoteCreationWizard;
