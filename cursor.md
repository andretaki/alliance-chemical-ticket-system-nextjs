# Alliance Chemical Ticket System - Cursor AI Guide

## Project Overview

This is a modern, full-stack **ticketing system** built specifically for Alliance Chemical, a chemical industry company. The system manages customer support tickets, integrates with various business systems, and provides comprehensive workflow automation.

**Key Purpose**: Streamline customer support operations, automate email-to-ticket conversion, integrate with Shopify for customer management, and provide analytics/reporting capabilities.

## Technology Stack

### Core Framework
- **Next.js 15.3.1** - App Router with React 19
- **TypeScript 5.4.5** - Strict type checking enabled
- **PostgreSQL** - Primary database with Drizzle ORM 0.43.1
- **NextAuth.js 4.24.11** - Authentication and session management

### Frontend Technologies
- **React 19** - Latest React with concurrent features
- **Bootstrap 5.3.6** - Responsive UI framework
- **TipTap 2.1.20** - Rich text editor for tickets/comments
- **Chart.js 4.4.9** - Dashboard visualizations
- **React Hot Toast** - User notifications

### Backend & Database
- **Drizzle ORM** - Type-safe database operations
- **PostgreSQL** - Schema: `ticketing_prod`
- **Vercel Blob Storage** - File attachments
- **Vercel KV** - Caching layer

