import { NextResponse } from 'next/server';
import { healthMonitor } from '@/lib/health';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const health = await healthMonitor.getHealthStatus();

    logger.info('Health check requested', { status: health.status });

    const statusCode = health.status === 'healthy' ? 200 :
                      health.status === 'degraded' ? 207 : 503;

    return NextResponse.json(health, { status: statusCode });
  } catch (error) {
    logger.error('Health check failed', error instanceof Error ? error : undefined);
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: 'Health check failed'
      },
      { status: 500 }
    );
  }
}