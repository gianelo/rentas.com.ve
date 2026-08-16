import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { hammingDistance } from "../domain/hamming-distance";
import type { PerceptualHash } from "../domain/perceptual-hash";
import { computeDHash } from "./sharp-dhash";

/**
 * design.md, Open Questions — the `<= 8` threshold is uncalibrated; no
 * unit test resolves it, it needs real photographs. TOO TIGHT: a
 * re-encoded/resized stolen photo falls outside it and is wrongly
 * allowed — the exact attack D4 exists to stop. TOO LOOSE: an honest
 * owner's two genuinely different photos (two apartments, same building)
 * fall inside it and the owner is wrongly blocked, likely for good.
 *
 * Usage: `pnpm calibrate:photo-hash <folder>` — prints every pairwise
 * Hamming distance for the images in <folder>, closest-first. Point it at
 * the same image saved twice, a re-encoded/resized copy, and two
 * different apartments — the numbers, not this script, decide the
 * threshold. Infrastructure, not domain: real filesystem/image I/O, a
 * human reads the output, nothing here is asserted by a test.
 */
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

async function hashFolder(folder: string): Promise<{ name: string; hash: PerceptualHash }[]> {
  const entries = await readdir(folder);
  const results: { name: string; hash: PerceptualHash }[] = [];

  for (const name of entries) {
    if (!IMAGE_EXTENSIONS.has(extname(name).toLowerCase())) continue;
    try {
      results.push({ name, hash: await computeDHash(await readFile(join(folder, name))) });
    } catch (error) {
      console.warn(`Skipping ${name}: ${(error as Error).message}`);
    }
  }

  return results;
}

async function main(): Promise<void> {
  const folder = process.argv[2];
  if (!folder) {
    console.error("Usage: pnpm calibrate:photo-hash <folder>");
    process.exitCode = 1;
    return;
  }

  const files = await hashFolder(folder);
  if (files.length < 2) {
    console.error(`Found ${files.length} image(s) in ${folder}; need at least 2 to compare.`);
    process.exitCode = 1;
    return;
  }

  const pairs: { a: string; b: string; distance: number }[] = [];
  for (let i = 0; i < files.length; i++) {
    const fileA = files[i];
    if (!fileA) continue;
    for (let j = i + 1; j < files.length; j++) {
      const fileB = files[j];
      if (!fileB) continue;
      pairs.push({
        a: fileA.name,
        b: fileB.name,
        distance: hammingDistance(fileA.hash, fileB.hash),
      });
    }
  }

  pairs.sort((left, right) => left.distance - right.distance);
  console.log(`Pairwise Hamming distances for ${files.length} image(s) in ${folder}:\n`);
  for (const { a, b, distance } of pairs) {
    console.log(`${String(distance).padStart(3)}  ${a}  <->  ${b}`);
  }
  console.log("\ndesign.md D4's proposed (uncalibrated) threshold is <= 8.");
}

main();
