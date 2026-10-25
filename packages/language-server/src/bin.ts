#!/usr/bin/env node
/**
 * `typesql-language-server <pipe>`: the completion server (server.ts) on stdin and stdout, for
 * the TypeScript 7.1 language server whose `custom/initializeAPISession` returned `pipe`.
 */
import { start } from "./server.js";

start(process.argv[2]!);
