// Compact JSON: pretty-printing added 3-13% to every response, and models read compact JSON fine.
// Errors need no wrapper: McpServer turns a thrown error into an isError result with its message.
export function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  };
}

/** Keys of a scraper constant table as a z.enum tuple: tools take "TOP_FREE_IOS", the scraper wants the value behind it. */
export function keysOf<T extends object>(table: T) {
  return Object.keys(table) as [Extract<keyof T, string>, ...Extract<keyof T, string>[]];
}

export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;
