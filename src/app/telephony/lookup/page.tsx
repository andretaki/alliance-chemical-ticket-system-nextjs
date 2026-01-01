import Link from 'next/link';
import { redirect } from 'next/navigation';
import { findCustomerAndContactByPhone } from '@/services/telephony/TelephonyService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Phone, UserPlus, ChevronRight, Search, Users } from 'lucide-react';

interface PageProps {
  searchParams?: Promise<{ phone?: string }>;
}

export default async function TelephonyLookupPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const phone = resolvedParams?.phone || '';

  if (!phone) {
    return (
      <div className="p-6">
        <Card className="border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <CardHeader className="border-b border-gray-100 dark:border-gray-700">
            <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
              <div className="p-1.5 bg-blue-50 dark:bg-blue-900/20 rounded">
                <Phone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              Telephony Lookup
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
                <Search className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-gray-600 dark:text-gray-400">No phone number provided.</p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">Enter a phone number to search for matching customers.</p>
            </div>
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
    <div className="p-6">
      <Card className="border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <CardHeader className="border-b border-gray-100 dark:border-gray-700">
          <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <div className="p-1.5 bg-blue-50 dark:bg-blue-900/20 rounded">
              <Phone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            Matches for
            <span className="font-mono bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-blue-600 dark:text-blue-400">{phone}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          {matches.length === 0 && (
            <div className="text-center py-6">
              <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-full inline-block mb-4">
                <Users className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-4">No customer found with this number.</p>
              <Link
                href={createHref}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
              >
                <UserPlus className="h-4 w-4" />
                Create customer with this phone
              </Link>
            </div>
          )}

          {matches.length > 1 && (
            <div className="space-y-3">
              <p className="text-gray-600 dark:text-gray-400 text-sm">Multiple matches found. Choose a customer:</p>
              {matches.map((m) => (
                <Link
                  key={`${m.customerId}-${m.contactId || 'none'}`}
                  href={`/customers/${m.customerId}`}
                  className="block rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {m.customerName || `Customer ${m.customerId}`}
                      </p>
                      {m.contactName && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">Contact: {m.contactName}</p>
                      )}
                      {m.customerPhone && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">Phone: {m.customerPhone}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      {m.contactName && (
                        <Badge variant="outline" className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-400 text-xs font-medium">
                          Contact match
                        </Badge>
                      )}
                      <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
                    </div>
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
