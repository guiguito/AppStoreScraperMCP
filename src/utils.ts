export function formatError(error: unknown): string {
  if (error instanceof Error) return `Error: ${error.message}`;
  return `Error: ${String(error)}`;
}

export function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function errorResult(error: unknown) {
  return {
    content: [{ type: "text" as const, text: formatError(error) }],
    isError: true as const,
  };
}
