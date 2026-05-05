// TEST-AUTH-040 — global setup for backend e2e specs.
// Disable noisy Nest logger during tests; allow individual specs to opt back
// in by calling `Logger.overrideLogger(console)`.
import { Logger } from '@nestjs/common';

Logger.overrideLogger(false);

// Friendlier BigInt JSON serialisation for assertion failure dumps.
// Doesn't affect Nest's BigIntSerializationInterceptor — that runs first.

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

// Hard fail if a test forgets to await a promise that throws.
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection in test:', err);
  throw err;
});
