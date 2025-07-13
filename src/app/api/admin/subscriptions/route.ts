import { NextResponse, NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import * as subscriptionManager from '@/lib/graphSubscriptionManager';
import { db, subscriptions } from '@/lib/db';
import { eq } from 'drizzle-orm';


export async function GET(request: NextRequest) {
    try {
        const { session, error } = await requireAdmin();
        if (error) {
            return NextResponse.json({ error }, { status: error === 'Admin access required' ? 403 : 401 });
        }
        
        // List all subscriptions
        const subscriptions = await subscriptionManager.listSubscriptions();
        
        return NextResponse.json({
            message: `Found ${subscriptions.length} active subscriptions`,
            subscriptions
        });
    } catch (error: any) {
        if (error.message.startsWith('Unauthorized') || error.message.startsWith('Forbidden')) {
            return NextResponse.json({ error: error.message }, { status: error.message.startsWith('Unauthorized') ? 401 : 403 });
        }
        console.error('Admin API Error (GET subscriptions):', error);
        return NextResponse.json({ error: 'Failed to list subscriptions' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const { session, error } = await requireAdmin();
        if (error) {
            return NextResponse.json({ error }, { status: error === 'Admin access required' ? 403 : 401 });
        }
        const user = session!.user;
        const body = await request.json();
        const action = body.action;
        
        if (!action) {
            return NextResponse.json({ error: 'Action parameter required' }, { status: 400 });
        }
        
        switch (action) {
            case 'create': {
                const subscription = await subscriptionManager.createMailSubscription();
                if (!subscription) {
                    return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 });
                }
                
                // Save subscription to database
                try {
                    await db.insert(subscriptions).values({
                        subscriptionId: subscription.id,
                        resource: subscription.resource,
                        changeType: subscription.changeType,
                        expirationDateTime: new Date(subscription.expirationDateTime),
                        clientState: subscription.clientState,
                        notificationUrl: subscription.notificationUrl,
                        creatorId: user.id, // Use the admin user who created it
                        isActive: true,
                        renewalCount: 0
                    });
                    console.log(`Admin API: Subscription ${subscription.id} saved to database`);
                } catch (dbError) {
                    console.error('Admin API: Failed to save subscription to database:', dbError);
                    // Don't fail the request - subscription was created in Graph
                }
                
                return NextResponse.json({
                    message: 'Subscription created successfully',
                    subscription
                });
            }
            
            case 'renew': {
                const { subscriptionId } = body;
                if (!subscriptionId) {
                    return NextResponse.json({ error: 'Subscription ID required for renewal' }, { status: 400 });
                }
                
                const renewedSubscription = await subscriptionManager.renewSubscription(subscriptionId);
                if (!renewedSubscription) {
                    return NextResponse.json({ error: 'Failed to renew subscription' }, { status: 500 });
                }
                
                return NextResponse.json({
                    message: 'Subscription renewed successfully',
                    subscription: renewedSubscription
                });
            }
            
            case 'delete': {
                const { subscriptionId } = body;
                if (!subscriptionId) {
                    return NextResponse.json({ error: 'Subscription ID required for deletion' }, { status: 400 });
                }
                
                const success = await subscriptionManager.deleteSubscription(subscriptionId);
                if (!success) {
                    return NextResponse.json({ error: 'Failed to delete subscription' }, { status: 500 });
                }
                
                return NextResponse.json({
                    message: 'Subscription deleted successfully',
                });
            }
            
            case 'ensure': {
                const subscription = await subscriptionManager.ensureActiveSubscription();
                if (!subscription) {
                    return NextResponse.json({ error: 'Failed to ensure active subscription' }, { status: 500 });
                }
                
                // Check if this subscription exists in database, if not save it
                try {
                    const existingDbSub = await db.query.subscriptions.findFirst({
                        where: eq(subscriptions.subscriptionId, subscription.id)
                    });
                    
                    if (!existingDbSub) {
                        await db.insert(subscriptions).values({
                            subscriptionId: subscription.id,
                            resource: subscription.resource,
                            changeType: subscription.changeType,
                            expirationDateTime: new Date(subscription.expirationDateTime),
                            clientState: subscription.clientState,
                            notificationUrl: subscription.notificationUrl,
                            creatorId: user.id,
                            isActive: true,
                            renewalCount: 0
                        });
                        console.log(`Admin API: New subscription ${subscription.id} saved to database`);
                    }
                } catch (dbError) {
                    console.error('Admin API: Failed to check/save subscription to database:', dbError);
                }
                
                return NextResponse.json({
                    message: 'Active subscription ensured',
                    subscription
                });
            }
            
            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }
    } catch (error: any) {
        if (error.message.startsWith('Unauthorized') || error.message.startsWith('Forbidden')) {
            return NextResponse.json({ error: error.message }, { status: error.message.startsWith('Unauthorized') ? 401 : 403 });
        }
        console.error('Admin API Error (POST subscriptions):', error);
        return NextResponse.json({ error: 'Failed to process subscription request' }, { status: 500 });
    }
} 