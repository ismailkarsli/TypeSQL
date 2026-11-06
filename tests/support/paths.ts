import { join, resolve } from "node:path";

const tests = resolve(import.meta.dirname, "..");
export const repository = resolve(tests, "..");
export const scenarios = join(tests, "scenarios");
/** Failing scenarios and setup logs of the latest run; cleared when a run starts. */
export const artifacts = join(tests, ".artifacts");
