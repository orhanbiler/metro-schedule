import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function ScheduleSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading schedule">
      {[1, 2, 3].map(day => (
        <div key={day} className="overflow-hidden rounded-xl border bg-card" aria-hidden="true">
          <div className="border-b bg-muted/25 px-4 py-3"><Skeleton className="h-5 w-40" /></div>
          <div className="divide-y sm:grid sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {[1, 2].map(shift => (
              <div key={shift} className="space-y-3 p-4 sm:p-5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function UserListSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div>
              <Skeleton className="h-4 w-32 mb-1" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function StatsCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16 mb-1" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}