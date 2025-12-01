import Link from 'next/link';
import { redirect } from 'next/navigation';
import { findCustomerAndContactByPhone } from '@/services/telephony/TelephonyService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface PageProps {
  searchParams?: { phone?: string };
}

export default async function TelephonyLookupPage({ searchParams }: PageProps) {
  const phone = searchParams?.phone || '';

  if (!phone) {
    return (
      <div className="p-6 text-white">
        <Card className="border-slate-800 bg-slate-900/60">
          <CardHeader>
            <CardTitle>Telephony Lookup</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-300">No phone number provided.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const matches = await findCustomerAndContactByPhone(phone);

  if (matches.length === 1) {
    redirect(`/customers/${matches[0].customerId}`);
  }

  const createHref = `/admin/customers/create?phone=${encodeURIComponent(phone)}`;

  return (
    <div className="p-6 text-white">
      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle>Matches for {phone}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {matches.length === 0 && (
            <div className="space-y-2">
              <p className="text-slate-300">No customer found with this number.</p>
              <Link href={createHref} className="text-indigo-300 hover:underline">
                Create customer with this phone
              </Link>
            </div>
          )}

          {matches.length > 1 && (
            <div className="space-y-3">
              <p className="text-slate-300">Multiple matches found. Choose a customer:</p>
              {matches.map((m) => (
                <Link
                  key={`${m.customerId}-${m.contactId || 'none'}`}
                  href={`/customers/${m.customerId}`}
                  className="block rounded-lg border border-slate-800/80 bg-slate-900/70 p-3 hover:bg-slate-800/60 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{m.customerName || `Customer ${m.customerId}`}</p>
                      {m.contactName && <p className="text-xs text-slate-400 truncate">Contact: {m.contactName}</p>}
                      {m.customerPhone && <p className="text-xs text-slate-400 truncate">Phone: {m.customerPhone}</p>}
                    </div>
                    {m.contactName && <Badge variant="outline" className="bg-slate-800 border-slate-700 text-xs">Contact match</Badge>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
