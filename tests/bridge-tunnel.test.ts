import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import { startBridge, type Bridge } from "../src/bridge/server.js";
import type { TunnelLifecycleCallbacks, TunnelProvider, TunnelStatus, TunnelDoctorReport } from "../src/tunnel/provider.js";
import { cleanup, isolateStateDir, makeTmpDir, write } from "./helpers.js";

/**
 * Scriptable tunnel provider used to exercise the bridge's admin endpoints
 * and its publicBaseUrl synchronization against lifecycle events.
 */
class ScriptedTunnel implements TunnelProvider {
  readonly name = "scripted";
  private callbacks: TunnelLifecycleCallbacks = {};
  private url: string | null = null;
  restartCalls = 0;
  startCalls = 0;
  stopCalls = 0;

  setLifecycleCallbacks(callbacks: TunnelLifecycleCallbacks): void {
    this.callbacks = callbacks;
  }

  // Test helpers to emulate provider-side lifecycle events.
  simulateDisconnect(reason: string): void {
    this.url = null;
    this.callbacks.onDisconnect?.(reason);
  }

  simulateReconnect(url: string): void {
    this.url = url;
    this.callbacks.onReconnect?.(url);
  }

  async start(localPort: number): Promise<string> {
    this.startCalls += 1;
    this.url = `https://scripted.example.com`;
    return this.url;
  }

  async stop(): Promise<void> {
    this.stopCalls += 1;
    this.url = null;
  }

  async restart(localPort: number): Promise<string> {
    this.restartCalls += 1;
    return this.start(localPort);
  }

  status(): TunnelStatus {
    return {
      running: this.url !== null,
      url: this.url,
      provider: this.name,
    };
  }

  getPublicUrl(): string | null {
    return this.url;
  }

  async doctor(): Promise<TunnelDoctorReport> {
    return {
      provider: this.name,
      binaryFound: true,
      binaryPath: null,
      running: this.url !== null,
      url: this.url,
      problems: [],
    };
  }
}

const roots: string[] = [];
const bridges: Bridge[] = [];

function makeBridge(tunnel: ScriptedTunnel): Promise<Bridge> {
  isolateStateDir();
  const root = makeTmpDir("bridge-tunnel");
  roots.push(root);
  write(root, "marker.txt", "x");
  return startBridge({
    workspaceRoot: root,
    port: 0,
    persistRuntime: false,
    authStoreFile: path.join(makeTmpDir("auth"), "t.json"),
    tunnelProvider: tunnel,
  });
}

async function admin(bridge: Bridge, method: "GET" | "POST", route: string): Promise<unknown> {
  const response = await fetch(`http://127.0.0.1:${bridge.port}${route}`, {
    method,
    headers: { Authorization: `Bearer ${bridge.adminToken}` },
  });
  return response.json();
}

afterEach(async () => {
  while (bridges.length) await bridges.pop()!.close();
  while (roots.length) cleanup(roots.pop()!);
});

describe("bridge tunnel lifecycle sync", () => {
  it("POST /admin/tunnel/restart really restarts the provider and updates the public URL", async () => {
    const tunnel = new ScriptedTunnel();
    const bridge = await makeBridge(tunnel);
    bridges.push(bridge);

    const result = (await admin(bridge, "POST", "/admin/tunnel/restart")) as {
      url: string;
      manualRestarts: number;
    };
    expect(tunnel.restartCalls).toBe(1);
    expect(result.url).toBe("https://scripted.example.com");
    expect(result.manualRestarts).toBe(1);
    expect(bridge.getPublicBaseUrl()).toBe("https://scripted.example.com");

    const info = (await admin(bridge, "GET", "/admin/info")) as {
      publicUrl: string | null;
      manualTunnelRestarts: number;
    };
    expect(info.publicUrl).toBe("https://scripted.example.com");
    expect(info.manualTunnelRestarts).toBe(1);
  });

  it("an unexpected disconnect clears the public URL until reconnect restores it", async () => {
    const tunnel = new ScriptedTunnel();
    const bridge = await makeBridge(tunnel);
    bridges.push(bridge);

    await admin(bridge, "POST", "/admin/tunnel/start");
    expect(bridge.getPublicBaseUrl()).toBe("https://scripted.example.com");

    tunnel.simulateDisconnect("cloudflared exited with code 1");
    let info = (await admin(bridge, "GET", "/admin/info")) as { publicUrl: string | null };
    expect(info.publicUrl).toBeNull();
    expect(bridge.getPublicBaseUrl()).toBeNull();

    tunnel.simulateReconnect("https://scripted.example.com");
    info = (await admin(bridge, "GET", "/admin/info")) as { publicUrl: string | null };
    expect(info.publicUrl).toBe("https://scripted.example.com");
  });

  it("disconnect callbacks do not clobber an already-cleared URL", async () => {
    const tunnel = new ScriptedTunnel();
    const bridge = await makeBridge(tunnel);
    bridges.push(bridge);

    // Tunnel never started: publicBaseUrl is null; a disconnect event must
    // not throw or flip any state.
    tunnel.simulateDisconnect("late exit from a previous session");
    expect(bridge.getPublicBaseUrl()).toBeNull();
  });
});
