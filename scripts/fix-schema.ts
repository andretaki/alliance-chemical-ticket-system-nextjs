#!/usr/bin/env npx tsx
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
import postgres from 'postgres';

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const client = postgres(dbUrl, { max: 1 });

  try {
    console.log('🔧 Fixing missing schema elements...\n');

    // Ensure enums exist
    console.log('Creating enums if missing...');
    await client.unsafe(`
      DO $$ BEGIN
        CREATE TYPE ticketing_prod.ai_suggested_action_enum AS ENUM (
          'reply_needed', 'follow_up', 'escalate', 'close', 'none'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add all missing columns to tickets
    const ticketColumns = [
      { name: 'customer_id', def: 'INTEGER REFERENCES ticketing_prod.customers(id) ON DELETE SET NULL' },
      { name: 'opportunity_id', def: 'INTEGER' },
      { name: 'merged_into_ticket_id', def: 'INTEGER' },
      { name: 'sla_policy_id', def: 'INTEGER' },
      { name: 'first_response_at', def: 'TIMESTAMP WITH TIME ZONE' },
      { name: 'first_response_due_at', def: 'TIMESTAMP WITH TIME ZONE' },
      { name: 'resolution_due_at', def: 'TIMESTAMP WITH TIME ZONE' },
      { name: 'sla_breached', def: 'BOOLEAN DEFAULT false NOT NULL' },
      { name: 'sla_notified', def: 'BOOLEAN DEFAULT false NOT NULL' },
      { name: 'ai_suggested_action', def: 'ticketing_prod.ai_suggested_action_enum' },
    ];

    for (const col of ticketColumns) {
      try {
        await client.unsafe(`ALTER TABLE ticketing_prod.tickets ADD COLUMN IF NOT EXISTS ${col.name} ${col.def}`);
        console.log(`✅ tickets.${col.name}`);
      } catch (e: any) {
        if (!e.message.includes('already exists')) {
          console.error(`❌ tickets.${col.name}: ${e.message}`);
        }
      }
    }

    // Add indexes
    console.log('\nCreating indexes...');
    await client`CREATE INDEX IF NOT EXISTS idx_tickets_customer ON ticketing_prod.tickets(customer_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_tickets_sla_policy_id ON ticketing_prod.tickets(sla_policy_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_tickets_sla_status ON ticketing_prod.tickets(status, sla_breached)`;
    console.log('✅ indexes created');

    // Verify
    const cols = await client`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'ticketing_prod' AND table_name = 'tickets'
      ORDER BY ordinal_position
    `;
    console.log('\n📋 tickets columns:', cols.map(c => c.column_name).join(', '));

  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    await client.end({ timeout: 5 });
  }
}

main();
