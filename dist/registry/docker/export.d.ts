import type { DockerCli } from "./cli.js";
/**
 * Parses a USTAR/GNU/PAX tar archive (as produced by `docker export`) and
 * returns every entry's path, in archive order, exactly as tar itself
 * would report it (`tar -tf`'s output — directories keep their trailing
 * `/`). Handles GNU long-name (`typeflag 'L'`) and PAX extended header
 * (`typeflag 'x'`, the `path` key) entries, both of which real multi-layer
 * images use for paths longer than the 100-byte USTAR `name` field.
 */
export declare function parseTarEntries(buffer: Buffer): string[];
/**
 * Whether `wantPath` is present among `entries` (as returned by
 * {@link parseTarEntries}), after runtime-injected entries have been
 * filtered out. Comparison ignores a leading `./`, and leading/trailing
 * `/`, matching the bash predecessor's `^\.?${f#/}/?$` intent without its
 * SIGPIPE hazard.
 */
export declare function tarContainsPath(entries: readonly string[], wantPath: string): boolean;
/**
 * `docker create` (with a dummy trailing command so scratch images, which
 * have no `CMD`/`ENTRYPOINT`, don't refuse the create) + `docker export`,
 * parsed into a path listing, with the created container always removed
 * afterwards — including when `export` throws.
 */
export declare function listImageFiles(cli: DockerCli, image: string): Promise<string[]>;
//# sourceMappingURL=export.d.ts.map