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
    // Check tickets columns
    const ticketCols = await client`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'ticketing_prod'
      AND table_name = 'tickets'
      ORDER BY ordinal_position
    `;
    console.log('tickets columns:', ticketCols.map(r => r.column_name).join(', '));

    // Check if customer_id exists
    const hasCustomerId = ticketCols.some(c => c.column_name === 'customer_id');
    console.log('\ncustomer_id exists:', hasCustomerId);

  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    await client.end({ timeout: 5 });
  }
}

main();
