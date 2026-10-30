import { join } from "node:path";
import {
	badDeclarations,
	declTypes,
	type Evaluated,
	ProbeSession,
} from "../support/evaluate.js";

export const here = import.meta.dirname;
const HEAD = `import type { Canon } from "../canon.js";\n`;

export function probeSession(name: string): ProbeSession {
	return new ProbeSession(
		join(here, "tsconfig.probe.json"),
		join(here, `.probe/__pg_ast_${name}__.ts`),
	);
}

async function evaluateBatch(
	session: ProbeSession,
	texts: readonly string[],
): Promise<Evaluated[]> {
	let probe = HEAD;
	texts.forEach((t, i) => {
		probe += `export declare const __x_${i}: Canon<${JSON.stringify(t)}>;\n`;
	});
	const { program, checker, sf } = await session.withProbe(probe);
	const kinds = (await session.typescript()).kinds;
	const types = await declTypes(checker, sf, kinds);
	const printed = await Promise.all(
		texts.map((_, i) => checker.typeToString(types.get(`__x_${i}`)!, sf, 1)),
	);
	const plain = (p: string): boolean =>
		/^"(?:[^"\\]|\\.)*"$/s.test(p) ||
		(p.startsWith("`!") && !p.includes("${any}"));
	if (printed.every(plain)) return printed.map((text) => ({ text }));
	const bad = await badDeclarations(program, sf);
	return printed.map((text, i) => {
		const error = bad.get(`__x_${i}`);
		return error === undefined ? { text } : { error };
	});
}

export async function evaluateCanon(
	texts: readonly string[],
	opts: {
		batch: number;
		jobs: number;
		sessions: ProbeSession[];
		progress: (done: number) => void;
	},
): Promise<Map<string, Evaluated>> {
	const out = new Map<string, Evaluated>();
	const batches: string[][] = [];
	for (let i = 0; i < texts.length; i += opts.batch)
		batches.push(texts.slice(i, i + opts.batch));
	while (opts.sessions.length < Math.min(opts.jobs, batches.length))
		opts.sessions.push(probeSession(String(opts.sessions.length)));
	let next = 0;
	let done = 0;
	await Promise.all(
		opts.sessions.map(async (session) => {
			while (next < batches.length) {
				const batch = batches[next++]!;
				const results = await evaluateBatch(session, batch);
				batch.forEach((t, k) => {
					out.set(t, results[k]!);
				});
				done += batch.length;
				opts.progress(done);
			}
			await session.close();
		}),
	);
	return out;
}
