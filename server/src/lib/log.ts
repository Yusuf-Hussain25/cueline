// Tiny structured logger: one line per event, tagged with the session it belongs to.
type Level = "info" | "warn" | "error";

const write = (level: Level, scope: string, message: string, extra?: Record<string, unknown>) => {
  const time = new Date().toISOString().slice(11, 23);
  const tail = extra && Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : "";
  const line = `${time} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}${tail}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

export const createLogger = (scope: string) => ({
  info: (message: string, extra?: Record<string, unknown>) => write("info", scope, message, extra),
  warn: (message: string, extra?: Record<string, unknown>) => write("warn", scope, message, extra),
  error: (message: string, extra?: Record<string, unknown>) => write("error", scope, message, extra),
});

export type Logger = ReturnType<typeof createLogger>;
