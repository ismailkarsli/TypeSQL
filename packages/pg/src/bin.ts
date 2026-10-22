#!/usr/bin/env node
/** `typesql`: `typesql introspect` writes the TypeSQL schema of a live database. */
import { main } from "./introspect/cli.js";

process.exitCode = await main(process.argv.slice(2));
