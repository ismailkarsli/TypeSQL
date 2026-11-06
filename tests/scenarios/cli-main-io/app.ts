import { main } from "@typesql/cli";

// `main` writes through the io it is given, for every command.
const stdout: string[] = [];
const stderr: string[] = [];
const io = {
	stdout: (text: string) => void stdout.push(text),
	stderr: (text: string) => void stderr.push(text),
};
export const introspected = await main(
	["introspect", "--db", process.env.SQLITE_PATH!],
	io,
);
export const usage = await main(["introspect", "--dialect", "sqlite"], io);
console.log(JSON.stringify({ introspected, usage, stdout, stderr }, null, 2));
