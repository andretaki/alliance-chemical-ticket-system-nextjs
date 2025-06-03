import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { ticketAttachments } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Ensure the user is authenticated
    const session = await getServerSession(authOptions);
    if (!session) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { id } = await params;
    const attachmentId = parseInt(id);
    if (isNaN(attachmentId)) {
      return new NextResponse('Invalid attachment ID', { status: 400 });
    }

    // Get the attachment record
    const attachment = await db.query.ticketAttachments.findFirst({
      where: eq(ticketAttachments.id, attachmentId),
    });

    if (!attachment) {
      return new NextResponse('Attachment not found', { status: 404 });
    }

    // For this example, we'll assume files are stored in a local 'uploads' directory
    // In production, you'd likely use a storage service like S3, GCS, etc.
    const filePath = path.resolve(process.cwd(), attachment.storagePath);
    
    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      return new NextResponse('File not found on server', { status: 404 });
    }

    // Read the file
    const fileBuffer = fs.readFileSync(filePath);
    
    // Return the file with appropriate headers
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Disposition': `attachment; filename="${attachment.originalFilename}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Error downloading attachment:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 