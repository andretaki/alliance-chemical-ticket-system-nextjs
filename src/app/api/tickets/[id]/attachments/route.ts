export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { ticketAttachments, tickets, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

// Vercel serverless limits
const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5MB (Vercel payload limit)
const MAX_FILES_PER_REQUEST = 5; // Limit concurrent files
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { id } = await params;
    const ticketId = parseInt(id);
    if (isNaN(ticketId)) {
      return new NextResponse('Invalid ticket ID', { status: 400 });
    }

    // Verify ticket exists
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, ticketId),
      columns: { id: true }
    });

    if (!ticket) {
      return new NextResponse('Ticket not found', { status: 404 });
    }

    // Parse form data with size limit check
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return new NextResponse('No files provided', { status: 400 });
    }

    // Validate file count for serverless
    if (files.length > MAX_FILES_PER_REQUEST) {
      return new NextResponse(`Too many files. Maximum ${MAX_FILES_PER_REQUEST} files allowed per request.`, { status: 400 });
    }

    // Validate each file before processing
    const validationErrors: string[] = [];
    let totalSize = 0;

    for (const [index, file] of files.entries()) {
      // Check individual file size
      if (file.size > MAX_FILE_SIZE) {
        validationErrors.push(`File ${index + 1} (${file.name}) exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
        continue;
      }

      // Check MIME type
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        validationErrors.push(`File ${index + 1} (${file.name}) has unsupported type: ${file.type}`);
        continue;
      }

      // Check filename
      if (!file.name || file.name.length > 255) {
        validationErrors.push(`File ${index + 1} has invalid name`);
        continue;
      }

      totalSize += file.size;
    }

    // Check total size for batch
    if (totalSize > MAX_FILE_SIZE) {
      validationErrors.push(`Total file size (${(totalSize / (1024 * 1024)).toFixed(2)}MB) exceeds limit`);
    }

    if (validationErrors.length > 0) {
      return NextResponse.json({ 
        error: 'File validation failed', 
        details: validationErrors 
      }, { status: 400 });
    }

    // Create upload directory (use /tmp for serverless)
    const uploadsDir = path.join('/tmp', 'tickets', ticketId.toString());
    await fs.mkdir(uploadsDir, { recursive: true });

    const savedAttachments = [];

    // Process files sequentially to avoid memory issues
    for (const file of files) {
      try {
        // Stream file processing to reduce memory usage
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Generate unique filename
        const fileExt = path.extname(file.name);
        const uniqueFilename = `${crypto.randomUUID()}${fileExt}`;
        const tempFilePath = path.join(uploadsDir, uniqueFilename);
        
        // Write file to temp directory
        await fs.writeFile(tempFilePath, buffer);
        
        // Create database record
        const relativeStoragePath = path.join('uploads', 'tickets', ticketId.toString(), uniqueFilename);
        
        const [newAttachment] = await db.insert(ticketAttachments)
          .values({
            filename: uniqueFilename,
            originalFilename: file.name,
            fileSize: file.size,
            mimeType: file.type || 'application/octet-stream',
            storagePath: relativeStoragePath,
            ticketId,
            uploaderId: session.user.id,
          })
          .returning();
        
        savedAttachments.push(newAttachment);

        // Clean up temp file immediately to free memory
        try {
          await fs.unlink(tempFilePath);
        } catch (cleanupError) {
          console.warn(`Failed to cleanup temp file ${tempFilePath}:`, cleanupError);
        }

      } catch (fileError) {
        console.error(`Error processing file ${file.name}:`, fileError);
        return NextResponse.json({ 
          error: `Failed to process file: ${file.name}`,
          details: fileError instanceof Error ? fileError.message : 'Unknown error'
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      message: `Successfully uploaded ${savedAttachments.length} file(s)`,
      attachments: savedAttachments
    });

  } catch (error) {
    console.error('Error uploading attachments:', error);
    
    // More specific error handling for serverless
    if (error instanceof Error) {
      if (error.message.includes('PayloadTooLargeError')) {
        return NextResponse.json({ 
          error: 'Request payload too large for serverless function',
          maxSize: `${MAX_FILE_SIZE / (1024 * 1024)}MB`
        }, { status: 413 });
      }
    }

    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 