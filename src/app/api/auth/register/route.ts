export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db'; // Use the consolidated db instance
import { users } from '@/db/schema';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    // Parse request body
    const { name, email, password } = await request.json();
    
    console.log('Registration attempt for:', email);
    
    // Basic validation
    if (!name || !email || !password) {
      return NextResponse.json(
        { message: 'Name, email, and password are required' },
        { status: 400 }
      );
    }
    
    if (password.length < 8) {
      return NextResponse.json(
        { message: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }
    
    // Check if user already exists using Drizzle query builder
    const existingUser = await db.query.users.findFirst({
      where: (dbUsers, { eq }) => eq(dbUsers.email, email.toLowerCase()),
      columns: { id: true }
    });

    if (existingUser) {
      return NextResponse.json(
        { message: 'Email already registered' },
        { status: 409 }
      );
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
        // createdAt and updatedAt will use defaultNow() from schema
      });
      
      console.log('User registered successfully:', userId);
      
      // Return success response
      return NextResponse.json(
        { 
          message: 'User registered successfully',
          userId
        },
        { status: 201 }
      );
    } catch (error) {
      console.error('Database error during user creation:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
      return NextResponse.json(
        { message: `Database error: ${errorMessage}` },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { message: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
} 