### External Integrations
- **Shopify API** - Customer auto-creation, product sync, order management
- **Microsoft Graph API** - Email processing, webhooks
- **OpenAI/Groq** - AI analysis and suggestions
- **QuickBooks API** - Financial integration
- **Mailgun** - Email delivery
- **ShipStation** - Shipping integration

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── tickets/       # Ticket CRUD operations
│   │   ├── admin/         # Admin-only endpoints
│   │   ├── auth/          # Authentication endpoints
│   │   ├── email/         # Email processing
│   │   ├── webhook/       # External webhooks
│   │   └── ...
│   ├── dashboard/         # Main dashboard UI
│   ├── tickets/           # Ticket management pages
│   ├── admin/             # Admin interface
│   └── auth/              # Authentication pages
├── components/            # Reusable React components
│   ├── admin/             # Admin-specific components
│   ├── dashboard/         # Dashboard components
│   ├── ticket/            # Ticket-related components
│   └── ...
├── db/                    # Database layer
│   └── schema.ts          # Drizzle ORM schema
├── services/              # Business logic layer
│   ├── shopify/           # Shopify integration
│   ├── aiAnalysisOrchestratorService.ts
│   ├── customerAutoCreateService.ts
│   └── ...
├── lib/                   # Utility functions
├── types/                 # TypeScript definitions
├── config/                # Configuration files
├── utils/                 # Helper utilities
└── middleware.ts          # Route protection
```

## Database Schema

The system uses a PostgreSQL database with the `ticketing_prod` schema containing these core tables:

### Core Tables
- **users** - User accounts with role-based access (`admin`, `manager`, `user`)
- **tickets** - Support tickets with status, priority, and type
- **ticket_comments** - Comments/replies on tickets
- **ticket_attachments** - File attachments
- **quarantined_emails** - Email spam/vendor filtering
- **canned_responses** - Template responses
- **subscriptions** - Microsoft Graph webhooks
- **user_signatures** - Email signatures

### E-commerce Integration
- **agent_products** - Shopify product sync
- **agent_product_variants** - Product variants/SKUs
- **credit_applications** - Customer credit requests

### Key Enums
- **ticket_status_enum**: `new`, `open`, `in_progress`, `pending_customer`, `closed`
- **ticket_priority_enum**: `low`, `medium`, `high`, `urgent`
- **ticket_type_ecommerce_enum**: `Return`, `Shipping Issue`, `Order Issue`, `Quote Request`, etc.

## Authentication & Authorization

### NextAuth.js Configuration
- **Database sessions** - Stored in PostgreSQL
- **Role-based access control** - Admin, Manager, User roles
- **Approval workflow** - New users require admin approval
- **External users** - Support for non-employee access

### Middleware Protection
Routes are protected via `src/middleware.ts`:
- **Protected routes**: `/dashboard`, `/tickets`, `/admin`, `/manage-users`, `/profile`
- **Admin-only routes**: `/admin/*`, `/manage-users/*`
- **Role-based redirects** - Unauthorized users redirected with error messages

## Key Features & Patterns

### 1. Email Processing System
- **Microsoft Graph integration** - Processes incoming emails
- **Quarantine system** - AI-powered spam/vendor filtering
- **Auto-ticket creation** - Converts emails to tickets
- **Conversation threading** - Links related emails/tickets

### 2. Shopify Integration
- **Customer auto-creation** - Creates Shopify customers from tickets
- **Product synchronization** - Syncs products for quotes
- **Order management** - Creates draft orders/quotes
- **Inventory tracking** - Real-time stock levels

### 3. AI-Powered Features
- **Sentiment analysis** - Analyzes ticket sentiment
- **Assignee suggestions** - AI recommends ticket assignees
- **Email classification** - Filters spam/vendor emails
- **Content analysis** - Extracts key information

### 4. File Management
- **Vercel Blob storage** - Secure file uploads
- **Attachment linking** - Files linked to tickets/comments
- **Size limits** - Configurable upload restrictions
- **Type validation** - MIME type checking

## API Patterns

### RESTful Endpoints
- **GET /api/tickets** - List tickets with filtering
- **POST /api/tickets** - Create new ticket
- **PUT /api/tickets/[id]** - Update ticket
- **DELETE /api/tickets/[id]** - Delete ticket

### Response Format
```typescript
// Success response
{
  success: true,
  data: T,
  message?: string
}

// Error response
{
  success: false,
  error: string,
  details?: unknown
}
```

### Error Handling
- **Try-catch blocks** - Consistent error handling
- **Validation** - Zod schema validation
- **Logging** - Detailed error logging
- **User feedback** - Friendly error messages

## Component Patterns

### Client Components
- **"use client"** directive for interactive components
- **State management** - React hooks (useState, useEffect)
- **Form handling** - Controlled components with validation
- **Real-time updates** - Polling for live data

### Server Components
- **Database queries** - Direct database access
- **Authentication** - Server-side session checks
- **Performance** - Reduced client-side JavaScript

### Common Patterns
```typescript
// Typical client component structure with props destructuring
"use client";
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface ComponentProps {
  title: string;
  isVisible?: boolean;
}

export default function ComponentName({ title, isVisible = true }: ComponentProps) {
  const { data: session } = useSession();
  const [data, setData] = useState(null);
  
  // Prefer async/await over .then()
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/data');
        const result = await response.json();
        setData(result);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
    
    fetchData();
  }, []);
  
  if (!isVisible) return null;
  
  return (
    <div className="container">
      <h1>{title}</h1>
      {/* Bootstrap styling */}
    </div>
  );
}
```

## Configuration & Environment

### Environment Variables
```bash
# Database
DATABASE_URL=postgresql://...

# Authentication
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your-secret-key

# Shopify Integration
SHOPIFY_STORE_URL=store.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...
SHOPIFY_AUTO_CREATE_CUSTOMERS=true

# Microsoft Graph
MICROSOFT_TENANT_ID=...
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...

# AI Services
OPENAI_API_KEY=...
GROQ_API_KEY=...

# Email Services
MAILGUN_API_KEY=...
MAILGUN_DOMAIN=...
```

### Required Shopify Scopes
- `read_customers`, `write_customers`
- `read_products`, `write_products`
- `read_orders`, `write_orders`
- `read_draft_orders`, `write_draft_orders`

## Development Guidelines

### Code Style
- **TypeScript strict mode** - All files must be typed
- **ESLint configuration** - Enforced code standards
- **Consistent naming** - camelCase for variables, PascalCase for components
- **Import organization** - External libraries first, then local imports
- **Async patterns** - Prefer async/await over .then() for promises
- **Props destructuring** - Always destructure props in component parameters
- **Component size** - Keep components under 200 lines when possible (split larger components)

### Database Operations
```typescript
// Use Drizzle ORM with proper error handling
import { db } from '@/db';
import { tickets } from '@/db/schema';

