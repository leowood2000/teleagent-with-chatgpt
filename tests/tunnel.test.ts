import { describe, it, expect, afterEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import type { ChildProcess } from "node:child_process";
import { PassThrough } from "node:stream";
import { findBinary } from "../src/tunnel/detect.js";
import {
  CloudflaredQuickTunnel,
  parseQuickTunnelUrl,
  type CloudflaredQuickTunnelOptions,
} from "../src/tunnel/cloudflared.js";
import { normalizeNamedTunnelHostname, CloudflaredNamedTunnel } from "../src/tunnel/cloudflared-named.js";
import { hostnameSlug, parseZoneInput, suggestedNamedHostname } from "../src/tunnel/hostname.js";
import {
  chooseQuickTunnel,
  isBenignRouteError,
  parseCreatedTunnel,
  parseTunnelList,
  provisionNamedTunnel,
  type CloudflaredAccount,
} from "../src/tunnel/named-provision.js";
import { resolveTunnelProtocol, tunnelProtocolArgs } from "../src/tunnel/protocol.js";
import { isNamedTunnelReady, needsTunnelChoice, readTunnelState } from "../src/tunnel/state.js";
import { cleanup, isolateStateDir, makeTmpDir, write } from "./helpers.js";

const stateDirs: string[] = [];
const previousStateDir = process.env.C2C_STATE_DIR;
const previousCloudflaredPath = process.env.C2C_CLOUDFLARED_PATH;
const QUICK_URL = "https://random-words-here-1234.trycloudflare.com";
type FetchImpl = NonNullable<CloudflaredQuickTunnelOptions["fetchImpl"]>;

class FakeCloudflaredProcess extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  killed = false;
  readonly kill = vi.fn(() => {
    this.killed = true;
    return true;
  });
}

function setupTunnel(fetchImpl: FetchImpl, startTimeoutMs = 1_000) {
  const child = new FakeCloudflaredProcess();
  const spawnImpl = vi.fn(() => child as unknown as ChildProcess);
  const tunnel = new CloudflaredQuickTunnel(undefined, "cloudflared", {
    spawnImpl,
    fetchImpl,
    startTimeoutMs,
  });
  return { child, spawnImpl, tunnel };
}

function announceUrl(child: FakeCloudflaredProcess): void {
  child.stderr.write(`INF ${QUICK_URL}\n`);
}

function announceRegistered(child: FakeCloudflaredProcess): void {
  child.stderr.write(
    "INF Registered tunnel connection connIndex=0 connection=afd78110-1646-43d4-be82-9015aa04f18f event=0 ip=2606:4700:a0::7 location=lax11 protocol=http2\n"
  );
}

function healthResponse(): Response {
  return new Response(JSON.stringify({ service: "c2c-bridge", status: "ok" }), { status: 200 });
}

afterEach(() => {
  while (stateDirs.length) cleanup(stateDirs.pop()!);
  if (previousStateDir === undefined) delete process.env.C2C_STATE_DIR;
  else process.env.C2C_STATE_DIR = previousStateDir;
  if (previousCloudflaredPath === undefined) delete process.env.C2C_CLOUDFLARED_PATH;
  else process.env.C2C_CLOUDFLARED_PATH = previousCloudflaredPath;
});

describe("findBinary", () => {
  it("uses C2C_CLOUDFLARED_PATH for an accessible cloudflared executable", () => {
    const dir = makeTmpDir("cloudflared-path");
    stateDirs.push(dir);
    const filename = process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
    const configured = write(dir, filename, "placeholder");
    if (process.platform !== "win32") fs.chmodSync(configured, 0o755);
    process.env.C2C_CLOUDFLARED_PATH = configured;
    expect(findBinary("cloudflared")).toBe(configured);
  });
});

describe("parseQuickTunnelUrl", () => {
  it("extracts the URL from cloudflared banner output", () => {
    const line =
      "2026-08-28T10:00:00Z INF |  https://random-words-here-1234.trycloudflare.com                              |";
    expect(parseQuickTunnelUrl(line)).toBe(QUICK_URL);
  });

  it("ignores unrelated lines and non-Quick-Tunnel hosts", () => {
    expect(parseQuickTunnelUrl("INF Starting tunnel connection")).toBeNull();
    expect(parseQuickTunnelUrl("visit https://www.cloudflare.com for docs")).toBeNull();
    expect(parseQuickTunnelUrl("https://evil.example.com/trycloudflare.com")).toBeNull();
  });

  it("rejects Cloudflare's API host", () => {
    expect(parseQuickTunnelUrl("INF https://api.trycloudflare.com")).toBeNull();
  });
});

