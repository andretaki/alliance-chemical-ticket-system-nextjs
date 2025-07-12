# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a comprehensive ticket management system built for Alliance Chemical, a chemical industry company. The system handles customer support tickets, email integration, Shopify e-commerce integration, and provides extensive workflow automation with AI-powered features.

## Core Technology Stack

- **Next.js 15.3.1** with App Router and React 19
- **PostgreSQL** with Drizzle ORM 0.43.1 (schema: `ticketing_prod`)
- **TypeScript 5.4.5** with strict mode enabled
- **NextAuth.js 4.24.11** for authentication
- **Bootstrap 5.3.6** for responsive UI
- **TipTap 2.1.20** for rich text editing

## Common Commands

### Development
```bash
# Start development server (runs on port 3001)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint
```

### Database Operations
```bash
# Run database migrations
npm run db:migrate

# Introspect database schema
npm run db:introspect
```

### Custom Scripts
```bash
# Sync products from Shopify
npm run sync-products

# Setup Microsoft Graph webhooks
npm run setup:webhook

# Test product synchronization
npm run test:sync
```

## Architecture Overview

### Database Schema
The system uses a PostgreSQL database with the `ticketing_prod` schema containing:

**Core Tables:**
- `users` - User accounts with role-based access (`admin`, `manager`, `user`)
- `tickets` - Support tickets with comprehensive status tracking
- `ticket_comments` - Comments and communications
- `ticket_attachments` - File attachments via Vercel Blob
- `quarantined_emails` - AI-powered email filtering
- `canned_responses` - Template responses
- `sla_policies` - Service Level Agreement management
- `subscriptions` - Microsoft Graph webhook subscriptions

**E-commerce Integration:**
- `agent_products` - Shopify product synchronization
- `agent_product_variants` - Product variants and inventory
- `credit_applications` - Customer credit requests

**Key Enums:**
- `ticket_status_enum`: `new`, `open`, `in_progress`, `pending_customer`, `closed`
- `ticket_priority_enum`: `low`, `medium`, `high`, `urgent`
- `ticket_type_ecommerce_enum`: Various business-specific types

### Authentication & Authorization
- NextAuth.js with database sessions
- Role-based access control enforced via `src/middleware.ts`
- New user approval workflow (admin approval required)
- Protected routes: `/dashboard`, `/tickets`, `/admin`, `/manage-users`, `/profile`

### API Architecture
All API routes follow RESTful conventions with consistent response format:
```typescript
// Success response
{ success: true, data: T, message?: string }

// Error response
{ success: false, error: string, details?: unknown }
```

API routes are organized under `src/app/api/` with proper authentication checks using `getServerSession()`.

## Key Integrations

### Microsoft Graph API
- Email processing and ticket conversion
- Webhook subscriptions for real-time email handling
- Quarantine system for spam/vendor email filtering

### Shopify Integration
- Customer auto-creation from tickets
- Product synchronization for quotes
- Draft order creation
- Required scopes: `read_customers`, `write_customers`, `read_products`, `write_products`, `read_orders`, `write_orders`, `read_draft_orders`, `write_draft_orders`

### AI Services
- OpenAI/Groq for sentiment analysis, ticket classification, and suggestions
- AI-powered email filtering and assignee recommendations

### External Services
- QuickBooks API for financial integration
- ShipStation for shipping management
- Vercel Blob for file storage
- Vercel KV for caching

## Development Patterns

### Component Architecture
- Client components use `"use client"` directive
- Server components handle database queries and authentication
- Props are always destructured in component parameters
- Components should be under 200 lines when possible

### Database Operations
Always use Drizzle ORM with proper error handling:
```typescript
import { db } from '@/db';
import { tickets } from '@/db/schema';
import { eq } from 'drizzle-orm';

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
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Database operations with async/await
    const result = await db.select().from(tickets);
    
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

## File Organization

### Important Directories
- `src/app/api/` - API endpoints organized by functionality
- `src/components/` - Reusable UI components with subdirectories
- `src/services/` - Business logic layer
- `src/lib/` - Utility functions and configurations
- `src/types/` - TypeScript type definitions
- `src/db/` - Database schema and migrations

### Configuration Files
- `drizzle.config.ts` - Database configuration
- `src/lib/authOptions.ts` - NextAuth configuration
- `src/middleware.ts` - Route protection
- `tsconfig.json` - TypeScript with strict mode and path aliases

## Environment Variables

### Required Variables
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
```

## Testing

### Running Tests
The project uses TypeScript execution with `tsx` for scripts:
```bash
# Run specific test scripts
npm run test:sync
tsx src/scripts/test-sync.ts
```

### Test Files Location
- `src/scripts/` - Contains test and utility scripts
- Individual test files can be run with `tsx src/scripts/[filename].ts`

## Code Style Guidelines

- TypeScript strict mode enforced
- Prefer async/await over .then() for promises
- Use destructuring for props and parameters
- Import organization: external libraries first, then local imports
- Consistent naming: camelCase for variables, PascalCase for components
- ESLint configuration extends Next.js core web vitals

## Common Development Tasks

### Adding New API Endpoints
1. Create route file in `src/app/api/[endpoint]/route.ts`
2. Implement HTTP methods with proper authentication
3. Follow consistent response format
4. Add error handling and validation

### Database Schema Changes
1. Update `src/db/schema.ts`
2. Run `npm run db:migrate` to apply changes
3. Update TypeScript types in `src/types/`

### Adding New Components
1. Create in appropriate `src/components/` subdirectory
2. Use TypeScript interfaces for props
3. Follow Bootstrap styling patterns
4. Add proper error boundaries if needed

## Performance Considerations

- Database queries use indexes on critical fields
- Vercel KV caching for frequently accessed data
- File uploads handled via Vercel Blob storage
- Large datasets use pagination

## Security Features

- Role-based access control
- Input validation with Zod schemas
- CSRF protection built into Next.js
- SQL injection prevention via Drizzle ORM
- File upload validation (MIME type, size limits)