// Parses a captured bash `verify.sh` run into an ordered list of
// {label, verdict} checks, per the oracle task spec:
//   - strip ANSI (verify-lib.sh's _pass/_fail hardcode \033[32m/\033[31m
//     regardless of TERM, so TERM=dumb alone does not remove them)
//   - match `^  [✓✗] (.*)$`
//   - a run is INVALID (not data) if stderr has "command not found" or
//     "unbound variable" — an assertion was silently skipped or the script
//     aborted under `set -u`.

const ANSI_RE = /\x1b\[[0-9;]*m/g;
const CHECK_LINE_RE = /^ {2}([✓✗]) (.*)$/;

export function stripAnsi(text) {
  return text.replace(ANSI_RE, "");
}

export function parseBashChecks(stdout) {
  const clean = stripAnsi(stdout);
  const checks = [];
  for (const line of clean.split("\n")) {
    const m = CHECK_LINE_RE.exec(line);
    if (m === undefined || m === null) {
      continue;
    }
    checks.push({ verdict: m[1] === "✓" ? "pass" : "fail", label: m[2] });
  }
  return checks;
}

export function isInvalid(stderr) {
  return /command not found|unbound variable/.test(stderr);
}
