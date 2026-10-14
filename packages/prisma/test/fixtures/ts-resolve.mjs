// Lets Node run the generator from TypeScript sources (`node --import ./test/fixtures/ts-resolve.mjs
// ./src/bin.ts`): Node strips the types itself; this maps the `./x.js` import specifiers used in
// src/ to the `./x.ts` files on disk.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (/^\.\.?\//.test(specifier) && specifier.endsWith(".js")) return next(specifier.slice(0, -3) + ".ts", context);
      throw err;
    }
  },
});
