const DB_CONNECTION_ERROR_CODES = new Set(["P1001", "P1002", "P1017"]);

const DB_CONNECTION_ERROR_PATTERNS = [
  /can't reach database server/i,
  /connect ECONNREFUSED/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /Connection terminated unexpectedly/i,
  /server closed the connection unexpectedly/i,
];

type ErrorLike = {
  code?: unknown;
  message?: unknown;
  cause?: unknown;
  name?: unknown;
};

const readMessage = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    return [value.name, value.message].filter(Boolean).join(": ");
  }
  if (typeof value === "object") {
    const maybe = value as ErrorLike;
    const nested = [
      typeof maybe.name === "string" ? maybe.name : "",
      typeof maybe.message === "string" ? maybe.message : "",
    ]
      .filter(Boolean)
      .join(": ");
    return nested;
  }
  return String(value);
};

export const isDatabaseConnectionError = (error: unknown): boolean => {
  if (!error) return false;

  const maybe = error as ErrorLike;
  const code = typeof maybe.code === "string" ? maybe.code : "";
  if (DB_CONNECTION_ERROR_CODES.has(code)) return true;

  const message = [readMessage(error), readMessage(maybe.cause)].filter(Boolean).join("\n");
  return DB_CONNECTION_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};
