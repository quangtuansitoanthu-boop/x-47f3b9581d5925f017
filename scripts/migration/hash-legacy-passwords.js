import {
  pbkdf2Sync, randomBytes, timingSafeEqual,
} from "node:crypto";

export const DEFAULT_PBKDF2_PARAMS = Object.freeze({
  algorithm: "pbkdf2-sha256",
  version: 1,
  iterations: 60_000,
  keyLength: 32,
  digest: "sha256",
});

function credentialInput(password, pepper) {
  if (typeof password !== "string" || password.length === 0) throw new Error("password-required");
  if (typeof pepper !== "string" || pepper.length < 32) throw new Error("pepper-too-short");
  return Buffer.from(`${password}\u0000${pepper}`, "utf8");
}

export function hashLegacyCredential(password, pepper, options = {}) {
  const params = { ...DEFAULT_PBKDF2_PARAMS, ...options };
  if (!Number.isInteger(params.iterations) || params.iterations < 60_000) {
    throw new Error("pbkdf2-iterations-below-baseline");
  }
  const salt = options.salt
    ? Buffer.from(options.salt, "base64url")
    : randomBytes(16);
  if (salt.length < 16) throw new Error("password-salt-too-short");
  const hash = pbkdf2Sync(
    credentialInput(password, pepper),
    salt,
    params.iterations,
    params.keyLength,
    params.digest,
  );
  return {
    password_algorithm: params.algorithm,
    password_version: params.version,
    password_iterations: params.iterations,
    password_salt: salt.toString("base64url"),
    password_hash: hash.toString("base64url"),
  };
}

export function verifyLegacyCredential(password, pepper, credential) {
  try {
    const actual = pbkdf2Sync(
      credentialInput(password, pepper),
      Buffer.from(credential.password_salt, "base64url"),
      credential.password_iterations,
      Buffer.from(credential.password_hash, "base64url").length,
      "sha256",
    );
    return timingSafeEqual(actual, Buffer.from(credential.password_hash, "base64url"));
  } catch {
    return false;
  }
}

export function benchmarkLegacyKdf(pepper, iterations = DEFAULT_PBKDF2_PARAMS.iterations) {
  const started = process.hrtime.bigint();
  hashLegacyCredential("benchmark-only", pepper, {
    iterations,
    salt: Buffer.alloc(16, 7).toString("base64url"),
  });
  return { iterations, durationMs: Number(process.hrtime.bigint() - started) / 1_000_000 };
}
