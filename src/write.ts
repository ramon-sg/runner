import { renameSync, rmSync, writeFileSync } from "node:fs";

/**
 * Writes a file atomically: to a temp file in the same directory, then renamed
 * over the target, so a reader never sees it half written. If either step
 * fails the temp file is removed and the error is rethrown.
 */
export function writeAtomic(file: string, content: string): void {
  const temp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(temp, content);
    renameSync(temp, file);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}
