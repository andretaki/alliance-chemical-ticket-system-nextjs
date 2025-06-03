export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { ticketAttachments, tickets, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Helper function to safely create upload directory if it doesn't exist
const ensureUploadDirExists = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Ensure the user is authenticated
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { id } = await params;
    const ticketId = parseInt(id);
    if (isNaN(ticketId)) {
      return new NextResponse('Invalid ticket ID', { status: 400 });
    }

    // Check if the ticket exists
    const ticketExists = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
    });

    if (!ticketExists) {
      return new NextResponse('Ticket not found', { status: 404 });
    }

    // We need to use FormData to handle file uploads
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    
    if (!files || files.length === 0) {
      return new NextResponse('No files uploaded', { status: 400 });
    }

    // Get the user who is uploading the files
    const user = await db.query.users.findFirst({
      where: eq(users.email, session.user.email),
    });

    if (!user) {
      return new NextResponse('User not found', { status: 404 });
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'uploads', 'tickets', ticketId.toString());
    ensureUploadDirExists(uploadsDir);

    // Process each file
    const savedAttachments = [];
    
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      
      // Generate a unique filename to avoid collisions
      const fileExt = path.extname(file.name);
      const uniqueFilename = `${crypto.randomUUID()}${fileExt}`;
      const filePath = path.join(uploadsDir, uniqueFilename);
      
      // Save the file to disk
      fs.writeFileSync(filePath, buffer);
      
      // Create a database record for the attachment
      const relativeStoragePath = path.join('uploads', 'tickets', ticketId.toString(), uniqueFilename);
      
      const newAttachment = await db.insert(ticketAttachments)
        .values({
          filename: uniqueFilename,
          originalFilename: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
          storagePath: relativeStoragePath,
          ticketId,
          uploaderId: user.id,
        })
        .returning();
      
      savedAttachments.push(newAttachment[0]);
    }

    return NextResponse.json(savedAttachments);
  } catch (error) {
    console.error('Error uploading attachments:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 