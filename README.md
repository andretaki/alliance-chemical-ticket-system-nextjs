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
