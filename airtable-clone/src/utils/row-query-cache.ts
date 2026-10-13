import type { QueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { api, type RouterInputs } from "~/trpc/react";

// Reset only this infinite view. Default-order keys otherwise partially match
// every cached sorted/filtered view and can refetch obsolete column contexts.
export function resetRowView(
  queryClient: QueryClient,
  input: RouterInputs["row"]["getRows"],
) {
  return queryClient.resetQueries(
    { queryKey: getQueryKey(api.row.getRows, input, "infinite"), exact: true },
    { throwOnError: true },
  );
}
