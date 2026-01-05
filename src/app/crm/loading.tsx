import { Skeleton } from '@/components/ui/skeleton';

export default function CrmLoading() {
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Who to Talk To */}
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <Skeleton className="h-6 w-36" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 border rounded">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline Health */}
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-48 w-full" />
        </div>

        {/* Open Tasks */}
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <Skeleton className="h-6 w-28" />
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 border rounded">
                <Skeleton className="h-5 w-5" />
                <Skeleton className="h-4 w-48 flex-1" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        {/* Stale Opportunities */}
        <div className="bg-white rounded-lg border p-4 space-y-4">
          <Skeleton className="h-6 w-44" />
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 border rounded">
                <Skeleton className="h-4 w-40 flex-1" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-8" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
