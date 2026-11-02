#!/usr/bin/env node
import { main } from "./index.js";

process.exitCode = await main(process.argv.slice(2));
