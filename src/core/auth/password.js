/**
 * Password hashing — Argon2id.
 *
 * Uses @node-rs/argon2 (Rust, prebuilt binaries) rather than the `argon2` package,
 * which needs node-gyp and routinely fails to build on Windows.
 *
 * Argon2id over bcrypt: bcrypt silently truncates at 72 bytes and is only
 * CPU-hard, while Argon2id is memory-hard and therefore far more expensive to
 * attack with GPUs. It's the current OWASP recommendation.
 */
import { hash, verify, Algorithm } from "@node-rs/argon2";

/** OWASP-recommended Argon2id baseline: 19 MiB, 2 iterations, parallelism 1. */
const OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain) {
  if (typeof plain !== "string" || plain.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  return hash(plain, OPTIONS);
}

/**
 * Never throws on a bad hash — a malformed stored hash must read as "wrong
 * password", not crash the login route.
 */
export async function verifyPassword(storedHash, plain) {
  if (!storedHash || !plain) return false;
  try {
    return await verify(storedHash, plain, OPTIONS);
  } catch {
    return false;
  }
}
