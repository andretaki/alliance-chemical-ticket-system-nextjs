import { Skeleton } from '@/components/ui/skeleton';

export default function TicketDetailLoading() {
  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-8 w-3/4" />
          <div className="flex gap-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>

        {/* Description */}
        <div className="bg-white rounded-lg border p-4 space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>

        {/* Conversation Thread */}
        <div className="space-y-4">
          <Skeleton className="h-6 w-32" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>

        {/* Reply Composer */}
        <div className="bg-white rounded-lg border p-4 space-y-3">
          <Skeleton className="h-32 w-full" />
          <div className="flex justify-end gap-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-80 border-l p-4 space-y-6 bg-gray-50">
        <div className="space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    </div>
  );
}