describe("CloudflaredQuickTunnel", () => {
  it("resolves only after the public health endpoint identifies the bridge", async () => {
    const fetchImpl = vi.fn(async () => healthResponse());
    const { child, spawnImpl, tunnel } = setupTunnel(fetchImpl);
    const starting = tunnel.start(3333);
    announceUrl(child);

    await expect(starting).resolves.toBe(QUICK_URL);
    expect(spawnImpl).toHaveBeenCalledWith(
      "cloudflared",
      ["tunnel", "--url", "http://127.0.0.1:3333", "--no-autoupdate"],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
    );
    expect(fetchImpl).toHaveBeenCalledWith(`${QUICK_URL}/health`, {
      redirect: "error",
      signal: expect.any(AbortSignal),
    });
    expect(tunnel.status()).toMatchObject({ running: true, url: QUICK_URL });
    await tunnel.stop();
  });

  it("passes --protocol when C2C_TUNNEL_PROTOCOL is set", async () => {
    vi.stubEnv("C2C_TUNNEL_PROTOCOL", "http2");
    const { child, spawnImpl, tunnel } = setupTunnel(async () => healthResponse());
    const starting = tunnel.start(3333);
    announceUrl(child);
    await expect(starting).resolves.toBe(QUICK_URL);
    expect(spawnImpl).toHaveBeenCalledWith(
      "cloudflared",
      ["tunnel", "--url", "http://127.0.0.1:3333", "--no-autoupdate", "--protocol", "http2"],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
    );
    await tunnel.stop();
    vi.unstubAllEnvs();
  });

  it("keeps consuming cloudflared errors after the tunnel is ready", async () => {
    const { child, tunnel } = setupTunnel(async () => healthResponse());
    const starting = tunnel.start(3333);
    announceUrl(child);
    await expect(starting).resolves.toBe(QUICK_URL);

    child.stderr.write("ERR runtime connection error\n");
    await new Promise((resolve) => setImmediate(resolve));
    expect(tunnel.status().detail).toBe("ERR runtime connection error");
    await tunnel.stop();
  });

  it("does not accept an HTTP 200 response from another service", async () => {
    const { child, tunnel } = setupTunnel(
      async () =>
        new Response(JSON.stringify({ service: "cloudflare", status: "ok" }), { status: 200 }),
      20
    );
    const starting = tunnel.start(3333);
    announceUrl(child);

    await expect(starting).rejects.toThrow(/timed out/i);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(tunnel.status()).toMatchObject({ running: false, url: null });
  });

  it("does not spawn twice or resolve a stopped pending start", async () => {
    const { child, spawnImpl, tunnel } = setupTunnel(() => new Promise<Response>(() => {}));
    const starting = tunnel.start(3333);
    announceUrl(child);
    await new Promise((resolve) => setImmediate(resolve));

    const concurrent = tunnel.start(3333);
    await tunnel.stop();
    await expect(starting).rejects.toThrow(/stopped/i);
    await expect(concurrent).rejects.toThrow(/stopped/i);
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("does not resolve if cloudflared exits while the health probe is in flight", async () => {
    let resolveFetch!: (response: Response) => void;
    const { child, tunnel } = setupTunnel(
      () => new Promise<Response>((resolve) => (resolveFetch = resolve))
    );
    const starting = tunnel.start(3333);
    announceUrl(child);
    await new Promise((resolve) => setImmediate(resolve));

    child.exitCode = 1;
    child.emit("exit", 1, null);
    resolveFetch(healthResponse());
    await expect(starting).rejects.toThrow(/exited/i);
    expect(tunnel.status()).toMatchObject({ running: false, url: null });
  });

  it("rejects when spawning reports an asynchronous error", async () => {
    const { child, tunnel } = setupTunnel(async () => new Response(null));
    const starting = tunnel.start(3333);
    await new Promise((resolve) => setImmediate(resolve));
    child.emit("error", new Error("spawn cloudflared ENOENT"));

    await expect(starting).rejects.toThrow(/ENOENT/i);
    expect(tunnel.status()).toMatchObject({ running: false, url: null });
  });

  it("retries a non-ready health response before resolving", async () => {
    let calls = 0;
    const cancelBody = vi.fn(async () => undefined);
    const { child, tunnel } = setupTunnel(async () => {
      calls += 1;
      return calls === 1
        ? ({ ok: false, status: 503, body: { cancel: cancelBody } } as unknown as Response)
        : healthResponse();
    });
    const starting = tunnel.start(3333);
    announceUrl(child);

    await expect(starting).resolves.toBe(QUICK_URL);
    expect(calls).toBe(2);
    expect(cancelBody).toHaveBeenCalledTimes(1);
    await tunnel.stop();
  });

  it("falls back to registered-only when public health never succeeds but cloudflared registered", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("fetch failed");
    });
    const { child, tunnel } = setupTunnel(fetchImpl, 100);
    const starting = tunnel.start(3333);
    announceUrl(child);
    announceRegistered(child);

    await expect(starting).resolves.toBe(QUICK_URL);
    expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(tunnel.status()).toMatchObject({
      running: true,
      url: QUICK_URL,
      verification: "registered-only",
    });
    await tunnel.stop();
    expect(tunnel.status()).toMatchObject({ running: false, url: null, verification: null });
  });

  it("prefers public verification over the registered fallback", async () => {
    let calls = 0;
    const { child, tunnel } = setupTunnel(async () => {
      calls += 1;
      if (calls === 1) throw new Error("fetch failed");
      return healthResponse();
    }, 2_000);
    const starting = tunnel.start(3333);
    announceUrl(child);
    announceRegistered(child);

    await expect(starting).resolves.toBe(QUICK_URL);
    expect(tunnel.status()).toMatchObject({ running: true, url: QUICK_URL, verification: "public-verified" });
    await tunnel.stop();
  });

  it("still times out without registration when public health never succeeds", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("fetch failed");
    });
    const { child, tunnel } = setupTunnel(fetchImpl, 100);
    const starting = tunnel.start(3333);
    announceUrl(child); // URL, but never "Registered tunnel connection"

    await expect(starting).rejects.toThrow(/timed out/i);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(tunnel.status()).toMatchObject({ running: false, url: null });
  });
});

