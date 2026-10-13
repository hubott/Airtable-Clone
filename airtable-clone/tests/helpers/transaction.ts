// Records transaction boundaries; individual suites still mock database operations.
// This does not simulate PostgreSQL rollback or locking.
export function createTransactionMock(
  getDatabase: () => unknown,
  events: string[],
  recordBegin = false,
) {
  return async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
    if (recordBegin) events.push("begin");
    try {
      const result = await callback(getDatabase());
      events.push("commit");
      return result;
    } catch (error) {
      events.push("rollback");
      throw error;
    }
  };
}
