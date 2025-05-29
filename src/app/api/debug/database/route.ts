import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export async function GET() {
  try {
    // Get the table schema from PostgreSQL's information_schema
    const tableInfo = await db.execute(sql`
      SELECT 
        table_name, 
        column_name, 
        data_type, 
        column_default 
      FROM 
        information_schema.columns 
      WHERE 
        table_schema = 'ticketing_prod' 
      ORDER BY 
        table_name, ordinal_position
    `);

    // Attempt to count records in users table
    const userCount = await db.execute(sql`
      SELECT COUNT(*) as count FROM ticketing_prod.users
    `);

    return NextResponse.json({
      message: 'Database diagnostic information',
      tableSchema: tableInfo,
      userCount: userCount,
    });
  } catch (error) {
    console.error('Database diagnostic error:', error);
    return NextResponse.json(
      { 
        message: 'Error retrieving database information',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 