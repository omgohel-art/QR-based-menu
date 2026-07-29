/**
 * Cursor-based pagination utilities.
 *
 * A cursor is a base64-encoded JSON string containing the last item's sort key(s).
 * This avoids the offset problem (slow scans on large offsets) and works
 * seamlessly with database WHERE clauses.
 */

export type PaginatedResponse<T> = {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

/** Encode a cursor value to a base64 string */
export function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** Decode a base64 cursor string back to an object, or null if invalid */
export function decodeCursor(cursor: string | undefined | null): Record<string, unknown> | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/** Parse pagination params from an Express request query string */
export function parsePaginationParams(query: Record<string, any>) {
  const limit = Math.min(Math.max(parseInt(query.limit) || 20, 1), 100);
  const cursor = decodeCursor(query.cursor);
  return { limit, cursor };
}