describe("tunnel transport protocol", () => {
  it("keeps cloudflared's default when C2C_TUNNEL_PROTOCOL is unset or empty", () => {
    expect(resolveTunnelProtocol({})).toBeNull();
    expect(resolveTunnelProtocol({ C2C_TUNNEL_PROTOCOL: "  " })).toBeNull();
    expect(tunnelProtocolArgs(null)).toEqual([]);
  });

  it("accepts the cloudflared protocol names case-insensitively", () => {
    expect(resolveTunnelProtocol({ C2C_TUNNEL_PROTOCOL: "HTTP2" })).toBe("http2");
    expect(resolveTunnelProtocol({ C2C_TUNNEL_PROTOCOL: " quic " })).toBe("quic");
    expect(resolveTunnelProtocol({ C2C_TUNNEL_PROTOCOL: "auto" })).toBe("auto");
    expect(tunnelProtocolArgs("http2")).toEqual(["--protocol", "http2"]);
  });

  it("rejects unknown protocols instead of silently falling back", () => {
    expect(() => resolveTunnelProtocol({ C2C_TUNNEL_PROTOCOL: "tcp" })).toThrow(
      /C2C_TUNNEL_PROTOCOL must be one of auto, quic, http2/
    );
  });
});

describe("normalizeNamedTunnelHostname", () => {
  it("normalizes a valid hostname", () => {
    expect(normalizeNamedTunnelHostname("Dev.GetRemi.xyz.")).toBe("dev.getremi.xyz");
  });

  it("rejects URLs and invalid hostnames", () => {
    expect(() => normalizeNamedTunnelHostname("https://dev.getremi.xyz")).toThrow(/invalid/i);
    expect(() => normalizeNamedTunnelHostname("localhost")).toThrow(/invalid/i);
  });
});

