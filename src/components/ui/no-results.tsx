import { SearchX } from "lucide-react";

/** The empty state for any list. Says what to do next, not "no data". */
export function NoResults({ title = "Nothing here", message }: { title?: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <SearchX className="mb-4 h-12 w-12 text-gray-400" />
      <h3 className="mb-2 text-lg font-medium text-gray-900">{title}</h3>
      <p className="max-w-sm text-sm text-gray-500">{message}</p>
    </div>
  );
}
