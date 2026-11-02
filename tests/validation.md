# Observation fault checks

The initial implementation was checked by temporarily changing ordinary consumers and running Vitest without snapshot updates. All changes were restored after each experiment; none of these faults belongs in the permanent applications.

| Temporary fault | Result |
|---|---|
| Widen `pg-left-join.rows` to `any` | Snapshot fails with the specific row shape replaced by visible `any` |
| Correct both invalid calls in `compiler-rejection` | Lifecycle fails at compilation: expected failure instead succeeded |
| Append an unrelated TS2322 to `compiler-nullability` | Snapshot fails on both extra compiler output and the structured diagnostic |
| Change `Ada` to `Changed` in `pg-quick-start` | Snapshot fails on actual runtime output |
| Return a row in `pg-no-result` | Lifecycle fails at start: expected exception instead succeeded |
| Throw a different error in `runtime-no-executor` | Snapshot fails on the structured exception and stderr |
| Replace introspected SQLite schema with an empty interface | Unexpected compile failure; application execution never starts |
| Remove `pg-prepared/expected.snap` | Ordinary run fails; the missing snapshot is not created |

These checks use the same consumers, runner, compiler and snapshots as normal runs. `observation-shapes` permanently calibrates the compiler's inferred types, including aliases and exact optional-property distinctions. The boundary also checks candidate bytes against freshly packed tarballs and external graph resolutions against the committed lock on every installation.

A manual cancellation check also started a long-running Node process through the shared command runner, aborted its Vitest command scope, and verified that the process group stopped and its output was written to the retained log before cleanup.

Candidate identity was checked with three passing `pg-left-join` runs at the same core version (`3.0.0`): the original candidate, a temporary README-byte change, and the restored candidate. The changed candidate had a different SHA-512 hash and its installed bytes passed verification against the new tarball. Restoring the file restored the original hash. No successful outcome or installation was reused by version.
