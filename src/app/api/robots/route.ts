import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const host = request.headers.get('host') || 'localhost';
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  const baseUrl = `${protocol}://${host}`;

  // Different robots.txt for different environments
  const isProduction = env.NODE_ENV === 'production' &&
                      host.includes('alliance-chemical-ticket-system-nextjs.vercel.app');
  
  let robotsContent: string;
  
  if (isProduction) {
    // Production: Allow crawlers with restrictions
    robotsContent = `User-agent: *
Allow: /

# Block sensitive areas
Disallow: /api/
Disallow: /admin/
Disallow: /tickets/
Disallow: /dashboard/
Disallow: /settings/
Disallow: /auth/
Disallow: /_next/
Disallow: /static/

# Crawl delay for politeness
Crawl-delay: 1

# Sitemap location
Sitemap: ${baseUrl}/sitemap.xml

# Specific bot configurations
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

# Block aggressive crawlers
User-agent: MJ12bot
Disallow: /

User-agent: AhrefsBot
Disallow: /

User-agent: DotBot
Disallow: /`;
  } else {
    // Development/Staging: Block all crawlers
    robotsContent = `User-agent: *
Disallow: /

# This is a development/staging environment
# Crawling is not allowed`;
  }

  return new NextResponse(robotsContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
} 