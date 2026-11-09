import { describe, expect, it } from "vitest";
import {
  hashLegacyCredential, verifyLegacyCredential,
} from "../../scripts/migration/hash-legacy-passwords.js";
import {
  findSupabaseReferences, rewriteStorageUrlsToKeys,
} from "../../scripts/migration/rewrite-storage-urls.js";

describe("migration transformations", () => {
  it("rewrites storage URLs deeply while retaining presentation fragments", () => {
    const source = {
      cover: "https://project.supabase.co/storage/v1/object/public/quangtu/covers/a.webp#pos=50%25%2064%25",
      nested: ["<img src=\"https://project.supabase.co/storage/v1/object/public/quangtu/content/b.webp\">"],
    };
    const rewritten = rewriteStorageUrlsToKeys(source);
    expect(rewritten.cover).toBe("covers/a.webp#pos=50%25%2064%25");
    expect(rewritten.nested[0]).toContain('src="content/b.webp"');
    expect(findSupabaseReferences(rewritten)).toEqual([]);
  });

  it("uses versioned salted PBKDF2 and rejects the wrong credential", () => {
    const pepper = "test-pepper-with-at-least-thirty-two-bytes";
    const credential = hashLegacyCredential("correct horse", pepper, {
      salt: Buffer.alloc(16, 3).toString("base64url"),
    });
    expect(credential.password_algorithm).toBe("pbkdf2-sha256");
    expect(credential.password_iterations).toBe(60_000);
    expect(verifyLegacyCredential("correct horse", pepper, credential)).toBe(true);
    expect(verifyLegacyCredential("wrong", pepper, credential)).toBe(false);
    expect(JSON.stringify(credential)).not.toContain("correct horse");
  });
});
