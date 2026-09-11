/**
 * Parser for `buildargs.conf`, the KEY=VALUE file that Docker Bake, Task,
 * and CI all read to populate Docker `ARG`s and `$GITHUB_ENV`.
 *
 * The org has FOUR parsers for this file today (`set -a; . file`, Task's
 * `dotenv:`, a `grep`-into-`$GITHUB_ENV` step, and now this one) and they
 * disagree on inline comments, quoting, and embedded spaces — measured
 * divergence:
 *
 * | line                    | `set -a; . file`                | Task `dotenv:`  | `grep`>>GITHUB_ENV |
 * | ----------------------- | -------------------------------- | ---------------- | -------------------- |
 * | `A=hello world`         | `""` + `world: command not found` | `hello world`    | `hello world`         |
 * | `B=val # trailing`      | `val`                            | `val`            | `val # trailing`     |
 * | `C="quoted val"`        | `quoted val`                     | `quoted val`     | `"quoted val"`        |
 *
 * They agree today only because every existing `buildargs.conf` happens to
 * avoid the disagreeing constructs. This parser makes that lucky subset the
 * ENFORCED subset: a strict `KEY=VALUE` dialect with no inline comments, no
 * quoting, no `export`, and no embedded whitespace. Anything outside that
 * dialect is a hard parse error (with file + line number) rather than a
 * silently-different value depending on which of the four parsers happened
 * to run.
 */

/** A parse error in a `buildargs.conf` file, always naming the file and line. */
export class BuildArgsParseError extends Error {
  constructor(
    readonly path: string,
    readonly line: number,
    reason: string,
  ) {
    super(`${path}:${line}: ${reason}`);
    this.name = "BuildArgsParseError";
  }
}

/** The parsed contents of a `buildargs.conf` file: an ordered KEY -> VALUE map. */
export type BuildArgs = ReadonlyMap<string, string>;

const BLANK_OR_COMMENT_LINE = /^\s*(#.*)?$/;
const KEY_VALUE_LINE = /^([A-Za-z_][A-Za-z0-9_]*)=(\S+)$/;
const FORBIDDEN_VALUE_CHARS = /["'#]/;

/**
 * Parses `buildargs.conf` content into an ordered KEY -> VALUE map.
 *
 * Dialect (deliberately narrow — see module doc comment):
 * - A line matching `^\s*(#.*)?$` (blank, or whitespace, or a `#` comment
 *   with nothing else on the line) is skipped.
 * - Every other line MUST match `^([A-Za-z_][A-Za-z0-9_]*)=(\S+)$`, and the
 *   value must not contain `#`, `'`, or `"`.
 * - Anything else — a value with an embedded space, an inline `# comment`,
 *   a quoted value, an `export` prefix, a duplicate key — is a hard error
 *   naming `path` and the 1-based line number. There is no recovery: a
 *   `buildargs.conf` that fails to parse must never silently produce a
 *   partial or best-guess result.
 *
 * `path` is used only for error messages; this function does no I/O.
 */
export function parseBuildArgs(content: string, path: string): BuildArgs {
  const result = new Map<string, string>();
  const lines = content.split(/\r\n|\n/);

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;

    if (BLANK_OR_COMMENT_LINE.test(rawLine)) {
      return;
    }

    const match = KEY_VALUE_LINE.exec(rawLine);
    if (!match) {
      throw new BuildArgsParseError(
        path,
        lineNumber,
        `does not match KEY=VALUE (no spaces, quotes, or inline comments): ${JSON.stringify(rawLine)}`,
      );
    }

    const [, key, value] = match as unknown as [string, string, string];
    if (FORBIDDEN_VALUE_CHARS.test(value)) {
      throw new BuildArgsParseError(
        path,
        lineNumber,
        `value must not contain '#', "'", or '"': ${JSON.stringify(rawLine)}`,
      );
    }

    if (result.has(key)) {
      throw new BuildArgsParseError(path, lineNumber, `duplicate key: ${key}`);
    }

    result.set(key, value);
  });

  return result;
}
