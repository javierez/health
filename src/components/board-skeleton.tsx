import { Logo } from "~/components/logo";
import { Card } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";

/** The page's own shape, pulsing: header, Lo urgente, Hoy beside the week and the day by day, the numbers. */
export function BoardSkeleton() {
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl"><Logo /></h1>
        <Skeleton className="h-9 w-24 rounded-2xl" />
      </header>
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-5">
        <Card className="space-y-3 p-4 lg:col-span-3">
          <Skeleton className="h-4 w-12" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </Card>
        <div className="space-y-4 lg:col-span-2">
          <Card className="space-y-3 p-4">
            <Skeleton className="h-4 w-24" />
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </Card>
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      </div>
      <Card className="p-4">
        <Skeleton className="h-4 w-20" />
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </Card>
    </div>
  );
}
