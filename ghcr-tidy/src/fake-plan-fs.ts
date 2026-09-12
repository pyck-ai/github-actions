import type { PlanFileSystem } from "./apply-capability.js";

export interface FakePlanFileSystemOptions {
  /**
   * If set, `writeFile` writes THIS content to the in-memory store
   * instead of what was actually passed in — simulating a truncated or
   * otherwise corrupted write (the `jq --argjson` zero-byte-file failure
   * mode `grantApply`'s round trip exists to catch). `undefined` means
   * "write faithfully" (the default, real-world-mirroring behaviour).
   */
  corruptWrittenContent?: string;
}

/**
 * An in-memory {@link PlanFileSystem} for tests. Supports injecting a
 * write-time corruption fault so `grantApply`'s hash/schema round-trip
 * check can be exercised without touching a real disk.
 */
export class FakePlanFileSystem implements PlanFileSystem {
  readonly files = new Map<string, string>();
  readonly dirsCreated: string[] = [];
  private readonly options: FakePlanFileSystemOptions;

  constructor(options: FakePlanFileSystemOptions = {}) {
    this.options = options;
  }

  mkdir(dirPath: string): Promise<void> {
    this.dirsCreated.push(dirPath);
    return Promise.resolve();
  }

  writeFile(filePath: string, content: string): Promise<void> {
    this.files.set(filePath, this.options.corruptWrittenContent ?? content);
    return Promise.resolve();
  }

  rename(from: string, to: string): Promise<void> {
    const content = this.files.get(from);
    if (content === undefined) {
      throw new Error(`fake fs: rename source ${from} does not exist`);
    }
    this.files.delete(from);
    this.files.set(to, content);
    return Promise.resolve();
  }

  readFile(filePath: string): Promise<string> {
    const content = this.files.get(filePath);
    if (content === undefined) {
      throw new Error(`fake fs: ${filePath} does not exist (ENOENT)`);
    }
    return Promise.resolve(content);
  }

  /** Directly seeds a file's content as if it were already on disk, bypassing `writeFile`/`rename` — for tests of pre-existing truncated/corrupt files. */
  seed(filePath: string, content: string): void {
    this.files.set(filePath, content);
  }
}
