import type { InsertPosition } from "../lib/storage";

export enum ClientState {
  Disconnected = "DISCONNECTED",
  Connecting = "CONNECTING",
  Connected = "CONNECTED",
  Registered = "REGISTERED",
  Reconnecting = "RECONNECTING",
  Stopped = "STOPPED",
}

export const sessionPolicies = ["reuse_or_create", "reuse_only", "start_fresh"] as const;
export type SessionPolicy = (typeof sessionPolicies)[number];

export function isInsertPosition(t: unknown): t is InsertPosition {
  return t === "top" || t === "bottom" || t === "cursor";
}

export function mapPlacementToInsertPosition(
  placement: { type: InsertPosition } | null
): InsertPosition | null {
  if (!placement) return "cursor";
  return placement.type;
}

export function isSessionPolicy(sp: unknown): sp is SessionPolicy {
  return sessionPolicies.includes(sp as SessionPolicy);
}
