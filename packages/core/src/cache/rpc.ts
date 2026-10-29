export type Handler = (params: unknown) => unknown;
export type Handlers = { readonly [method: string]: Handler };

export class RpcError extends Error {
	readonly code: number;

	constructor(code: number, message: string) {
		super(message);
		this.code = code;
	}
}
export const MethodNotFound = -32601;
export const InvalidParams = -32602;
export const InternalError = -32603;

interface Message {
	readonly jsonrpc?: string;
	readonly id?: string | number | null;
	readonly method?: string;
	readonly params?: unknown;
}

export function serve(
	handlers: Handlers,
	input: NodeJS.ReadableStream,
	output: NodeJS.WritableStream,
): Promise<void> {
	const send = (message: object): void => {
		const body = Buffer.from(
			JSON.stringify({ jsonrpc: "2.0", ...message }),
			"utf8",
		);
		output.write(`Content-Length: ${body.length}\r\n\r\n`);
		output.write(body);
	};
	const dispatch = async (msg: Message): Promise<void> => {
		const handler = msg.method === undefined ? undefined : handlers[msg.method];
		const isRequest = msg.id !== undefined && msg.id !== null;
		if (!handler) {
			if (isRequest)
				send({
					id: msg.id,
					error: {
						code: MethodNotFound,
						message: `unknown method ${msg.method}`,
					},
				});
			return;
		}
		try {
			const result = await handler(msg.params);
			if (isRequest) send({ id: msg.id, result: result ?? null });
		} catch (e) {
			if (!isRequest) return;
			const code = e instanceof RpcError ? e.code : InternalError;
			send({
				id: msg.id,
				error: { code, message: e instanceof Error ? e.message : String(e) },
			});
		}
	};
	let buffer = Buffer.alloc(0);
	return new Promise((resolve) => {
		input.on("data", (chunk: Buffer) => {
			buffer = Buffer.concat([buffer, chunk]);
			for (;;) {
				const end = buffer.indexOf("\r\n\r\n");
				if (end < 0) return;
				const length = /content-length:\s*(\d+)/i.exec(
					buffer.subarray(0, end).toString("ascii"),
				);
				if (!length) {
					buffer = buffer.subarray(end + 4);
					continue;
				}
				const size = Number(length[1]);
				if (buffer.length < end + 4 + size) return;
				const body = buffer.subarray(end + 4, end + 4 + size).toString("utf8");
				buffer = buffer.subarray(end + 4 + size);
				let msg: Message;
				try {
					msg = JSON.parse(body) as Message;
				} catch {
					continue;
				}
				void dispatch(msg);
			}
		});
		input.on("end", () => resolve());
		input.on("close", () => resolve());
	});
}
