// `server-only` is a Next.js build-time marker: under the bundler it resolves to
// an empty module for server code and throws for client code. Outside Next it
// is not resolvable at all, so tests that import server modules map it to an
// empty module here. Loaded via `--import` before any test file.
import Module, { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const emptyModuleUrl = new URL("./empty-module.cjs", import.meta.url).href;
const emptyModulePath = fileURLToPath(emptyModuleUrl);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: emptyModuleUrl, format: "commonjs", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

// With --experimental-test-module-mocks, CommonJS `require` calls made by
// mocked-module graphs can bypass the resolve hook above; catch them at the
// CJS resolver too.
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, ...rest) {
  if (request === "server-only") return emptyModulePath;
  return originalResolveFilename.call(this, request, ...rest);
};
