# 🎫 Alliance Chemical Ticket System

A modern, responsive ticket management system built for Alliance Chemical using Next.js, React, and PostgreSQL with Drizzle ORM.

![GitHub](https://img.shields.io/badge/license-MIT-blue)
![Next.js](https://img.shields.io/badge/Next.js-15.3.1-black)
![React](https://img.shields.io/badge/React-19.0.0-61DAFB)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Support-336791)
![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.43.1-orange)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)

## 📋 Project Overview

Alliance Chemical Ticket System is a helpdesk ticketing platform built for the chemical industry. The system helps manage customer support tickets, streamlining communication between customers and support staff.

## ✨ Key Features

- **📊 Dashboard** - Visualize ticket status and performance metrics
- **🎫 Ticket Management** - Create, assign, update, and resolve support tickets
- **📧 Email Integration** - Process emails into tickets automatically
- **📁 Attachment Support** - Upload and manage file attachments for tickets
- **👥 User Management** - Manage user accounts with role-based permissions
- **📱 Responsive Design** - Works on desktop and mobile devices

## 🚀 Technology Stack

### Frontend
- **React & Next.js** - For building the UI and server-side rendering
- **TypeScript** - For type-safe code
- **TipTap** - Rich text editor for tickets and comments
- **Chart.js** - For dashboard visualizations
- **Bootstrap** - For responsive styling

### Backend
- **Next.js API Routes** - For backend functionality
- **Drizzle ORM** - For database operations
- **PostgreSQL** - Primary database
- **NextAuth.js** - Authentication framework

## 🖥️ Project Structure

```
src/
├── app/              # Next.js App Router pages
│   ├── admin/        # Admin area
│   ├── api/          # API endpoints
│   ├── auth/         # Authentication pages
│   ├── dashboard/    # Main dashboard
│   ├── tickets/      # Ticket management
│   └── ...
├── components/       # Reusable UI components
├── db/               # Database configuration
│   ├── schema.ts     # Drizzle ORM schema
│   └── ...
├── lib/              # Utility functions and helpers
└── types/            # TypeScript type definitions
```

## 🗃️ Database Schema

The system uses the following core tables:
- **users** - User accounts with roles and permissions
- **tickets** - Support tickets with status and priority
- **ticket_comments** - Comments and replies on tickets
- **ticket_attachments** - Files attached to tickets
- **canned_responses** - Template responses for common queries

## 🛠️ Installation

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/alliance-chemical-ticket-system-nextjs.git
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Configure environment variables (create a `.env.local` file)
   ```
   DATABASE_URL=postgresql://username:password@localhost:5432/ticketing
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=your-secret-key
   ```

4. Run database migrations
   ```bash
   npm run db:migrate
   ```

5. Start the development server
   ```bash
   npm run dev
   ```

## 🔧 Email Integration

The system can process incoming emails and convert them into tickets with:
- Sender information extraction
- Attachment handling
- Reply tracking
- Conversation threading

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgements

- Next.js team for the framework
- All open-source contributors whose libraries made this possible
- The Alliance Chemical team for their feedback and requirements

## Features

### 🚀 **Customer Auto-Creation in Shopify**
The system automatically creates customers in Shopify whenever they interact with your support system:

- **Ticket Creation** - When customers create tickets or send emails
- **Quote Requests** - When customers request quotes via any form
- **Email Support** - When customers email your support address

**Key Benefits:**
- ✅ **No Duplicates** - Checks existing customers before creating
- ✅ **Smart Tagging** - Tags customers with source and ticket information
- ✅ **Detailed Notes** - Adds context about how customer was created
- ✅ **Automatic** - Works in background without user intervention

## Environment Variables

```bash
# Customer Auto-Creation
SHOPIFY_AUTO_CREATE_CUSTOMERS=true    # Enable/disable auto-creation (default: true)

# Shopify Integration
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=your-token
SHOPIFY_API_KEY=your-api-key
SHOPIFY_API_SECRET=your-secret

# Required Shopify Scopes:
# - read_customers
# - write_customers
# - read_products
# - write_draft_orders
# - read_draft_orders
# - write_orders
# - read_orders
```

## Customer Auto-Creation Details

### **When Customers Are Created:**
1. **Direct Ticket Creation** - When tickets are created via `/api/tickets`
2. **Email-to-Ticket** - When emails are converted to tickets via webhook
3. **Quote Creation** - When quotes/draft orders are created via `/api/draft-orders`
4. **Quote Forms** - When customers submit quote requests

### **Customer Data Captured:**
- Email address (required)
- First and last name (parsed automatically)
- Phone number
- Company information
- Source tracking (ticket, email, quote_form)
- Related ticket ID

### **Shopify Customer Tags:**
- `TicketSystem` - Identifies customers from ticket system
- `Source:email` - Customer came via email
- `Source:ticket` - Customer came via direct ticket
- `Source:quote_form` - Customer came via quote form
- `Ticket:123` - Links to specific ticket ID

### **Admin Management:**
Access customer auto-creation management via admin interface:
- View current status and statistics
- Batch process existing tickets
- Preview what would be processed (dry run)
- Monitor creation success/failure rates

## Setup

### **1. Verify Shopify App Permissions**
Ensure your Shopify private app includes these scopes:
- ✅ `read_customers`
- ✅ `write_customers`
- ✅ `read_products`
- ✅ `write_draft_orders`
- ✅ `read_draft_orders`
- ✅ `write_orders`
- ✅ `read_orders`

### **2. Environment Configuration**
```bash
# Enable customer auto-creation (default: enabled)
SHOPIFY_AUTO_CREATE_CUSTOMERS=true

# Your Shopify store configuration
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxx
```

### **3. Test the System**
1. Create a test ticket with customer email
2. Check Shopify customers list for new customer
3. Verify tags and notes are correctly applied

### **4. Process Existing Data (Optional)**
Use the admin interface to batch-create customers from existing tickets:
1. Navigate to admin dashboard
2. Access "Customer Auto-Creation Management"
3. Configure date range and run preview
4. Execute batch creation if satisfied with preview

## API Endpoints

### **Customer Auto-Creation Admin**
- `GET /api/admin/customers/auto-create` - Get status and statistics
- `POST /api/admin/customers/auto-create` - Batch process existing tickets

**Example Admin Request:**
```json
{
  "createFromExisting": true,
  "limitToRecent": true,
  "daysBack": 30,
  "dryRun": false
}
```

## Troubleshooting

### **Customer Creation Not Working?**
1. **Check Shopify permissions** - Ensure `write_customers` scope is enabled
2. **Verify environment variables** - `SHOPIFY_AUTO_CREATE_CUSTOMERS` should be `true`
3. **Check logs** - Look for `[CustomerAutoCreate]` entries in server logs
4. **Test API connection** - Verify Shopify API credentials are working

### **Duplicate Prevention**
The system automatically checks for existing customers by email before creating new ones. If a customer already exists, it will:
- Skip creation
- Log the existing customer ID
- Continue with ticket/quote processing normally

### **Error Handling**
Customer creation failures **never** block ticket or quote creation. The system:
- Logs errors for debugging
- Continues with normal ticket/quote processing
- Allows manual customer creation later if needed

## Monitoring

### **Success Indicators:**
- Look for `[CustomerAutoCreate] Customer created successfully` in logs
- Check Shopify customers list for new entries with `TicketSystem` tag
- Monitor admin dashboard statistics

### **Common Log Messages:**
```
[CustomerAutoCreate] Customer already exists in Shopify: email@example.com (ID: 123)
[CustomerAutoCreate] Customer created successfully in Shopify: email@example.com (ID: 456)
[CustomerAutoCreate] Skipping customer creation - invalid email: invalid-email
```
