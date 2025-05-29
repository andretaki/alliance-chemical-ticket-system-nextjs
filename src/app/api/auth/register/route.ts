export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/config';
import { users } from '@/db/schema';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sql } from 'drizzle-orm';

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
    
    // Check if user already exists using direct SQL
    const existingUserResult = await db.execute(sql`
      SELECT id FROM ticketing_prod.users WHERE email = ${email.toLowerCase()}
    `);
    
    if (existingUserResult.length > 0) {
      return NextResponse.json(
        { message: 'Email already registered' },
        { status: 409 }
      );
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new user with default role 'user' using direct SQL
    try {
      // Generate UUID manually
      const userId = crypto.randomUUID();
      const currentTime = new Date().toISOString();
      
      await db.execute(sql`
        INSERT INTO ticketing_prod.users (
          id, email, password, name, role, created_at, updated_at
        ) VALUES (
          ${userId}, 
          ${email.toLowerCase()}, 
          ${hashedPassword}, 
          ${name}, 
          'user', 
          ${currentTime}, 
          ${currentTime}
        )
      `);
      
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