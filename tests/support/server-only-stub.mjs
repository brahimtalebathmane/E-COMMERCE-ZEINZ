// `server-only` is a Next.js build-time marker: under the bundler it resolves to
// an empty module for server code and throws for client code. Outside Next it
// is not resolvable at all, so tests that import server modules map it to an
// empty module here. Loaded via `--import` before any test file.
import { registerHooks } from "node:module";

const emptyModuleUrl = new URL("./empty-module.cjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: emptyModuleUrl, format: "commonjs", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
