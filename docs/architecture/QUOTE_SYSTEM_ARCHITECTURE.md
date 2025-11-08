# Quote Creation System Architecture

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Component Hierarchy](#component-hierarchy)
4. [Data Flow](#data-flow)
5. [API Integration](#api-integration)
6. [State Management](#state-management)
7. [Validation Strategy](#validation-strategy)
8. [Error Handling](#error-handling)

---

## System Overview

The Quote Creation System (also called Draft Order System) is a multi-step wizard that allows sales representatives to create quotes for customers through Shopify's Draft Order API. The system integrates with:

- **Shopify Admin API** - For creating draft orders, managing customers, calculating shipping
- **Ticket System Database** - For linking quotes to support tickets
- **Customer Auto-Create Service** - For automatically creating Shopify customers from quote requests

### Key Features
- ✅ Multi-step form wizard with validation
- ✅ Customer search with auto-population
- ✅ Product search with real-time inventory display
- ✅ Automatic shipping rate calculation
- ✅ Quote type support (Material Only vs Material + Delivery)
- ✅ Automatic invoice generation
- ✅ Integration with ticket system

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Quote Creation Wizard                        │
│                   (QuoteCreationWizard.tsx)                      │
└────────────┬────────────────────────────────────────────────────┘
             │
             ├─────────────────────────────────────────────────────┐
             │                                                     │
    ┌────────▼────────┐  ┌────────────┐  ┌──────────┐  ┌────────▼───────┐
    │ CustomerStep    │  │ ProductStep│  │ AddressStep│  │  ReviewStep  │
    │ (Step 1)        │  │ (Step 2)   │  │ (Step 3) │  │  (Step 4)    │
    └────────┬────────┘  └─────┬──────┘  └─────┬────┘  └────────┬───────┘
             │                 │               │                │
             │                 │               │                │
    ┌────────▼─────────────────▼───────────────▼────────────────▼───────┐
    │              React Hook Form + Zod Validation                     │
    │                  (quoteFormSchema)                                │
    └────────────────────────────┬──────────────────────────────────────┘
                                 │
                                 │ Submit
                                 │
                    ┌────────────▼───────────────┐
                    │  POST /api/draft-orders    │
                    │     (route.ts)             │
                    └────────────┬───────────────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
       ┌────────▼──────┐  ┌─────▼──────┐  ┌─────▼──────────┐
       │ Ticket System │  │  Shopify   │  │ Customer Auto  │
       │   Database    │  │  Service   │  │ Create Service │
       └───────────────┘  └─────┬──────┘  └────────────────┘
                                │
                    ┌───────────▼────────────┐
                    │  Shopify Admin API     │
                    │  (GraphQL)             │
                    └────────────────────────┘
```

---

## Component Hierarchy

### Main Components

```
QuoteCreationWizard/
├── QuoteCreationWizard.tsx          # Main wizard orchestrator
├── types.ts                          # TypeScript types and Zod schemas
└── steps/
    ├── CustomerStep.tsx              # Step 1: Customer information
    ├── ProductsStep.tsx              # Step 2: Product selection
    ├── AddressStep.tsx               # Step 3: Shipping & billing
    └── ReviewStep.tsx                # Step 4: Review & submit
```

### Component Responsibilities

#### **QuoteCreationWizard.tsx**
- **Purpose**: Orchestrates the multi-step form flow
- **Responsibilities**:
  - Manages current step state
  - Handles form submission
  - Coordinates API calls (ticket creation + draft order creation)
  - Manages success/error states
  - Provides form context to child steps
- **Key Functions**:
  - `onSubmit()` - Main submission handler
  - `handleNext()` - Validates current step and moves forward
  - `handlePrev()` - Navigates to previous step
- **State**:
  ```typescript
  currentStep: number                    // Current wizard step (1-4)
  isSubmitting: boolean                  // Loading state during submission
  submissionResult: {                    // Result of quote creation
    success: boolean
    draftOrder?: any
    ticketId?: number
    error?: string
  } | null
  ```

#### **CustomerStep.tsx**
- **Purpose**: Capture customer information
- **Responsibilities**:
  - Customer search with autocomplete (3+ chars)
  - Auto-population of customer data
  - Auto-population of shipping address from customer default
  - Manual entry fallback
- **Key Functions**:
  - `searchCustomer()` - Debounced customer search
  - `handleSelectCustomer()` - Populates form from selected customer
- **State**:
  ```typescript
  searchTerm: string                     // Customer search query
  isSearching: boolean                   // Search loading state
  searchResults: CustomerSearchResult[]  // Search results
  showResults: boolean                   // Dropdown visibility
  ```

#### **ProductsStep.tsx**
- **Purpose**: Product selection and quantity management
- **Responsibilities**:
  - Product variant search (2+ chars)
  - Display real-time inventory levels
  - Support multiple line items
  - Price display per item
- **Key Functions**:
  - `handleSearchChange()` - Debounced product search per line item
  - `handleProductSelect()` - Populates line item with selected product
- **State**:
  ```typescript
  searchStates: Array<{                  // Search state per line item
    term: string
    results: SearchResult[]
    isLoading: boolean
  }>
  activeDropdown: number | null          // Currently active dropdown index
  ```

#### **AddressStep.tsx**
- **Purpose**: Shipping and billing address collection
- **Responsibilities**:
  - Quote type selection (Material Only vs Material + Delivery)
  - Shipping address entry with state/province dropdown
  - Billing address with "same as shipping" toggle
  - Delivery terms and disclaimers
- **Key Functions**:
  - Auto-sync billing address when toggle enabled
  - Dynamic state/province list based on country
- **State**:
  ```typescript
  shippingProvinces: string[]            // Available states for shipping country
  billingProvinces: string[]             // Available states for billing country
  ```

#### **ReviewStep.tsx**
- **Purpose**: Final review and shipping calculation
- **Responsibilities**:
  - Display all collected information
  - Calculate shipping rates (if applicable)
  - Show price breakdown
  - Allow shipping method selection
- **Key Functions**:
  - `calculateShipping()` - Fetch shipping rates from API
  - `selectShippingRate()` - Update total with selected rate
- **State**:
  ```typescript
  priceSummary: {                        // Price totals
    subtotal: number
    shipping: number | null
    total: number
    currencyCode: string
  }
  isCalculatingShipping: boolean         // Shipping calculation loading
  shippingRates: ShippingRate[]          // Available shipping options
  selectedShippingRate: number | null    // Index of selected rate
  ```

---

## Data Flow

### 1. Form Initialization
```typescript
// QuoteCreationWizard.tsx
const methods = useForm<QuoteFormData>({
  resolver: zodResolver(quoteFormSchema),  // Zod validation
  mode: 'onBlur',                          // Validate on blur
  defaultValues,                           // Default empty values
});
```

### 2. Step Navigation
```
Step 1 → Validate customer fields → Next
Step 2 → Validate lineItems → Next
Step 3 → Validate addresses → Next
Step 4 → Review → Submit
```

### 3. Submission Flow

```typescript
// 1. Create ticket (optional, if user is authenticated)
const ticketResponse = await axios.post('/api/tickets', { ... });

// 2. Prepare draft order input
const draftOrderInput = {
  lineItems: [...],
  customer: { email, firstName, lastName, ... },
  shopifyCustomerId: data.customer.shopifyCustomerId,
  shippingAddress: { ... },
  billingAddress: { ... },
  tags: [SHOPIFY_TAGS.QUOTE_WIZARD, ...],
  customAttributes: [...],
  note: "Quote created from wizard...",
  email: data.sendShopifyInvoice ? data.customer.email : undefined,
};

// 3. Submit to API
const response = await axios.post('/api/draft-orders', draftOrderInput);

// 4. Handle success/error
setSubmissionResult({ success: true, draftOrder: response.data, ticketId });
```

---

## API Integration

### Backend API Route: `/api/draft-orders` (POST)

**Location**: `src/app/api/draft-orders/route.ts`

**Flow**:
```
1. Authenticate user (admin/manager only)
2. Validate request body
3. Auto-create customer in Shopify (if enabled)
4. Add system tags (TicketSystemQuote, etc.)
5. Create draft order in Shopify
6. Calculate and apply shipping (if address provided)
7. Send invoice email (if requested + 5s delay for Shopify processing)
8. Return draft order details
```

**Key Dependencies**:
- `ShopifyService` - GraphQL client for Shopify Admin API
- `customerAutoCreateService` - Auto-creates customers
- `SHOPIFY_TAGS` / `SHOPIFY_CUSTOM_ATTRIBUTES` - Centralized constants

### Shopify Service Methods Used

```typescript
// src/services/shopify/ShopifyService.ts

shopifyService.createDraftOrder(input)
  // GraphQL: draftOrderCreate mutation
  // Returns: Draft order with ID, pricing, etc.

shopifyService.calculateShippingRates(lineItems, address)
  // GraphQL: draftOrderCalculate mutation
  // Returns: Available shipping rates

shopifyService.updateDraftOrderShippingLine(draftOrderId, shippingLine)
  // GraphQL: draftOrderUpdate mutation
  // Returns: Updated draft order with shipping

shopifyService.sendDraftOrderInvoice(draftOrderId)
  // GraphQL: draftOrderInvoiceSend mutation
  // Returns: Invoice URL and status
```

---

## State Management

### React Hook Form Context

The wizard uses **React Hook Form** with a `FormProvider` to share form state across all steps.

```typescript
// QuoteCreationWizard.tsx
<FormProvider {...methods}>
  {/* All child steps can access form context */}
  <CustomerStep />
  <ProductsStep />
  <AddressStep />
  <ReviewStep />
</FormProvider>
```

### Accessing Form State in Steps

```typescript
// Any step component
const { register, formState: { errors }, setValue, watch } = useFormContext<QuoteFormData>();

// Register input
<input {...register('customer.email')} />

// Set value programmatically
setValue('customer.firstName', 'John', { shouldValidate: true });

// Watch value
const email = watch('customer.email');
```

### Local State vs Form State

| State Type | Use Case | Example |
|------------|----------|---------|
| **Form State** (react-hook-form) | Data submitted to API | Customer info, line items, addresses |
| **Local State** (useState) | UI interactions | Search results, dropdowns, loading states |
| **Derived State** (useMemo/calculations) | Computed values | Price totals, validation status |

---

## Validation Strategy

### Schema-Based Validation (Zod)

**Location**: `src/components/quote-creation-wizard/types.ts`

```typescript
export const quoteFormSchema = z.object({
  customer: z.object({
    email: z.string().email('Invalid email').min(1, 'Required'),
    firstName: z.string().min(1, 'Required'),
    lastName: z.string().min(1, 'Required'),
    phone: z.string().optional(),
    company: z.string().optional(),
    shopifyCustomerId: z.string().optional(),
  }),
  lineItems: z.array(lineItemSchema).min(1, 'At least one product required'),
  shippingAddress: addressSchema,
  // ...
});
```

### Validation Modes

1. **On Blur** (default): Validates when user leaves a field
2. **On Submit**: Full form validation before API call
3. **On Step Navigation**: Validates current step fields before moving forward

```typescript
// Step navigation with validation
const handleNext = async () => {
  const currentStepFields = steps[currentStep - 1].fields;
  const isValid = await trigger(currentStepFields);
  if (!isValid) {
    toast.error('Please fix errors before continuing');
    return;
  }
  setCurrentStep(prev => prev + 1);
};
```

---

## Error Handling

### Client-Side Error Handling

**User-Friendly Messages**:
```typescript
// QuoteCreationWizard.tsx
switch (statusCode) {
  case 400:
    errorMessage = 'Invalid data. Check all fields.';
    userFriendlyMessage = 'Verify all required fields are correct.';
    break;
  case 401:
    errorMessage = 'Session expired. Please log in.';
    userFriendlyMessage = 'For security, log in again to create quotes.';
    break;
  case 500:
    errorMessage = 'Server error. Our team has been notified.';
    userFriendlyMessage = 'Try again in a few minutes.';
    break;
}
```

**GraphQL Error Handling**:
```typescript
if (axiosError.response?.data?.errors) {
  const graphQLErrors = axiosError.response.data.errors
    .map(e => e.message)
    .join(', ');
  errorMessage = `Shopify Error: ${graphQLErrors}`;
}
```

### Server-Side Error Handling

```typescript
// route.ts
try {
  // Create draft order
  const result = await shopifyService.createDraftOrder(body);
  return NextResponse.json(result, { status: 201 });
} catch (error: any) {
  console.error('[API /api/draft-orders] Error:', error);
  return NextResponse.json(
    { error: error.message || 'Internal Server Error' },
    { status: 500 }
  );
}
```

---

## Performance Considerations

### Debouncing

All search inputs use standardized debouncing:
```typescript
// From constants.ts
export const SEARCH_DEBOUNCE_MS = 300;

// Applied in CustomerStep and ProductsStep
setTimeout(() => {
  searchCustomer(term);
}, SEARCH_DEBOUNCE_MS);
```

### API Call Optimization

**Current Issue** (to be fixed):
- Creates draft order → Calculates shipping → Updates draft order (3 API calls + 5s delay)

**Planned Optimization**:
- Use `draftOrderCalculate` before creation → Create with all data (1 API call)

### Inventory Caching

- Inventory data is fetched during product search
- No separate API call needed for stock levels
- Real-time data from Shopify product search

---

## Security

### Authentication

```typescript
// route.ts
const { session, error } = await getServerSession();
if (!session?.user?.id || !['admin', 'manager'].includes(session.user.role)) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### Input Validation

1. **Client-side**: Zod schema validation
2. **Server-side**: Additional validation in API route
3. **Shopify API**: Final validation by Shopify

### Data Sanitization

- Email addresses are trimmed and lowercased
- Phone numbers are cleaned before storage
- Addresses are validated against Shopify's format requirements

---

## Testing Strategy

### Unit Tests (Recommended)

```typescript
// Example: Testing validation schema
describe('quoteFormSchema', () => {
  it('should reject invalid email', () => {
    const result = quoteFormSchema.safeParse({
      customer: { email: 'invalid' }
    });
    expect(result.success).toBe(false);
  });
});
```

### Integration Tests (Recommended)

```typescript
// Example: Testing draft order creation
describe('POST /api/draft-orders', () => {
  it('should create draft order with valid data', async () => {
    const response = await fetch('/api/draft-orders', {
      method: 'POST',
      body: JSON.stringify(validDraftOrderInput),
    });
    expect(response.status).toBe(201);
  });
});
```

---

## Future Improvements

1. ⚡ **Optimize Shipping Calculation** - Use single API call
2. 💾 **Form Draft Saving** - LocalStorage persistence between steps
3. 📱 **Mobile Optimization** - Responsive tables and card views
4. 🔄 **Retry Logic** - Auto-retry failed API calls
5. 📊 **Analytics** - Track quote creation metrics
6. 🎯 **Quote Templates** - Save/load common quote configurations

---

## Related Documentation

- [Component Documentation](../components/QUOTE_WIZARD_COMPONENTS.md)
- [API Documentation](../api/DRAFT_ORDERS_API.md)
- [Shopify Integration](../api/SHOPIFY_INTEGRATION.md)
- [Developer Guide](../guides/DEVELOPER_GUIDE.md)
