export const PORT = {
  KEEPALIVE: "promptive-keepalive",
} as const;

export type PortName = (typeof PORT)[keyof typeof PORT];
