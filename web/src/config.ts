export const resolveApiBase = (): string => {
  if (typeof window === "undefined") {
    return "http://localhost:3000";
  }
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const configured = env?.VITE_API_BASE_URL;
  if (configured) {
    return configured;
  }
  const { protocol, hostname, port, origin } = window.location;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
  if (isLocalHost && port === "5173") {
    return `${protocol}//${hostname}:3000`;
  }
  return origin;
};

export const resolveWsUrl = (base: string): string => {
  const fallbackOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const url = new URL(base, fallbackOrigin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return url.toString();
};
