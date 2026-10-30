#!/usr/bin/env node
import { main } from "./index.js";

// Migration hashing uses node:module's stripTypeScriptTypes, which warns on
// every run while it is experimental.
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...rest: never[]) => {
	if (String(warning).includes("stripTypeScriptTypes")) return;
	emitWarning(warning, ...rest);
}) as typeof process.emitWarning;

process.exitCode = await main(process.argv.slice(2));
