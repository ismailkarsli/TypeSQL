import { expect, test } from "vitest";
import { mergeReports, shardFiles } from "./stryker-shards.mjs";

const files = [["a.ts", 50], ["b.ts", 40], ["c.ts", 30], ["d.ts", 20], ["e.ts", 10], ["f.ts", 10]];

test("shards split the files by size, every file in one shard", () => {
  const shards = [1, 2, 3].map((index) => shardFiles(files, { index, count: 3 }));
  expect(shards).toEqual([["a.ts", "f.ts"], ["b.ts", "e.ts"], ["c.ts", "d.ts"]]);
  expect(shards.flat().sort()).toEqual(files.map(([f]) => f));
  expect(shardFiles([...files].reverse(), { index: 2, count: 3 })).toEqual(shards[1]);
  expect(shardFiles(files, { index: 1, count: 1 })).toEqual(files.map(([f]) => f));
  expect(shardFiles(files.slice(0, 1), { index: 2, count: 2 })).toEqual([]);
});

test("a merged report takes each file from the shard that mutated it", () => {
  const mutants = (status) => ({ language: "typescript", source: "", mutants: [{ id: "1", status }] });
  const reports = [
    { schemaVersion: "2", thresholds: { high: 80, low: 60 }, files: { "a.ts": mutants("Killed"), "b.ts": mutants("Survived") }, testFiles: { "t1.test.ts": { tests: [] } } },
    { schemaVersion: "2", thresholds: { high: 80, low: 60 }, files: { "a.ts": mutants("Survived"), "b.ts": mutants("Killed") }, testFiles: { "t2.test.ts": { tests: [] } } },
  ];
  const merged = mergeReports(reports, (file) => (file === "a.ts" ? 0 : 1));
  expect(merged.files).toEqual({ "a.ts": mutants("Killed"), "b.ts": mutants("Killed") });
  expect(Object.keys(merged.testFiles)).toEqual(["t1.test.ts", "t2.test.ts"]);
  expect(merged.schemaVersion).toBe("2");
  expect(mergeReports(reports, () => -1).files).toEqual({});
});
