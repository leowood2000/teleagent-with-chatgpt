import { spawn, type ChildProcess } from "node:child_process";
import readline from "node:readline";
import type { Logger } from "../logger/index.js";
import { nullLogger } from "../logger/index.js";
import { findBinary } from "./detect.js";
import { tunnelProtocolArgs } from "./protocol.js";
import type {
  TunnelDoctorReport,
  TunnelLifecycleCallbacks,
  TunnelProvider,
  TunnelStatus,
} from "./provider.js";

const CONNECTED_RE = /registered tunnel connection/i;
const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export type SpawnImpl = typeof spawn;

export interface CloudflaredNamedTunnelOptions {
  tunnelName: string;
  hostname: string;
  logger?: Logger;
  binaryOverride?: string;
  startTimeoutMs?: number;
  /** Test injection for the cloudflared spawn. */
  spawnImpl?: SpawnImpl;
  /** Called when an established tunnel disconnects unexpectedly. */
  onDisconnect?: (reason: string) => void;
  /** Called when an automatic restart succeeds (same public URL). */
  onReconnect?: (url: string) => void;
  /** Restart cloudflared automatically after an unexpected exit. Default true. */
  autoRestart?: boolean;
  /** Cap for the exponential restart backoff. Default 60s. */
  maxRestartDelayMs?: number;
}

export function normalizeNamedTunnelHostname(hostname: string): string {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!HOSTNAME_RE.test(normalized)) {
    throw new Error(`Invalid named tunnel hostname: ${hostname}`);
  }
  return normalized;
}

/**
 * Locally-managed Cloudflare named tunnel.
 *
 * The tunnel object and its DNS route are provisioned once with cloudflared.
 * This provider only starts and monitors the connector process, so the public
 * URL remains stable across bridge restarts. When the connector exits after
 * being established, the provider restarts it automatically with exponential
 * backoff (unless stopped deliberately) and reports lifecycle changes through
 * the onDisconnect / onReconnect callbacks.
 */
export class CloudflaredNamedTunnel implements TunnelProvider {
  readonly name = "cloudflare-named";
  private readonly tunnelName: string;
  private readonly hostname: string;
  private readonly logger: Logger;
  private readonly binaryOverride?: string;
  private readonly startTimeoutMs: number;
  private readonly spawnImpl: SpawnImpl;
  private onDisconnect?: (reason: string) => void;
  private onReconnect?: (url: string) => void;
  private readonly autoRestart: boolean;
  private readonly maxRestartDelayMs: number;
  private child: ChildProcess | null = null;
  private connected = false;
  private lastError: string | null = null;
  private lastPort: number | null = null;
  private deliberateStop = false;
  private restarting = false;
  private restartAttempts = 0;
  private autoRestartTotal = 0;
  private restartTimer: NodeJS.Timeout | null = null;
  /** In-flight start(): concurrent callers join this promise (no double spawn). */
  private starting: Promise<string> | null = null;
  /** Cancels the in-flight start() when stop() runs before establishment. */
  private cancelStart: (() => void) | null = null;

  constructor(opts: CloudflaredNamedTunnelOptions) {
    const tunnelName = opts.tunnelName.trim();
    if (!tunnelName || tunnelName.length > 128) {
      throw new Error("Named tunnel name must be between 1 and 128 characters");
    }
    this.tunnelName = tunnelName;
    this.hostname = normalizeNamedTunnelHostname(opts.hostname);
    this.logger = opts.logger ?? nullLogger;
    this.binaryOverride = opts.binaryOverride;
    this.startTimeoutMs = opts.startTimeoutMs ?? 90_000;
    this.spawnImpl = opts.spawnImpl ?? spawn;
    this.onDisconnect = opts.onDisconnect;
    this.onReconnect = opts.onReconnect;
    this.autoRestart = opts.autoRestart ?? true;
    this.maxRestartDelayMs = opts.maxRestartDelayMs ?? 60_000;
  }

  private binary(): string | null {
    return this.binaryOverride ?? findBinary("cloudflared");
  }

  /** Replace the lifecycle callbacks (used by the bridge after injection). */
  setLifecycleCallbacks(callbacks: TunnelLifecycleCallbacks): void {
    this.onDisconnect = callbacks.onDisconnect;
    this.onReconnect = callbacks.onReconnect;
  }

