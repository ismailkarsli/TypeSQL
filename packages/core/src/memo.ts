export function memo<V>(
	fn: (text: string) => V,
	limit = 10_000,
): (text: string) => V {
	const cache = new Map<string, V>();
	return (text) => {
		let v = cache.get(text);
		if (v === undefined) {
			v = fn(text);
			if (cache.size >= limit) cache.clear();
			cache.set(text, v);
		}
		return v;
	};
}