describe("CloudflaredNamedTunnel auto-restart", () => {
  const NAMED_URL = "https://c2c-demo.example.com";

  function makeNamed(
    extra?: Partial<ConstructorParameters<typeof CloudflaredNamedTunnel>[0]>
  ): { tunnel: CloudflaredNamedTunnel; children: FakeCloudflaredProcess[] } {
    const children: FakeCloudflaredProcess[] = [];
    const spawnImpl = vi.fn(() => {
      const child = new FakeCloudflaredProcess();
      children.push(child);
      return child as unknown as ChildProcess;
    });
    const tunnel = new CloudflaredNamedTunnel({
      tunnelName: "c2c-abc",
      hostname: "c2c-demo.example.com",
      binaryOverride: "cloudflared",
      spawnImpl,
      startTimeoutMs: 2_000,
      ...extra,
    });
    return { tunnel, children };
  }

  function announce(child: FakeCloudflaredProcess): void {
    child.stderr.write(
      "INF Registered tunnel connection connIndex=0 connection=afd78110 event=0 protocol=http2\n"
    );
  }

  /** Flush process.nextTick / microtask queues (readline line events). */
  async function flush(): Promise<void> {
    await new Promise<void>((resolve) => process.nextTick(() => process.nextTick(resolve)));
  }

  it("restarts automatically after an unexpected exit and reports disconnect/reconnect", async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const { tunnel, children } = makeNamed({
      onDisconnect: (reason) => events.push(`disconnect:${reason}`),
      onReconnect: (url) => events.push(`reconnect:${url}`),
    });

    const starting = tunnel.start(3333);
    announce(children[0]);
    await expect(starting).resolves.toBe(NAMED_URL);

    // Unexpected exit after establishment.
    children[0].emit("exit", 1, null);
    expect(tunnel.status()).toMatchObject({ running: false, url: null });
    expect(events[0]).toMatch(/disconnect:cloudflared exited with code 1/);

    // First restart attempt fires after the 1s backoff and restores the URL.
    await vi.advanceTimersByTimeAsync(900);
    expect(children.length).toBe(1); // backoff not elapsed yet
    await vi.advanceTimersByTimeAsync(200);
    expect(children.length).toBe(2); // respawn happened
    announce(children[1]);
    await vi.advanceTimersByTimeAsync(0);
    expect(tunnel.status()).toMatchObject({ running: true, url: NAMED_URL });
    expect(events[1]).toBe(`reconnect:${NAMED_URL}`);
    expect(tunnel.restartCount()).toBe(0);
    await tunnel.stop();
    vi.useRealTimers();
  });

  it("backs off exponentially across consecutive restart failures", async () => {
    vi.useFakeTimers();
    const { tunnel, children } = makeNamed();
    const starting = tunnel.start(3333);
    announce(children[0]);
    await expect(starting).resolves.toBe(NAMED_URL);

    // Established connector dies: attempt 1 scheduled at +1s.
    children[0].emit("exit", 1, null);
    await vi.advanceTimersByTimeAsync(900);
    expect(children.length).toBe(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(children.length).toBe(2); // respawn 1 spawned

    // Respawn never registers and dies: attempt 2 scheduled at +2s.
    children[1].emit("exit", 1, null);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(children.length).toBe(2); // 1.5s < 2s backoff, no tight respawn loop
    await vi.advanceTimersByTimeAsync(700);
    expect(children.length).toBe(3); // respawn 2 after the 2s backoff
    await tunnel.stop();
    vi.useRealTimers();
  });

  it("does not resurrect after a deliberate stop", async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const { tunnel, children } = makeNamed({
      onDisconnect: (reason) => events.push(`disconnect:${reason}`),
      onReconnect: (url) => events.push(`reconnect:${url}`),
    });
    const starting = tunnel.start(3333);
    announce(children[0]);
    await expect(starting).resolves.toBe(NAMED_URL);

    await tunnel.stop();
    expect(children[0].kill).toHaveBeenCalledWith("SIGTERM");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(tunnel.status()).toMatchObject({ running: false, url: null });
    expect(children.length).toBe(1); // no respawn ever
    expect(events).toEqual([]);
    vi.useRealTimers();
  });

  it("restart() replaces a hung connector even while it looks connected", async () => {
    const { tunnel, children } = makeNamed();
    const starting = tunnel.start(3333);
    announce(children[0]);
    await expect(starting).resolves.toBe(NAMED_URL);

    // Simulate the alive-but-unhealthy case: provider thinks it is connected.
    const hung = children[0];
    const restarted = tunnel.restart(3333);
    await flush(); // let stop() resolve so start() spawns the replacement
    expect(hung.kill).toHaveBeenCalledWith("SIGTERM");
    expect(children.length).toBe(2);
    announce(children[1]);
    await expect(restarted).resolves.toBe(NAMED_URL);
    expect(tunnel.status()).toMatchObject({ running: true, url: NAMED_URL });
    await tunnel.stop();
  });

  it("clears a pending restart timer when a reconnect happened through another path", async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const { tunnel, children } = makeNamed({
      onReconnect: (url) => events.push(`reconnect:${url}`),
    });
    const starting = tunnel.start(3333);
    announce(children[0]);
    await expect(starting).resolves.toBe(NAMED_URL);

    // Established connector dies: auto-restart scheduled at +1s...
    children[0].emit("exit", 1, null);
    // ...but an explicit restart() fixes it first (attempts reset to 0).
    const restarted = tunnel.restart(3333);
    await flush();
    announce(children[1]);
    await expect(restarted).resolves.toBe(NAMED_URL);
    expect(events.filter((e) => e.startsWith("reconnect:")).length).toBe(0);
    expect(tunnel.restartCount()).toBe(0);

    // The stale auto-restart timer must not duplicate the reconnect.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(children.length).toBe(2); // no extra spawn
    expect(tunnel.status()).toMatchObject({ running: true, url: NAMED_URL });
    await tunnel.stop();
    vi.useRealTimers();
  });

  it("stale exit from a replaced child never clears the new connector", async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const { tunnel, children } = makeNamed({
      onDisconnect: (reason) => events.push(`disconnect:${reason}`),
      onReconnect: (url) => events.push(`reconnect:${url}`),
    });
    const starting = tunnel.start(3333);
    announce(children[0]);
    await expect(starting).resolves.toBe(NAMED_URL);

    // Explicit restart replaces A with B...
    const restarted = tunnel.restart(3333);
    await flush();
    announce(children[1]);
    await expect(restarted).resolves.toBe(NAMED_URL);
    expect(children.length).toBe(2);

    // ...and A's exit arrives late (real child shutdown is asynchronous).
    children[0].emit("exit", 1, null);
    // B stays the current, live connector; no false disconnect, no extra C.
    expect(tunnel.status()).toMatchObject({ running: true, url: NAMED_URL });
    expect(events.filter((e) => e.startsWith("disconnect:")).length).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(children.length).toBe(2); // no respawn C
    await tunnel.stop();
    vi.useRealTimers();
  });

  it("future recovery still works after an explicit restart cancelled a pending one", async () => {
    vi.useFakeTimers();
    const { tunnel, children } = makeNamed();
    const starting = tunnel.start(3333);
    announce(children[0]);
    await expect(starting).resolves.toBe(NAMED_URL);

    // A dies: auto-restart timer pending (restarting = true)...
    children[0].emit("exit", 1, null);
    // ...but an explicit restart cancels it and connects B.
    const restarted = tunnel.restart(3333);
    await flush();
    announce(children[1]);
    await expect(restarted).resolves.toBe(NAMED_URL);

    // B now dies unexpectedly: auto-restart MUST still be able to run
    // (the cancelled pending recovery must not leave `restarting` latched).
    children[1].emit("exit", 1, null);
    await vi.advanceTimersByTimeAsync(900);
    expect(children.length).toBe(2);
    await vi.advanceTimersByTimeAsync(200);
    expect(children.length).toBe(3); // C auto-spawned
    announce(children[2]);
    await vi.advanceTimersByTimeAsync(0);
    expect(tunnel.status()).toMatchObject({ running: true, url: NAMED_URL });
    await tunnel.stop();
    vi.useRealTimers();
  });

  it("post-establishment child error triggers disconnect and auto-recovery", async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const { tunnel, children } = makeNamed({
      onDisconnect: (reason) => events.push(`disconnect:${reason}`),
      onReconnect: (url) => events.push(`reconnect:${url}`),
    });
    const starting = tunnel.start(3333);
    announce(children[0]);
    await expect(starting).resolves.toBe(NAMED_URL);

    // Established connector hits a runtime (spawn) error instead of exit.
    children[0].emit("error", new Error("spawn EACCES"));
    expect(tunnel.status()).toMatchObject({ running: false, url: null });
    expect(events[0]).toBe("disconnect:spawn EACCES");

    await vi.advanceTimersByTimeAsync(1_100);
    expect(children.length).toBe(2);
    announce(children[1]);
    await vi.advanceTimersByTimeAsync(0);
    expect(tunnel.status()).toMatchObject({ running: true, url: NAMED_URL });
    expect(tunnel.autoRestartCount()).toBe(1);
    await tunnel.stop();
    vi.useRealTimers();
  });

  it("stale registration output from a replaced child cannot forge or mask the new connector", async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const { tunnel, children } = makeNamed({
      onDisconnect: (reason) => events.push(`disconnect:${reason}`),
      onReconnect: (url) => events.push(`reconnect:${url}`),
    });
    const starting = tunnel.start(3333);
    announce(children[0]);
    await expect(starting).resolves.toBe(NAMED_URL);

    // Explicit restart replaces A with B; A's stderr then delivers a late,
    // buffered registration line after its replacement is already spawned.
    const restarted = tunnel.restart(3333);
    await flush();
    expect(children.length).toBe(2);
    announce(children[0]); // stale A registration line
    announce(children[1]); // B's real registration line

    await expect(restarted).resolves.toBe(NAMED_URL);
    expect(tunnel.status()).toMatchObject({ running: true, url: NAMED_URL });
    expect(events.filter((e) => e.startsWith("disconnect:")).length).toBe(0);
    expect(events.filter((e) => e.startsWith("reconnect:")).length).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(children.length).toBe(2); // no extra C
    await tunnel.stop();
    vi.useRealTimers();
  });

  it("stale error output from a replaced child cannot overwrite the current connector's lastError", async () => {
    vi.useFakeTimers();
    const { tunnel, children } = makeNamed();
    const starting = tunnel.start(3333);
    announce(children[0]);
    await expect(starting).resolves.toBe(NAMED_URL);

    const restarted = tunnel.restart(3333);
    await flush();
    expect(children.length).toBe(2);

    // A's late error line must be ignored; B is the current connector.
    children[0].stderr.write("ERR failed to connect to Cloudflare edge: stale connector\n");
    announce(children[1]);
    await expect(restarted).resolves.toBe(NAMED_URL);
    expect(tunnel.status().detail).toBeUndefined(); // stale ERR never recorded

    await tunnel.stop();
    vi.useRealTimers();
  });

  it("concurrent start() calls join a single in-flight spawn", async () => {
    vi.useFakeTimers();
    const { tunnel, children } = makeNamed();
    const first = tunnel.start(3333);
    const second = tunnel.start(3333); // must join, not spawn again
    announce(children[0]);
    await expect(first).resolves.toBe(NAMED_URL);
    await expect(second).resolves.toBe(NAMED_URL);
    expect(children.length).toBe(1); // one process spawn only
    await tunnel.stop();
    vi.useRealTimers();
  });

  it("stop() during a pending start cancels it and leaves no orphan connector", async () => {
    vi.useFakeTimers();
    const { tunnel, children } = makeNamed();
    const starting = tunnel.start(3333); // pending, never announced
    await flush();

    await tunnel.stop();
    await expect(starting).rejects.toThrow(/cancelled/i);
    expect(children[0].kill).toHaveBeenCalledWith("SIGTERM"); // no orphan cloudflared
    expect(tunnel.status()).toMatchObject({ running: false, url: null });

    // The dedup slot is released immediately: a fresh start works.
    const fresh = tunnel.start(3333);
    announce(children[1]);
    await expect(fresh).resolves.toBe(NAMED_URL);
    expect(children.length).toBe(2);
    await tunnel.stop();
    vi.useRealTimers();
  });

  it("a doctor-style start() during an in-flight auto-recovery joins it instead of spawning a second connector", async () => {
    vi.useFakeTimers();
    const { tunnel, children } = makeNamed();
    const starting = tunnel.start(3333);
    announce(children[0]);
    await expect(starting).resolves.toBe(NAMED_URL);

    // Established connector dies: auto-recovery spawns B after the 1s backoff.
    children[0].emit("exit", 1, null);
    await vi.advanceTimersByTimeAsync(1_100);
    expect(children.length).toBe(2); // B spawned by auto-recovery, still connecting

    // A concurrent doctor-style start() must join the pending B, not spawn C.
    const doctorStart = tunnel.start(3333);
    await vi.advanceTimersByTimeAsync(500);
    expect(children.length).toBe(2); // still only B

    announce(children[1]);
    await expect(doctorStart).resolves.toBe(NAMED_URL);
    expect(tunnel.status()).toMatchObject({ running: true, url: NAMED_URL });
    await tunnel.stop();
    vi.useRealTimers();
  });
});

