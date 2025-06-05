import { NextResponse } from 'next/server';

export async function GET() {
  const securityTxt = `Contact: mailto:security@alliancechemical.com
Preferred-Languages: en
Canonical: https://alliance-chemical-ticket-system-nextjs.vercel.app/.well-known/security.txt
Policy: https://alliance-chemical-ticket-system-nextjs.vercel.app/security-policy
Hiring: https://alliancechemical.com/careers

# Please report security vulnerabilities responsibly
# Do not perform destructive testing
# Allow reasonable time for response before disclosure
`;

  return new NextResponse(securityTxt, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400'
    }
  });
} 