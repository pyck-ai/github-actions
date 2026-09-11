import type { ImageFileCheck } from "../manifest/schema.js";
import { type CheckContext, type CheckResult } from "./types.js";
/**
 * Ports `check_image_file` — the only check kind that works on scratch
 * (shell-less) images, since it reads the exported filesystem rather than
 * executing anything. See `docker/export.ts` for the two bash bugs fixed
 * here (SIGPIPE false-missing, runtime-injected paths).
 *
 * Unlike `user`/`workdir`/`configUser`, a failed `create`/`export` here is
 * a normal check FAILURE (not a hard error) — this mirrors the bash's own
 * `image_files() { ... || return 1; }` → `_fail ... "could not export
 * image"`, since an image that exists but refuses `docker create` (e.g. a
 * transient daemon error) is a real, recorded finding for THIS check, not
 * a reason to abort the whole run.
 */
export declare function executeImageFileCheck(check: ImageFileCheck, index: number, ctx: CheckContext): Promise<CheckResult>;
//# sourceMappingURL=imageFile.d.ts.map