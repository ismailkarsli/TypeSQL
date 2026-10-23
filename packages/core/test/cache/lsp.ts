/** A minimal LSP client for `tsc --lsp --stdio`: requests, notifications, and answers to the server's requests. */
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface Lsp {
  request(method: string, params: unknown): Promise<{ result?: unknown; error?: unknown }>;
  notify(method: string, params: unknown): void;
  uri(file: string): string;
  close(): Promise<void>;
}

export function startLsp(dir: string, env: NodeJS.ProcessEnv): Lsp {
  const server: ChildProcess = spawn(join(dir, "node_modules/typescript/bin/tsc"), ["--lsp", "--stdio"], { cwd: dir, env: { ...process.env, ...env }, stdio: "pipe" });
  let buffer = Buffer.alloc(0);
  let id = 0;
  const waiting = new Map<number, (m: { result?: unknown; error?: unknown }) => void>();
  const send = (m: object): void => {
    const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...m }));
    server.stdin!.write(`Content-Length: ${body.length}\r\n\r\n`);
    server.stdin!.write(body);
  };
  server.stdout!.on("data", (d: Buffer) => {
    buffer = Buffer.concat([buffer, d]);
    for (;;) {
      const end = buffer.indexOf("\r\n\r\n");
      if (end < 0) return;
      const len = Number(/Content-Length: (\d+)/i.exec(buffer.subarray(0, end).toString())![1]);
      if (buffer.length < end + 4 + len) return;
      const msg = JSON.parse(buffer.subarray(end + 4, end + 4 + len).toString()) as { id?: number; method?: string; params?: { items?: unknown[] }; result?: unknown; error?: unknown };
      buffer = buffer.subarray(end + 4 + len);
      if (msg.method && msg.id !== undefined) {
        send({ id: msg.id, result: msg.method === "workspace/configuration" ? (msg.params?.items ?? []).map(() => ({})) : null });
      } else if (msg.id !== undefined && waiting.has(msg.id)) {
        waiting.get(msg.id)!(msg);
        waiting.delete(msg.id);
      }
    }
  });
  return {
    request: (method, params) =>
      new Promise((resolve) => {
        const i = ++id;
        waiting.set(i, resolve);
        send({ id: i, method, params });
      }),
    notify: (method, params) => send({ method, params }),
    uri: (file) => pathToFileURL(join(dir, file)).href,
    async close() {
      await Promise.race([this.request("shutdown", null), new Promise((r) => setTimeout(r, 2000))]);
      this.notify("exit", null);
      await new Promise((r) => setTimeout(r, 300));
      server.kill();
    },
  };
}