  private publicUrl(): string {
    return `https://${this.hostname}`;
  }

  async start(localPort: number): Promise<string> {
    if (this.child && this.connected) return this.publicUrl();
    // Deduplicate concurrent callers (auto-recovery, doctor --fix, admin
    // endpoints): join the in-flight start instead of spawning a second
    // connector that would replace this.child mid-handshake.
    if (this.starting) return this.starting;
    const bin = this.binary();
    if (!bin) {
      throw new Error(
        "cloudflared is not installed. Install it (e.g. `brew install cloudflared`) and retry."
      );
    }
    this.lastPort = localPort;
    this.deliberateStop = false;

    const pending = this.startProcess(bin, localPort);
    this.starting = pending;
    try {
      return await pending;
    } finally {
      // Only clear if no newer start replaced us while we were pending.
      if (this.starting === pending) {
        this.starting = null;
        this.cancelStart = null;
      }
    }
  }

  private startProcess(bin: string, localPort: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = this.spawnImpl(
        bin,
        [
          "tunnel",
          "--no-autoupdate",
          "--url",
          `http://127.0.0.1:${localPort}`,
          ...tunnelProtocolArgs(),
          "run",
          this.tunnelName,
        ],
        { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
      );
      this.child = child;
      this.connected = false;
      this.lastError = null;
      let settled = false;
      // Per-child establishment flag: registration detection, the start
      // timeout, and pre/post-establishment death classification all read
      // this local state so a stale sibling can never forge or mask it.
      let established = false;

      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        fn();
      };
      const timeout = setTimeout(() => {
        if (!established) {
          this.lastError = "Named tunnel start timed out";
          child.kill("SIGTERM");
          finish(() => reject(new Error(this.lastError ?? "Named tunnel start timed out")));
        }
      }, this.startTimeoutMs);

      // Identity guard: only react to events from the current child. A
      // stopped child can deliver late exit/error/output lines after a
      // replacement has already been spawned (explicit restart, or
      // auto-recovery); those stale events must not clear or forge the
      // replacement's state, skip its registration line, or schedule
      // extra restarts.
      const isCurrent = (): boolean => this.child === child;

      // A deliberate stop() while this start is still pending must not leave
      // the promise (and the child) dangling; reject it so callers and the
      // dedup slot are released. The child itself is killed by stop().
      this.cancelStart = (): void => {
        if (settled) return;
        finish(() => reject(new Error("Named tunnel start was cancelled by stop()")));
      };

      const scan = (stream: NodeJS.ReadableStream): void => {
        const rl = readline.createInterface({ input: stream });
        rl.on("line", (line) => {
          if (!isCurrent()) return; // stale output from a replaced child
          if (CONNECTED_RE.test(line) && !established) {
            established = true;
            this.connected = true;
            const url = this.publicUrl();
            this.logger.info(`Named tunnel established: ${url}`);
            finish(() => resolve(url));
          }
          if (/\b(error|failed|fatal)\b/i.test(line)) {
            this.lastError = line.slice(0, 400);
            this.logger.debug(`cloudflared: ${line.slice(0, 400)}`);
          }
        });
      };
      if (child.stdout) scan(child.stdout);
      if (child.stderr) scan(child.stderr);

      const handleUnexpectedDeath = (reason: string): void => {
        if (!isCurrent()) return;
        const wasStarting = !established;
        this.child = null;
        this.connected = false;
        if (wasStarting) {
          this.logger.warn(`cloudflared named tunnel died while starting: ${reason}`);
          finish(() =>
            reject(
              new Error(
                `cloudflared died before establishing the named tunnel (${reason})${
                  this.lastError ? `: ${this.lastError}` : ""
                }`
              )
            )
          );
          return;
        }
        // The tunnel was established, then the connector died. Report and
        // (unless this was a deliberate stop) schedule an automatic restart.
        this.logger.warn(`Named tunnel disconnected: ${reason}`);
        this.onDisconnect?.(reason);
        if (this.autoRestart && !this.deliberateStop && this.lastPort !== null) {
          this.scheduleRestart();
        }
      };

      child.on("error", (error) => {
        if (!isCurrent()) return; // stale event from a replaced child
        const wasEstablished = established;
        this.child = null;
        this.connected = false;
        if (wasEstablished) {
          // Established connector hit a runtime error (e.g. spawn failure on
          // restart): follow the same disconnect/recovery path as exit.
          this.logger.warn(`Named tunnel disconnected: ${error.message}`);
          this.onDisconnect?.(error.message);
          if (this.autoRestart && !this.deliberateStop && this.lastPort !== null) {
            this.scheduleRestart();
          }
          return;
        }
        finish(() => reject(error));
      });
      child.on("exit", (code) => {
        // Full reason string: onDisconnect consumers report this verbatim.
        handleUnexpectedDeath(`cloudflared exited with code ${code}`);
      });
    });
  }

  private scheduleRestart(): void {
    if (this.restarting) return;
    this.restarting = true;
    this.restartAttempts += 1;
    const delay = Math.min(1_000 * 2 ** (this.restartAttempts - 1), this.maxRestartDelayMs);
    this.logger.info(
      `Auto-restarting cloudflared in ${delay}ms (attempt ${this.restartAttempts}, ` +
        `backoff capped at ${this.maxRestartDelayMs}ms)`
    );
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.deliberateStop) {
        this.restarting = false;
        return;
      }
      // A restart may have succeeded through another path (e.g. explicit
      // restart()) while this timer was pending; do not resurrect a second
      // connector or emit a duplicate reconnect event.
      if (this.child && this.connected) {
        this.restarting = false;
        this.restartAttempts = 0;
        return;
      }
      const port = this.lastPort;
      if (port === null) {
        this.restarting = false;
        return;
      }
      this.start(port)
        .then((url) => {
          this.restartAttempts = 0;
          this.restarting = false;
          this.autoRestartTotal += 1;
          this.logger.info(`Named tunnel auto-restart succeeded: ${url}`);
          this.onReconnect?.(url);
        })
        .catch((error: Error) => {
          this.restarting = false;
          this.logger.error(`Named tunnel auto-restart failed: ${error.message}`);
          this.scheduleRestart();
        });
    }, delay);
  }

  async stop(): Promise<void> {
    this.deliberateStop = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    // A cancelled pending recovery must not block future auto-restarts:
    // scheduleRestart() no-ops while `restarting` is true, so reset it here
    // alongside the timer.
    this.restarting = false;
    // A deliberate stop during a pending start must cancel that start (its
    // promise would otherwise hang: the child's exit event is identity-
    // guarded, so nothing would ever settle it) and release the dedup slot
    // immediately instead of relying on microtask ordering.
    if (this.cancelStart) {
      const cancel = this.cancelStart;
      this.cancelStart = null;
      cancel();
    }
    this.starting = null;
    if (this.child) {
      this.child.kill("SIGTERM");
      this.child = null;
    }
    this.connected = false;
  }

  async restart(localPort: number): Promise<string> {
    this.lastPort = localPort;
    await this.stop();
    // stop() marks the stop deliberate; an explicit restart must run.
    this.deliberateStop = false;
    this.restartAttempts = 0;
    return this.start(localPort);
  }

  status(): TunnelStatus {
    return {
      running: this.child !== null && this.connected,
      url: this.connected ? this.publicUrl() : null,
      provider: this.name,
      detail: this.lastError ?? undefined,
    };
  }

  getPublicUrl(): string | null {
    return this.connected ? this.publicUrl() : null;
  }

  /** Number of consecutive auto-restart attempts since the last success. */
  restartCount(): number {
    return this.restartAttempts;
  }

  /** Total number of successful automatic recoveries since bridge start. */
  autoRestartCount(): number {
    return this.autoRestartTotal;
  }

  async doctor(): Promise<TunnelDoctorReport> {
    const bin = this.binary();
    const problems: string[] = [];
    if (!bin) problems.push("cloudflared binary not found");
    if (bin && !this.child) problems.push("named tunnel process not running");
    if (this.child && !this.connected) problems.push("named tunnel is not connected yet");
    return {
      provider: this.name,
      binaryFound: bin !== null,
      binaryPath: bin,
      running: this.child !== null && this.connected,
      url: this.connected ? this.publicUrl() : null,
      problems,
    };
  }
}
