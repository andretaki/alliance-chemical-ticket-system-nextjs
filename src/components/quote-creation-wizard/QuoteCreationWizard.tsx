'use client';

import React, { useState } from 'react';
import { useForm, FormProvider, SubmitHandler } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import axios, { AxiosError } from 'axios';
import { toast } from 'react-hot-toast';
// import { zodResolver } from '@hookform/resolvers/zod';
import { quoteFormSchema, QuoteFormData, defaultValues } from './types';
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

const QuoteCreationWizard = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<{
    success: boolean;
    draftOrder?: any;
    ticketId?: number;
    error?: string;
  } | null>(null);

  const router = useRouter();

  const methods = useForm<QuoteFormData>({
    // resolver: zodResolver(quoteFormSchema), // Temporarily disabled for troubleshooting
    mode: 'onBlur',
    defaultValues,
  });

  const { handleSubmit, trigger, watch } = methods;

  const onSubmit: SubmitHandler<QuoteFormData> = async (data) => {
    console.log('🚀 Starting quote submission with data:', data);
    setIsSubmitting(true);
    
    try {
      // Step 1: Check if user is authenticated and create ticket if possible
      let ticketId = null;
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
      
      // Prepare tags
      const quoteTags = ['QuoteWizard'];
      if (ticketId) {
        quoteTags.push(`TicketID-${ticketId}`);
      }
      
      // Add quote type tag
      if (data.quoteType === 'material_only') {
        quoteTags.push('MaterialOnly');
      } else if (data.quoteType === 'material_and_delivery') {
        quoteTags.push('MaterialAndDelivery');
      }

      // Prepare custom attributes for quote metadata
      const customAttributes: Array<{ key: string; value: string }> = [
        { key: 'quoteType', value: data.quoteType },
        { key: 'createdVia', value: 'QuoteWizard' }
      ];
      
      if (data.quoteType === 'material_only') {
        customAttributes.push(
          { key: 'materialOnlyDisclaimer', value: data.materialOnlyDisclaimer || '' },
          { key: 'deliveryTerms', value: data.deliveryTerms || '' }
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

      toast.success(`🎉 Quote #${draftOrderResponse.data.name} created successfully!`);
      
      // Optional: Auto-navigate to success state or ticket
      // router.push(`/tickets/${ticketId}`);

    } catch (err) {
      console.error('❌ Error in quote creation process:', err);
      const axiosError = err as AxiosError<{ error?: string }>;
      let errorMessage = axiosError.response?.data?.error || (err instanceof Error ? err.message : 'Failed to create quote');
      
      // Check for GraphQL errors if applicable
      if (axiosError.response?.data && (axiosError.response.data as any).errors) {
        errorMessage = (axiosError.response.data as any).errors.map((e: any) => e.message).join(', ');
      }

      setSubmissionResult({
        success: false,
        error: errorMessage
      });

      toast.error(`❌ ${errorMessage}`);
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
      <div className="card shadow-sm">
        <div className="card-header bg-danger text-white text-center">
          <h4 className="mb-0">❌ Quote Creation Failed</h4>
        </div>
        <div className="card-body text-center">
          <div className="mb-4">
            <i className="fas fa-exclamation-triangle fa-4x text-danger mb-3"></i>
            <h5>Something went wrong</h5>
            <p className="text-muted">We encountered an error while creating your quote.</p>
          </div>
          
          <div className="alert alert-danger">
            <strong>Error:</strong> {submissionResult.error}
          </div>

          <div className="mt-4">
            <button 
              className="btn btn-primary me-3"
              onClick={() => {
                setSubmissionResult(null);
                setCurrentStep(steps.length); // Go back to review step
              }}
            >
              <i className="fas fa-arrow-left me-2"></i>Try Again
            </button>
            
            <button 
              className="btn btn-outline-secondary"
              onClick={() => window.location.reload()}
            >
              <i className="fas fa-refresh me-2"></i>Start Over
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <FormProvider {...methods}>
      <div className="card shadow-sm">
        <div className="card-header bg-light">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h4 className="mb-0">Create New Quote</h4>
              <p className="mb-0 text-muted">Step {currentStep} of {steps.length}: {steps[currentStep - 1].name}</p>
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