describe("named hostname helpers", () => {
  it("builds a stable c2c-<project>.<zone> hostname", () => {
    expect(suggestedNamedHostname("Example.COM", "My App", "abcdef123456")).toBe("c2c-my-app.example.com");
  });

  it("falls back to the workspace id when the name is not ASCII", () => {
    expect(hostnameSlug("回声", "abcdef123456")).toBe("c2c-ws-abcdef12");
  });

  it("parses a typed domain", () => {
    expect(parseZoneInput("https://Example.com/")).toBe("example.com");
    expect(parseZoneInput("not a domain")).toBeNull();
  });
});

describe("cloudflared output parsers", () => {
  it("reads a tunnel list table", () => {
    const output = `
ID                                   NAME          CREATED
11111111-1111-1111-1111-111111111111 c2c-abc123    2026-08-30
`;
    expect(parseTunnelList(output)).toEqual([
      { id: "11111111-1111-1111-1111-111111111111", name: "c2c-abc123" },
    ]);
  });

  it("reads created-tunnel output", () => {
    expect(
      parseCreatedTunnel(
        "Created tunnel c2c-abc with id 22222222-2222-2222-2222-222222222222",
        "c2c-abc"
      )
    ).toEqual({ id: "22222222-2222-2222-2222-222222222222", name: "c2c-abc" });
  });

  it("treats an existing DNS route as success", () => {
    expect(isBenignRouteError("Failed to add route: record already exists")).toBe(true);
  });
});