try {
  const result = await db.select().from(tickets).where(eq(tickets.id, id));
  return { success: true, data: result };
} catch (error) {
  console.error('Database error:', error);
  return { success: false, error: 'Failed to fetch tickets' };
}
```

### API Route Structure
```typescript
// src/app/api/example/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { db } from '@/db';
import { tickets } from '@/db/schema';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Use async/await for database operations
    const result = await db.select().from(tickets).limit(10);
    
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Parse request body with async/await
    const body = await request.json();
    
    // Validate and process data
    const newTicket = await db.insert(tickets).values(body).returning();
    
    return NextResponse.json({ success: true, data: newTicket[0] }, { status: 201 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
  }
}
```

## Common Tasks

### Adding New Ticket Types
1. Update `ticket_type_ecommerce_enum` in `schema.ts`
2. Run database migration: `npm run db:migrate`
3. Update TypeScript types in `src/types/`
4. Add UI options in ticket creation forms

### Creating New API Endpoints
1. Create route file in `src/app/api/[endpoint]/route.ts`
2. Implement HTTP methods (GET, POST, PUT, DELETE)
3. Add authentication/authorization checks
4. Include proper error handling and validation

### Adding New Components
1. Create component in appropriate `src/components/` subdirectory
2. Use TypeScript interfaces for props
3. Follow existing styling patterns (Bootstrap classes)
4. Add proper error boundaries if needed

## Performance Considerations

### Database Optimization
- **Indexes** - Critical fields are indexed (status, priority, assignee)
- **Pagination** - Large datasets use cursor-based pagination
- **Connection pooling** - Managed by Vercel/deployment platform

### Caching Strategy
- **Vercel KV** - Cache frequently accessed data
- **Static generation** - Use Next.js ISR where appropriate
- **Client-side caching** - React Query or SWR for API calls

### File Upload Optimization
- **Vercel Blob** - Efficient file storage
- **Client-side validation** - Check file size/type before upload
- **Progressive enhancement** - Graceful fallbacks

## Testing Strategy

### Unit Testing
- **Vitest** - Fast unit test runner
- **React Testing Library** - Component testing
- **API testing** - Mock external dependencies

### Integration Testing
- **Database testing** - Use test database
- **API testing** - End-to-end API flows
- **Authentication testing** - Session management

## Deployment

### Vercel Platform
- **Automatic deployments** - Connected to Git repository
- **Environment variables** - Configured in Vercel dashboard
- **Preview deployments** - Each PR gets preview URL

### Database Migrations
- **Drizzle Kit** - Schema migrations
- **Production safety** - Always test migrations in staging
- **Rollback plan** - Keep backup before major changes

## Security Considerations

### Authentication Security
- **Session management** - Secure session storage
- **CSRF protection** - Built into Next.js
- **Input validation** - Zod schema validation
- **SQL injection prevention** - Drizzle ORM parameterized queries

### File Upload Security
- **MIME type validation** - Check actual file type
- **Size limits** - Prevent large file uploads
- **Virus scanning** - Consider adding virus scanning
- **Access control** - Authenticated users only

## Troubleshooting

### Common Issues
1. **Database connection errors** - Check DATABASE_URL
2. **Authentication failures** - Verify NEXTAUTH_SECRET
3. **Shopify API errors** - Check scopes and permissions
4. **Email processing failures** - Verify Microsoft Graph setup

### Debugging Tips
- **Console logs** - Use structured logging
- **Error boundaries** - Catch React errors gracefully
- **Network tab** - Check API request/response cycles
- **Database logs** - Monitor query performance

## External Dependencies

### Critical Dependencies
- **@shopify/shopify-api** - Shopify integration
- **@microsoft/microsoft-graph-client** - Microsoft Graph
- **@tiptap/react** - Rich text editing
- **drizzle-orm** - Database operations
- **next-auth** - Authentication

### Development Dependencies
- **drizzle-kit** - Database migrations
- **typescript** - Type checking
- **eslint** - Code linting
- **tsx** - TypeScript execution

---

This system is designed to be maintainable, scalable, and user-friendly. When making changes, always consider the impact on existing workflows and maintain backward compatibility where possible.
