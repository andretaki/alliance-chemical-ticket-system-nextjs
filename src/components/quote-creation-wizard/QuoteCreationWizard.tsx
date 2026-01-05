'use client';

import React, { useState } from 'react';
import { useForm, FormProvider, SubmitHandler } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import axios, { AxiosError } from 'axios';
import { toast } from 'sonner';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, XCircle, ArrowLeft, ArrowRight, Rocket, Plus, Ticket, ExternalLink, RotateCcw, Loader2 } from 'lucide-react';
import { quoteFormSchema, QuoteFormData, defaultValues } from './types';
import CustomerStep from './steps/CustomerStep';
import ProductsStep from './steps/ProductsStep';
import AddressStep from './steps/AddressStep';
import ReviewStep from './steps/ReviewStep';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
    resolver: zodResolver(quoteFormSchema) as any,
    mode: 'onBlur',
    defaultValues,
  });

  const { handleSubmit, trigger, watch } = methods;

  const onSubmit: SubmitHandler<QuoteFormData> = async (data) => {
    console.log('Starting quote submission with data:', data);
    setIsSubmitting(true);

    try {
      // Step 1: Check if user is authenticated and create ticket if possible
      let ticketId = null;
      try {
        const sessionResponse = await axios.get('/api/auth/session');

        if (sessionResponse.data && sessionResponse.data.user) {
          console.log('User authenticated, creating ticket...');
          const ticketResponse = await axios.post('/api/tickets', {
            title: `Quote Request - ${data.customer.company || `${data.customer.firstName} ${data.customer.lastName}`.trim() || data.customer.email}`,
            description: `Quote request created from the quote creation wizard.\n\nCustomer: ${data.customer.firstName} ${data.customer.lastName}\nEmail: ${data.customer.email}\nPhone: ${data.customer.phone}\nCompany: ${data.customer.company}\n\nNote: ${data.note || 'No additional notes'}`,
            type: 'Quote Request',
            priority: 'medium',
            status: 'new',
            senderEmail: data.customer.email,
            senderPhone: data.customer.phone,
            senderName: `${data.customer.firstName} ${data.customer.lastName}`.trim(),
            senderCompany: data.customer.company
          });

          ticketId = ticketResponse.data.ticket.id;
          console.log(`Ticket #${ticketId} created successfully`);
          toast.success(`Ticket #${ticketId} created!`);
        } else {
          console.log('User not authenticated, skipping ticket creation');
        }
      } catch (ticketError) {
        console.error('Error creating ticket (continuing with quote):', ticketError);
        toast.error('Could not create ticket, but continuing with quote...');
      }

      // Step 2: Prepare the draft order data
      console.log('Preparing draft order data...');

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

      console.log('Submitting draft order to API...');
      const draftOrderResponse = await axios.post('/api/draft-orders', draftOrderInput);

      console.log('Draft order created successfully:', draftOrderResponse.data);

      setSubmissionResult({
        success: true,
        draftOrder: draftOrderResponse.data,
        ticketId
      });

      toast.success(`Quote #${draftOrderResponse.data.name} created successfully!`);

    } catch (err) {
      console.error('Error in quote creation process:', err);
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

      toast.error(`${errorMessage}`);
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
    }
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const ActiveStepComponent = steps.find(step => step.id === currentStep)?.component;

  // Show success state
  if (submissionResult?.success) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader className="text-center border-b bg-emerald-50 dark:bg-emerald-950/20">
          <div className="mx-auto mb-4">
            <CheckCircle2 className="h-16 w-16 text-emerald-500" />
          </div>
          <CardTitle className="text-2xl text-emerald-700 dark:text-emerald-400">
            Quote Created Successfully!
          </CardTitle>
          <CardDescription>
            Your quote has been successfully submitted and is ready for review.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <Card className="border-emerald-200 dark:border-emerald-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Quote Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Quote ID</p>
                  <p className="font-semibold">{submissionResult.draftOrder?.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant="default" className="bg-emerald-500">
                    {submissionResult.draftOrder?.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Total</p>
                  <p className="font-semibold">
                    ${submissionResult.draftOrder?.totalPrice?.toFixed(2)} {submissionResult.draftOrder?.currencyCode}
                  </p>
                </div>
                {submissionResult.ticketId && (
                  <div>
                    <p className="text-muted-foreground">Ticket</p>
                    <p className="font-semibold">#{submissionResult.ticketId}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </CardContent>
        <CardFooter className="flex flex-wrap justify-center gap-3 border-t pt-6">
          <Button onClick={() => window.location.reload()}>
            <Plus className="h-4 w-4 mr-2" />
            Create Another Quote
          </Button>

          {submissionResult.ticketId && (
            <Button
              variant="outline"
              onClick={() => router.push(`/tickets/${submissionResult.ticketId}`)}
            >
              <Ticket className="h-4 w-4 mr-2" />
              View Ticket
            </Button>
          )}

          {submissionResult.draftOrder?.invoiceUrl && (
            <Button variant="outline" asChild>
              <a
                href={submissionResult.draftOrder.invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View Invoice
              </a>
            </Button>
          )}
        </CardFooter>
      </Card>
    );
  }

  // Show error state
  if (submissionResult?.success === false) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader className="text-center border-b bg-red-50 dark:bg-red-950/20">
          <div className="mx-auto mb-4">
            <XCircle className="h-16 w-16 text-destructive" />
          </div>
          <CardTitle className="text-2xl text-destructive">
            Quote Creation Failed
          </CardTitle>
          <CardDescription>
            We encountered an error while creating your quote.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <p className="text-sm text-destructive">
              <span className="font-semibold">Error:</span> {submissionResult.error}
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-center gap-3 border-t pt-6">
          <Button
            onClick={() => {
              setSubmissionResult(null);
              setCurrentStep(steps.length);
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Try Again
          </Button>

          <Button
            variant="outline"
            onClick={() => window.location.reload()}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Start Over
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <FormProvider {...methods}>
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-xl">Create New Quote</CardTitle>
              <CardDescription>
                Step {currentStep} of {steps.length}: {steps[currentStep - 1].name}
              </CardDescription>
            </div>

            {/* Progress indicator */}
            <div className="flex items-center gap-2">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <div
                    className={`
                      h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors
                      ${currentStep > step.id
                        ? 'bg-primary text-primary-foreground'
                        : currentStep === step.id
                          ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2'
                          : 'bg-muted text-muted-foreground'
                      }
                    `}
                  >
                    {currentStep > step.id ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      step.id
                    )}
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`h-0.5 w-6 mx-1 ${
                        currentStep > step.id ? 'bg-primary' : 'bg-muted'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <form onSubmit={handleSubmit(onSubmit)}>
            {ActiveStepComponent && <ActiveStepComponent />}

            <div className="flex justify-between mt-8 pt-6 border-t">
              {currentStep > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePrev}
                  disabled={isSubmitting}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>
              ) : (
                <div />
              )}

              {currentStep < steps.length ? (
                <Button
                  type="button"
                  onClick={handleNext}
                  disabled={isSubmitting}
                >
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  variant="success"
                  size="lg"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating Quote...
                    </>
                  ) : (
                    <>
                      <Rocket className="h-4 w-4 mr-2" />
                      Create Quote
                    </>
                  )}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </FormProvider>
  );
};

export default QuoteCreationWizard;
