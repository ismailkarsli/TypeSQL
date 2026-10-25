#!/usr/bin/env node
/**
 * `typesql-language-server [root]`: the proxy (proxy.ts) on stdin and stdout, for the project at
 * `root` (default: the workspace of the editor's `initialize` request).
 */
import { resolve } from "node:path";
import { start } from "./proxy.js";

const [root] = process.argv.slice(2);
start(root === undefined ? undefined : resolve(root));
