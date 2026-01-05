import { Skeleton } from '@/components/ui/skeleton';

export default function AdminLoading() {
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <Skeleton className="h-8 w-48" />

      {/* Admin Panels Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-24" />
            </div>
          </div>
        ))}
      </div>

      {/* Settings Section */}
      <div className="bg-white rounded-lg border p-4 space-y-4">
        <Skeleton className="h-6 w-32" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3 border rounded">
              <div className="space-y-1">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="h-6 w-12 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
