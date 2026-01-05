import { Skeleton } from '@/components/ui/skeleton';

export default function CustomerDetailLoading() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg border p-4 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact Info */}
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <Skeleton className="h-6 w-32" />
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </div>

        {/* Orders */}
        <div className="lg:col-span-2 bg-white rounded-lg border p-4 space-y-4">
          <Skeleton className="h-6 w-36" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-3 border rounded">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32 flex-1" />
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tickets Section */}
      <div className="bg-white rounded-lg border p-4 space-y-4">
        <Skeleton className="h-6 w-32" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3 border rounded">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-48 flex-1" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
