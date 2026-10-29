#!/usr/bin/env node
import { main } from "./introspect/cli.js";

process.exitCode = await main(process.argv.slice(2));
