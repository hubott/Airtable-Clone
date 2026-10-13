import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient, InfiniteQueryObserver } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
process.env.SKIP_ENV_VALIDATION = "1";
Object.assign(process.env, { NODE_ENV: "test" });
const { api } = await import("../src/trpc/react");
const { resetRowView } = await import("../src/utils/row-query-cache");

void test("resetting the default view does not refetch cached sorted or filtered views", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const inputs = [
    { tableId: "table", take: 200 },
    {
      tableId: "table",
      take: 200,
      sort: { columnId: "deleted", direction: "asc" as const },
    },
    {
      tableId: "table",
      take: 200,
      filter: {
        columnId: "converted",
        type: "TEXT" as const,
        operator: "isEmpty" as const,
      },
    },
  ];
  const counts = [0, 0, 0];
  const unsubscribe: (() => void)[] = [];
  try {
    for (const [index, input] of inputs.entries()) {
      const options = {
        queryKey: getQueryKey(api.row.getRows, input, "infinite"),
        queryFn: async () => {
          counts[index] = (counts[index] ?? 0) + 1;
          return { rows: [] };
        },
        initialPageParam: null,
        getNextPageParam: () => undefined,
      };
      await client.fetchInfiniteQuery(options);
      const observer = new InfiniteQueryObserver(client, options);
      unsubscribe.push(observer.subscribe(() => undefined));
    }
    await resetRowView(client, inputs[0] ?? { tableId: "table", take: 200 });
    assert.deepEqual(counts, [2, 1, 1]);
  } finally {
    unsubscribe.forEach((stop) => stop());
    client.clear();
  }
});
void test("view refresh errors propagate to mutation feedback instead of silently succeeding", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const input = { tableId: "table", take: 200 };
  let fail = false;
  const options = {
    queryKey: getQueryKey(api.row.getRows, input, "infinite"),
    queryFn: async () => {
      if (fail) throw new Error("Rows unavailable");
      return { rows: [] };
    },
    initialPageParam: null,
    getNextPageParam: () => undefined,
  };
  await client.fetchInfiniteQuery(options);
  const observer = new InfiniteQueryObserver(client, options);
  const stop = observer.subscribe(() => undefined);
  try {
    fail = true;
    await assert.rejects(resetRowView(client, input), /Rows unavailable/);
  } finally {
    stop();
    client.clear();
  }
});
