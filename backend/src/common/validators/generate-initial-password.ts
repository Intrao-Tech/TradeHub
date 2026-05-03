import * as crypto from 'node:crypto';

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGIT = '0123456789';
const SPECIAL = '!@#$%^&*?_-';
const ALL = LOWER + UPPER + DIGIT + SPECIAL;

function pick(charset: string): string {
  // crypto.randomInt is uniform across [0, charset.length).
  return charset[crypto.randomInt(0, charset.length)];
}

/** Fixed-length 16-char password that always satisfies checkPasswordPolicy:
 *  one char from each of {lower, upper, digit, special}, the remaining 12
 *  drawn uniformly from the union, then shuffled with a Fisher–Yates pass
 *  using crypto.randomInt so the four required classes don't clump at the
 *  start. */
export function generateInitialPassword(length = 16): string {
  if (length < 4) {
    throw new Error('generateInitialPassword: length must be >= 4');
  }
  const required = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SPECIAL)];
  const rest: string[] = [];
  for (let i = 0; i < length - 4; i += 1) rest.push(pick(ALL));
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
