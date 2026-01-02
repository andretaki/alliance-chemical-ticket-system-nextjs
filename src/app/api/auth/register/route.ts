export const runtime = 'nodejs';

import { db } from '@/lib/db';
import { users } from '@/db/schema';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendEmail } from '@/lib/graphService';
import { SecurityValidator, securitySchemas } from '@/lib/security';
import { rateLimiters } from '@/lib/rateLimiting';
import { apiSuccess, apiError } from '@/lib/apiResponse';

async function sendApprovalRequestEmail(userName: string, userEmail: string) {
  const subject = 'New User Registration - Approval Required';
  const htmlContent = `<p>A new user has registered and is awaiting approval.</p>
                       <p><strong>Name:</strong> ${userName}</p>
                       <p><strong>Email:</strong> ${userEmail}</p>
                       <p>Please review and approve their account in the admin panel.</p>`;

  try {
    // The `sendEmail` function from graphService will use the SHARED_MAILBOX_ADDRESS as the sender by default.
    // It also has a hardcoded CC to sales@alliancechemical.com
    await sendEmail('Andre@alliancechemical.com', subject, htmlContent);
    console.log('Approval request email sent successfully to Andre@alliancechemical.com using Graph API');
  } catch (error) {
    console.error('Error sending approval request email via Graph API:', error);
    // Decide if this error should prevent user registration or just be logged
    // For now, we'll just log it and let registration proceed.
  }
}

export async function POST(request: Request) {
  // Apply rate limiting
  const rateLimitResponse = await rateLimiters.auth.middleware(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    // Parse request body
    const { name, email, password } = await request.json();
    
    console.log('Registration attempt for:', email);
    
    // Basic validation
    if (!name || !email || !password) {
      return apiError('validation_error', 'Name, email, and password are required', null, { status: 400 });
    }

    // Validate input using security schemas
    try {
      securitySchemas.allianceEmail.parse(email);
      securitySchemas.name.parse(name);
      securitySchemas.password.parse(password);
    } catch (validationError: any) {
      const errorMessage = validationError.errors?.[0]?.message || 'Invalid input';
      return apiError('validation_error', errorMessage, null, { status: 400 });
    }

    // Additional security checks
    if (!SecurityValidator.validateAllianceEmail(email)) {
      return apiError('forbidden', 'Registration is restricted to @alliancechemical.com email addresses only', null, { status: 403 });
    }

    if (password.length < 8) {
      return apiError('validation_error', 'Password must be at least 8 characters', null, { status: 400 });
    }

    // Check if user already exists using Drizzle query builder
    const existingUser = await db.query.users.findFirst({
      where: (dbUsers, { eq }) => eq(dbUsers.email, email.toLowerCase()),
      columns: { id: true }
    });

    if (existingUser) {
      return apiError('conflict', 'Email already registered', null, { status: 409 });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user with default role 'user' using Drizzle query builder
    try {
      const userId = crypto.randomUUID();
      
      await db.insert(users).values({
        id: userId,
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        role: 'user', // Default role
        // approvalStatus will default to 'pending' from schema
        // createdAt and updatedAt will use defaultNow() from schema
      });
      
      console.log('User registered successfully (pending approval):', userId);

      // Send notification email using Graph API
      await sendApprovalRequestEmail(name, email.toLowerCase());

      // Return success response
      return apiSuccess({
        message: 'User registered successfully. Your account is pending approval.',
        userId
      }, { status: 201 });
    } catch (error) {
      console.error('Database error during user creation:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
      return apiError('internal_error', `Database error: ${errorMessage}`, null, { status: 500 });
    }

  } catch (error) {
    console.error('Registration error:', error);
    return apiError('internal_error', `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`, null, { status: 500 });
  }
} 