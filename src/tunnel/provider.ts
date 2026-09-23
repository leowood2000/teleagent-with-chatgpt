/**
 * Tunnel abstraction. Business logic never talks to a specific vendor;
 * it only sees this interface. V1 ships a Cloudflare Quick Tunnel provider,
 * but ngrok / Tailscale / custom providers can be added without touching
 * the bridge.
 */
/**
 * How the tunnel's public reachability was established.
 * - "public-verified": the public /health endpoint identified the bridge.
 * - "registered-only": cloudflared registered at the Cloudflare edge, but the
 *   public URL could not be fetched from this machine (common on networks
 *   where trycloudflare.com is slow or blocked). ChatGPT reaches the tunnel
 *   through Cloudflare's edge, so the final E2E gate is the Skill's
 *   workspace_info verification, not a local fetch.
 */
export type TunnelVerification = "public-verified" | "registered-only";

export interface TunnelStatus {
  running: boolean;
  url: string | null;
  provider: string;
  verification?: TunnelVerification | null;
  detail?: string;
}

export interface TunnelDoctorReport {
  provider: string;
  binaryFound: boolean;
  binaryPath: string | null;
  running: boolean;
  url: string | null;
  problems: string[];
}

export interface TunnelProvider {
  readonly name: string;
  /** Start the tunnel for a local port; resolves with the public URL. */
  start(localPort: number): Promise<string>;
  stop(): Promise<void>;
  restart(localPort: number): Promise<string>;
  status(): TunnelStatus;
  getPublicUrl(): string | null;
  doctor(): Promise<TunnelDoctorReport>;
}
