import { NextRequest, NextResponse } from 'next/server';
import { db, ticketAttachments } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const { id } = await params;
    const attachmentId = parseInt(id, 10);
    if (isNaN(attachmentId)) {
      return new NextResponse(JSON.stringify({ error: 'Invalid attachment ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Get the attachment record
    const attachment = await db.query.ticketAttachments.findFirst({
      where: eq(ticketAttachments.id, attachmentId),
    });

    if (!attachment || !attachment.storagePath) {
      return new NextResponse('Attachment not found or has no valid storage path', { status: 404 });
    }

    // --- VERCEL BLOB INTEGRATION ---
    // The storagePath now holds the public URL to the file in Vercel Blob.
    // We simply redirect the user to this URL. The browser will handle the download.
    return NextResponse.redirect(attachment.storagePath);
  } catch (error) {
    console.error('Error downloading attachment:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
} 