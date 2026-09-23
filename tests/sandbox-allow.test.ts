import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ensureSandboxAllowlist,
  isStateDirAllowlisted,
  pathsEquivalent,
  toTomlPath,
  upsertWritableRoot,
} from "../src/config/sandbox-allow.js";
import { makeTmpDir, cleanup } from "./helpers.js";

describe("sandbox allowlist", () => {
  it("treats Windows slash variants as the same path", () => {
    expect(pathsEquivalent("C:\\Users\\Ada\\AppData\\Local\\codex-with-chatgpt", "C:/Users/Ada/AppData/Local/codex-with-chatgpt")).toBe(
      true
    );
    expect(pathsEquivalent("C:/Users/Ada/AppData/Local/codex-with-chatgpt/", "c:\\users\\ada\\appdata\\local\\codex-with-chatgpt")).toBe(
      true
    );
    expect(toTomlPath("C:\\Users\\Ada\\AppData\\Local\\codex-with-chatgpt").includes("\\")).toBe(false);
  });

  it("ensureSandboxAllowlist is a no-op that creates the state dir and returns alreadyAllowed", () => {
    const dir = makeTmpDir("sandbox-noop");
    const stateDir = path.join(dir, "state");
    const result = ensureSandboxAllowlist({ stateDir });
    expect(result.ok ?? true).toBe(true);
    expect(result.added).toBe(false);
    expect(result.alreadyAllowed).toBe(true);
    expect(fs.existsSync(stateDir)).toBe(true);
    cleanup(dir);
  });

  // The following tests verify the TOML utility functions are still intact
  // (used by the legacy code path and kept for backward compatibility).

  it("appends the table without rewriting existing settings", () => {
    const original = [
      'model = "gpt-5.6-luna"',
      "",
      "[features]",
      "js_repl = false",
      "",
      '[projects."/Users/ada/app"]',
      'trust_level = "trusted"',
      "",
    ].join("\n");
    const next = upsertWritableRoot(original, "/Users/ada/Library/Application Support/codex-with-chatgpt");
    expect(next).toContain('model = "gpt-5.6-luna"');
    expect(next).toContain("[features]");
    expect(next).toContain('trust_level = "trusted"');
    expect(next).toContain("[sandbox_workspace_write]");
    expect(next).toContain(
      `writable_roots = ["${toTomlPath("/Users/ada/Library/Application Support/codex-with-chatgpt")}"]`
    );
  });

  it("inserts writable_roots into an existing empty table", () => {
    const next = upsertWritableRoot("[sandbox_workspace_write]\n", "/tmp/c2c-state");
    expect(next).toContain(`writable_roots = ["${toTomlPath("/tmp/c2c-state")}"]`);
  });

  it("is idempotent when the path is already listed", () => {
    const dir = makeTmpDir("sandbox-idem");
    const stateDir = path.join(dir, "state");
    // ensureSandboxAllowlist no-op always returns alreadyAllowed
    const first = ensureSandboxAllowlist({ stateDir });
    const second = ensureSandboxAllowlist({ stateDir });
    expect(first.alreadyAllowed).toBe(true);
    expect(second.alreadyAllowed).toBe(true);
    cleanup(dir);
  });
});
