import { Skeleton } from '@/components/ui/skeleton';

export default function CustomersLoading() {
  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-36" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-36" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg border p-4 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>

      {/* Customer Table */}
      <div className="bg-white rounded-lg border">
        <div className="border-b p-3 flex gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
        {[...Array(10)].map((_, i) => (
          <div key={i} className="border-b p-4 flex items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
