/** Every file is in exactly one shard, and the same files and sizes give the same shards. */
export function shardFiles(files, { index, count }) {
  const sized = [...files].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const load = Array(count).fill(0);
  const sets = Array.from({ length: count }, () => []);
  for (const [f, size] of sized) {
    const k = load.indexOf(Math.min(...load));
    sets[k].push(f);
    load[k] += size;
  }
  return sets[index - 1].sort();
}

/**
 * A shard's incremental report also carries the results it was given for the other shards'
 * files; those are left out.
 */
export function mergeReports(reports, owner) {
  const files = {};
  for (const [i, r] of reports.entries()) for (const [file, f] of Object.entries(r.files)) if (owner(file) === i) files[file] = f;
  const testFiles = Object.assign({}, ...reports.map((r) => r.testFiles ?? {}));
  return { ...reports[0], files, testFiles };
}