describe("tunnel preference state", () => {
  it("asks once, then remembers a quick choice", () => {
    stateDirs.push(isolateStateDir());
    const unset = readTunnelState("ws1");
    expect(needsTunnelChoice(unset)).toBe(true);
    const saved = chooseQuickTunnel("ws1");
    expect(saved.preference).toBe("quick");
    expect(needsTunnelChoice(readTunnelState("ws1"))).toBe(false);
    expect(isNamedTunnelReady(saved)).toBe(false);
  });

  it("provisions a named hostname through the account adapter and stores it outside the project", () => {
    stateDirs.push(isolateStateDir());
    const account: CloudflaredAccount = {
      hasCert: () => true,
      login: async () => undefined,
      listTunnels: async () => [],
      createTunnel: async (name) => ({ id: "33333333-3333-3333-3333-333333333333", name }),
      routeDns: async () => undefined,
    };
    return provisionNamedTunnel({
      workspaceId: "abcdef123456",
      workspaceName: "Demo",
      zone: "example.com",
      account,
    }).then((result) => {
      expect(result.fallback).toBe(false);
      expect(result.state.preference).toBe("named");
      expect(result.state.hostname).toBe("c2c-demo.example.com");
      expect(result.state.tunnelName).toBe("c2c-abcdef123456");
      expect(isNamedTunnelReady(readTunnelState("abcdef123456"))).toBe(true);
    });
  });

  it("falls back to a temporary address when named provisioning fails", () => {
    stateDirs.push(isolateStateDir());
    const account: CloudflaredAccount = {
      hasCert: () => true,
      login: async () => undefined,
      listTunnels: async () => [],
      createTunnel: async () => {
        throw new Error("no zone");
      },
      routeDns: async () => undefined,
    };
    return provisionNamedTunnel({
      workspaceId: "ws2",
      workspaceName: "Demo",
      zone: "example.com",
      account,
    }).then((result) => {
      expect(result.fallback).toBe(true);
      expect(result.state.preference).toBe("quick");
      expect(result.userMessage).toMatch(/临时地址/);
    });
  });
});
