// Sleep helper used to step over the 1-second JWT iat granularity that
// causes refresh-token collisions (FU-2). Call between two operations that
// would issue refresh tokens for the same account back-to-back.

export function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/** Step past the next whole second so a freshly-signed JWT differs from one
 *  signed in the previous second. Slightly more than 1s to account for the
 *  fact that `setTimeout` is not jiffy-precise on macOS. */
export function jwtIatGap(): Promise<void> {
  return sleep(1100);
}
