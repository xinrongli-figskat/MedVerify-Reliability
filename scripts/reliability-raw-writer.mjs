import { writeFile } from "node:fs/promises";

// Exclusive creation protects immutable evidence, including timestamp collisions.
// The caller owns the destination directory and the run's provenance.
export async function writeImmutableRun(destination, run) {
  await writeFile(destination, `${JSON.stringify(run, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600
  });
}
