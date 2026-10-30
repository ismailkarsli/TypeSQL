import { postgresProbe } from "../support/dialect.js";
import {
	type Evaluated,
	evaluateTypes,
	type ProbeSession,
} from "../support/evaluate.js";

export const orderDependent = (r: Evaluated): boolean =>
	"error" in r || /^__T\.SqlError<any\b/.test(r.text);

export interface BatchOptions {
	readonly size: number;
	readonly isolate?: (r: Evaluated) => boolean;
	readonly group?: (i: number) => string;
	readonly timeoutMs: number;
	readonly log?: (m: string) => void;
}

export async function evaluateInBatches(
	session: ProbeSession,
	base: (indices: readonly number[]) => string,
	exprs: readonly string[],
	o: BatchOptions,
): Promise<Evaluated[]> {
	const out: Evaluated[] = new Array(exprs.length);
	const run = async (indices: readonly number[]): Promise<void> => {
		const limit = Math.max(
			30_000,
			Math.round((o.timeoutMs * indices.length) / o.size),
		);
		try {
			const results = await withTimeout(
				evaluateTypes(
					session,
					base(indices),
					indices.map((i) => exprs[i]!),
					postgresProbe,
				),
				limit,
			);
			indices.forEach((i, k) => {
				out[i] = results[k]!;
			});
		} catch (e) {
			await withTimeout(session.close(), 10_000).catch(() => undefined);
			if (indices.length === 1) {
				out[indices[0]!] = {
					error: `the compiler failed: ${(e as Error).message}`,
				};
				return;
			}
			o.log?.(
				`batch of ${indices.length} failed (${(e as Error).message}); splitting it`,
			);
			const half = Math.ceil(indices.length / 2);
			await run(indices.slice(0, half));
			await run(indices.slice(half));
		}
	};
	const batches: number[][] = [];
	let current: number[] = [];
	let currentGroup: string | undefined;
	for (let i = 0; i < exprs.length; i++) {
		const g = o.group?.(i);
		if (current.length && (current.length >= o.size || g !== currentGroup))
			batches.push(current), (current = []);
		currentGroup = g;
		current.push(i);
	}
	if (current.length) batches.push(current);
	let done = 0;
	for (const [b, batch] of batches.entries()) {
		await run(batch);
		done += batch.length;
		if (b % 10 === 9 || b === batches.length - 1)
			o.log?.(`evaluated ${done}/${exprs.length}`);
		if (b < batches.length - 1)
			await withTimeout(session.close(), 10_000).catch(() => undefined);
	}
	if (o.isolate) {
		const again = out.flatMap((r, i) => (o.isolate!(r) ? [i] : []));
		if (again.length) {
			for (const i of again) {
				await withTimeout(session.close(), 10_000).catch(() => undefined);
				await run([i]);
			}
			o.log?.(`evaluated ${again.length} again on their own`);
		}
	}
	return out;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	return Promise.race([
		p,
		new Promise<never>(
			(_, reject) =>
				(timer = setTimeout(
					() => reject(new Error(`timed out after ${Math.round(ms / 1000)} s`)),
					ms,
				)),
		),
	]).finally(() => clearTimeout(timer));
}
