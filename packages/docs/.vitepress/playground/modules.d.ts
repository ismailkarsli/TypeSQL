declare module "virtual:typesql-playground-types" {
	export const versions: {
		typesql: string;
		typescript: string;
		tsrs: string;
	};
	export const files: Record<string, string>;
}

declare module "*?raw" {
	const text: string;
	export default text;
}

declare module "*?url" {
	const url: string;
	export default url;
}

declare module "*?worker" {
	const WorkerConstructor: new () => Worker;
	export default WorkerConstructor;
}
