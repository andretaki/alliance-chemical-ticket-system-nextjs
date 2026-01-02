import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/apiResponse';

interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  buildTime: string;
  checks: {
    database: {
      status: 'up' | 'down';
      responseTime?: number;
      error?: string;
    };
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    environment: string;
  };
}

export async function GET(): Promise<NextResponse<HealthCheckResult | { success: boolean; data: HealthCheckResult }>> {
  const startTime = Date.now();
  let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
  
  // Database health check
  let dbStatus: 'up' | 'down' = 'down';
  let dbResponseTime: number | undefined;
  let dbError: string | undefined;
  
  try {
    const dbStartTime = Date.now();
    // Simple database connectivity test
    await db.execute('SELECT 1 as health_check');
    dbResponseTime = Date.now() - dbStartTime;
    dbStatus = 'up';
    
    // If database response is slow, mark as degraded
    if (dbResponseTime > 1000) {
      overallStatus = 'degraded';
    }
  } catch (error) {
    dbStatus = 'down';
    dbError = error instanceof Error ? error.message : 'Unknown database error';
    overallStatus = 'unhealthy';
  }

  // Memory usage check
  const memUsage = process.memoryUsage();
  const memPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  
  // If memory usage is high, mark as degraded
  if (memPercentage > 85) {
    overallStatus = overallStatus === 'healthy' ? 'degraded' : overallStatus;
  }

  const healthResult: HealthCheckResult = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    buildTime: process.env.BUILD_TIME || 'unknown',
    checks: {
      database: {
        status: dbStatus,
        responseTime: dbResponseTime,
        error: dbError,
      },
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        percentage: Math.round(memPercentage),
      },
      environment: process.env.NODE_ENV || 'unknown',
    },
  };

  // Set appropriate HTTP status based on health
  const httpStatus = overallStatus === 'healthy' ? 200 :
                    overallStatus === 'degraded' ? 200 : 503;

  // Health endpoint uses custom headers, so we use NextResponse directly
  return NextResponse.json({ success: true, data: healthResult }, {
    status: httpStatus,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}

// HEAD method for lightweight health checks
export async function HEAD(): Promise<NextResponse> {
  try {
    await db.execute('SELECT 1 as health_check');
    return new NextResponse(null, { status: 200 });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
} 