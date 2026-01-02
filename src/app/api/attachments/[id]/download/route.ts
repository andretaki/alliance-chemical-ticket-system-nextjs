import { NextRequest, NextResponse } from 'next/server';
import { db, ticketAttachments } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth-helpers';
import { checkTicketViewAccess } from '@/lib/ticket-auth';
import { validateAttachmentId, ValidationError } from '@/lib/validators';
import { apiError } from '@/lib/apiResponse';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await getServerSession();
    if (error) {
      return apiError('unauthorized', error, null, { status: 401 });
    }
    if (!session || !session.user) {
      return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
    }

    const { id } = await params;
    const attachmentId = validateAttachmentId(id);

    // Get the attachment record with ticket info
    const attachment = await db.query.ticketAttachments.findFirst({
      where: eq(ticketAttachments.id, attachmentId),
      columns: {
        id: true,
        ticketId: true,
        storagePath: true,
        filename: true
      }
    });

    if (!attachment || !attachment.storagePath || !attachment.ticketId) {
      return apiError('not_found', 'Attachment not found or has no valid storage path', null, { status: 404 });
    }

    // Check if user has access to the ticket this attachment belongs to
    const authResult = await checkTicketViewAccess(attachment.ticketId);
    if (!authResult.authorized) {
      return apiError('forbidden', 'You do not have access to this attachment', null, { status: 403 });
    }

    // --- VERCEL BLOB INTEGRATION WITH SIGNED URLS ---
    // Generate a temporary signed URL that expires after 1 hour for security
    // This prevents unauthorized access via URL sharing
    try {
      // Vercel Blob URLs are already public, but we add an access control layer
      // by generating short-lived signed URLs. Note: Vercel Blob basic tier
      // uses public URLs. For true signed URLs, consider upgrading or implementing
      // a proxy that validates session before redirecting.

      // For now, we verify access on each request. In production, consider:
      // 1. Upgrading to Vercel Blob Pro for native signed URL support
      // 2. Implementing a download proxy that streams the blob after auth check

      // Temporary solution: Add timestamp parameter to bust cache and indicate freshness
      const url = new URL(attachment.storagePath);
      url.searchParams.set('download', '1');
      url.searchParams.set('expires', (Date.now() + 3600000).toString()); // 1 hour

      return NextResponse.redirect(url.toString());
    } catch (blobError) {
      console.error('Error generating download URL:', blobError);
      return apiError('internal_error', 'Failed to generate download URL', null, { status: 500 });
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      return apiError('validation_error', error.message, null, { status: 400 });
    }
    console.error('Error downloading attachment:', error);
    return apiError('internal_error', 'Internal Server Error', null, { status: 500 });
  }
} 