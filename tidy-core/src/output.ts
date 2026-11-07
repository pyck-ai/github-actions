/** Receives every stdout line, workflow commands included. */
export type LogSink = (line: string) => void;

/** The default sink: one line on stdout. */
export const stdoutSink: LogSink = (line) => {
  process.stdout.write(`${line}\n`);
};

/** Escapes the message of a workflow command (`::name::message`). */
export function escapeCommandData(text: string): string {
  return text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

export interface Output {
  /** A plain log line. */
  log: LogSink;
  notice: (message: string) => void;
  warning: (message: string) => void;
  error: (message: string) => void;
}

/** Plain lines and `::notice::`, `::warning::` and `::error::` commands, all through `sink` (default stdout). */
export function createOutput(sink: LogSink = stdoutSink): Output {
  return {
    log: sink,
    notice: (message) => sink(`::notice::${escapeCommandData(message)}`),
    warning: (message) => sink(`::warning::${escapeCommandData(message)}`),
    error: (message) => sink(`::error::${escapeCommandData(message)}`),
  };
}
