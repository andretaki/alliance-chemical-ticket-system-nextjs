import { db, userSignatures } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { getServerSession } from '@/lib/auth-helpers';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/apiResponse';

// Schema for signature validation
const signatureSchema = z.object({
  signature: z.string().min(1, { message: "Signature is required" }),
  isDefault: z.boolean().optional().default(false),
});

// GET /api/signatures - Get all signatures for the current user
export async function GET() {
  try {
    const { session, error } = await getServerSession();
    if (error) {
      return apiError('unauthorized', error, null, { status: 401 });
    }
    if (!session?.user?.id) {
      return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
    }

    const signatures = await db.query.userSignatures.findMany({
      where: eq(userSignatures.userId, session.user.id),
      orderBy: (signatures, { desc }) => [desc(signatures.isDefault), desc(signatures.updatedAt)],
    });

    return apiSuccess(signatures);
  } catch (error) {
    console.error('Error fetching signatures:', error);
    return apiError('internal_error', 'Failed to fetch signatures', null, { status: 500 });
  }
}

// POST /api/signatures - Create a new signature
export async function POST(request: Request) {
  try {
    const { session, error } = await getServerSession();
    if (error) {
      return apiError('unauthorized', error, null, { status: 401 });
    }
    if (!session?.user?.id) {
      return apiError('unauthorized', 'Unauthorized', null, { status: 401 });
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

    return apiSuccess(newSignature[0], { status: 201 });
  } catch (error) {
    console.error('Error creating signature:', error);
    if (error instanceof z.ZodError) {
      return apiError('validation_error', 'Invalid signature data', error.errors, { status: 400 });
    }
    return apiError('internal_error', 'Failed to create signature', null, { status: 500 });
  }
} 