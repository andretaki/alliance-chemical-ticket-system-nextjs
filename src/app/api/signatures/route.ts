import { NextResponse } from 'next/server';
import { db } from '@/db';
import { userSignatures } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/lib/authOptions';
import { z } from 'zod';
import { NextRequest } from 'next/server';

// Schema for signature validation
const signatureSchema = z.object({
  signature: z.string().min(1, { message: "Signature is required" }),
  isDefault: z.boolean().optional().default(false),
});

// GET /api/signatures - Get all signatures for the current user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const signatures = await db.query.userSignatures.findMany({
      where: eq(userSignatures.userId, session.user.id),
      orderBy: (signatures, { desc }) => [desc(signatures.isDefault), desc(signatures.updatedAt)],
    });

    return NextResponse.json(signatures);
  } catch (error) {
    console.error('Error fetching signatures:', error);
    return NextResponse.json(
      { error: 'Failed to fetch signatures' },
      { status: 500 }
    );
  }
}

// POST /api/signatures - Create a new signature
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = signatureSchema.parse(body);

    // If this is set as default, unset any existing default signatures
    if (validatedData.isDefault) {
      await db
        .update(userSignatures)
        .set({ isDefault: false })
        .where(
          and(
            eq(userSignatures.userId, session.user.id),
            eq(userSignatures.isDefault, true)
          )
        );
    }

    const newSignature = await db.insert(userSignatures).values({
      userId: session.user.id,
      signature: validatedData.signature,
      isDefault: validatedData.isDefault,
    }).returning();

    return NextResponse.json(newSignature[0], { status: 201 });
  } catch (error) {
    console.error('Error creating signature:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid signature data', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create signature' },
      { status: 500 }
    );
  }
}

// PUT /api/signatures/:id - Update a signature
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    
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
        eq(userSignatures.id, parseInt(id)),
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
          eq(userSignatures.id, parseInt(id)),
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const deletedSignature = await db
      .delete(userSignatures)
      .where(
        and(
          eq(userSignatures.id, parseInt(id)),
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