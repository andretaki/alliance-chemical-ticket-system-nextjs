import { Skeleton } from '@/components/ui/skeleton';

export default function TasksLoading() {
  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-28" />
        ))}
      </div>

      {/* Task List */}
      <div className="bg-white rounded-lg border">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="border-b p-4 flex items-center gap-4">
            <Skeleton className="h-5 w-5 rounded" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-5 w-64" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}
