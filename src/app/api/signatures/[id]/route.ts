
import { NextResponse } from 'next/server';
import { db, userSignatures } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth-helpers';
import { z } from 'zod';
import { NextRequest } from 'next/server';

// Schema for signature validation
const signatureSchema = z.object({
  signature: z.string().min(1, { message: "Signature is required" }),
  isDefault: z.boolean().optional().default(false),
});


// PUT /api/signatures/:id - Update a signature
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error } = await getServerSession();
    
        if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { id } = await params;
    const data = await request.json();
    
    // Validate input
    const validatedData = signatureSchema.parse(data);
    
    // Check if signature exists and belongs to user
    const existingSignature = await db.query.userSignatures.findFirst({
      where: and(
        eq(userSignatures.id, parseInt(id, 10)),
        eq(userSignatures.userId, session.user.id)
      )
    });
    
    if (!existingSignature) {
      return NextResponse.json({ error: 'Signature not found' }, { status: 404 });
    }
    
    // Update signature
    const [updatedSignature] = await db.update(userSignatures)
      .set({
        ...validatedData,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(userSignatures.id, parseInt(id, 10)),
          eq(userSignatures.userId, session.user.id)
        )
      )
      .returning();

    return NextResponse.json(updatedSignature);
  } catch (error) {
    console.error('Error updating signature:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid signature data', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update signature' },
      { status: 500 }
    );
  }
}

// DELETE /api/signatures/:id - Delete a signature
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error } = await getServerSession();
        if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const deletedSignature = await db
      .delete(userSignatures)
      .where(
        and(
          eq(userSignatures.id, parseInt(id, 10)),
          eq(userSignatures.userId, session.user.id)
        )
      )
      .returning();

    if (!deletedSignature.length) {
      return NextResponse.json(
        { error: 'Signature not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: 'Signature deleted successfully' });
  } catch (error) {
    console.error('Error deleting signature:', error);
    return NextResponse.json(
      { error: 'Failed to delete signature' },
      { status: 500 }
    );
  }
} 