import { PassThrough } from "node:stream";
import { describe, expect, test } from "vitest";
import { emptyCache, stringifyCache } from "../../src/cache/format.js";
import { createMapper } from "../../src/cache/mapper.js";
import { serve } from "../../src/cache/rpc.js";

/** A mapper on in-memory streams, and a client that frames requests like TypeScript does. */
function connect() {
  const toServer = new PassThrough();
  const fromServer = new PassThrough();
  const mapper = createMapper({ generation: false, startDelayMs: 0, engine: "v1", log: () => {} });
  const done = serve(mapper.handlers, toServer, fromServer);
  let buffer = Buffer.alloc(0);
  const waiting = new Map<number, (m: { result?: unknown; error?: { code: number; message: string } }) => void>();
  fromServer.on("data", (d: Buffer) => {
    buffer = Buffer.concat([buffer, d]);
    for (;;) {
      const end = buffer.indexOf("\r\n\r\n");
      if (end < 0) return;
      const len = Number(/Content-Length: (\d+)/i.exec(buffer.subarray(0, end).toString())![1]);
      if (buffer.length < end + 4 + len) return;
      const msg = JSON.parse(buffer.subarray(end + 4, end + 4 + len).toString());
      buffer = buffer.subarray(end + 4 + len);
      waiting.get(msg.id)?.(msg);
    }
  });
  let id = 0;
  const request = (method: string, params: unknown) =>
    new Promise<{ result?: unknown; error?: { code: number; message: string } }>((resolve) => {
      const i = ++id;
      waiting.set(i, resolve);
      const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: i, method, params }));
      toServer.write(`Content-Length: ${body.length}\r\n\r\n`);
      toServer.write(body);
    });
  const close = async () => {
    toServer.end();
    await done;
    await mapper.stop();
  };
  return { request, close };
}

describe("content mapper protocol", () => {
  test("initialize, openProject, transform, closeProject", async () => {
    const c = connect();
    expect((await c.request("initialize", { positionEncodings: ["utf-8", "utf-16"] })).result).toEqual({ positionEncoding: "utf-16", diagnosticSource: "typesql" });
    expect((await c.request("openProject", { configFileName: "/p/tsconfig.json", projectHandle: "h1", compilerOptions: {} })).result).toEqual({});
    const file = { ...emptyCache("v1"), groups: { g: { t: "{}", h: "never", w: {}, q: {}, entries: { "SELECT 1": { r: ["select", "*"], a: "{}" } } } } };
    const t = (await c.request("transform", { fileName: "/p/src/q.typesqlcache", content: stringifyCache(file), projectHandle: "h1" })).result as { text: string; extension: string };
    expect(t.extension).toBe(".ts");
    expect(t.text).toContain('"SELECT 1": true;');
    // a stale engine version, an empty or a broken file: no entries, and no error
    for (const content of [stringifyCache({ ...file, engine: "v0" }), "{}\n", "{"]) {
      const r = (await c.request("transform", { fileName: "/p/src/q.typesqlcache", content, projectHandle: "h1" })).result as { text: string };
      expect(r.text).not.toContain("declare module");
    }
    expect((await c.request("closeProject", { projectHandle: "h1" })).result).toBeNull();
    await c.close();
  });

  test("bad initialize parameters and unknown methods are errors", async () => {
    const c = connect();
    expect((await c.request("initialize", {})).error?.code).toBe(-32602);
    expect((await c.request("somethingNew", {})).error?.code).toBe(-32601);
    await c.close();
  });
});
