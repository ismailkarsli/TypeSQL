import type { JsonMarker } from "../engine/inline.js";
import { param } from "./inline.js";

/**
 * A value sent as JSON text. Drivers serialize parameters differently: node-postgres turns a JS
 * array into a Postgres array literal and sends strings as they are, postgres.js runs
 * `JSON.stringify` on every json/jsonb parameter (so a pre-stringified value is encoded twice).
 * This wrapper gives the same JSON text in both: pg calls `toPostgres()`, postgres.js's JSON
 * serializer calls `toJSON()`, and its text serializer (`'' + x`) calls `toString()`.
 */
export class JsonParam<T = unknown> {
  constructor(readonly value: T) {}
  toPostgres(): string {
    return JSON.stringify(this.value);
  }
  toJSON(): T {
    return this.value;
  }
  toString(): string {
    return JSON.stringify(this.value);
  }
}

/**
 * Bind a JSON value inline: `` sql(`UPDATE t SET data = ${sql.json(value)}`) ``. Like
 * `sql.param()`, but the value is sent as JSON text by every driver and may only be used where
 * a json / jsonb value is expected. `null` and `undefined` are SQL NULL.
 */
export function json<const T>(value: T): JsonMarker<T> {
  return param(value === null || value === undefined ? null : new JsonParam(value)) as unknown as JsonMarker<T>;
}
