const net = require("node:net");

const TRUST_PROXY_SCOPES = new Set(["loopback", "linklocal", "uniquelocal"]);

function getRequestAddressInfo(request, config = {}) {
  const remoteAddress = request.socket && request.socket.remoteAddress;
  const forwardedFor = getHeaderValue(request.headers, "x-forwarded-for");
  const forwardedProto = getHeaderValue(request.headers, "x-forwarded-proto");
  const realIp = getHeaderValue(request.headers, "x-real-ip");
  const trustProxy = config.trustProxy || { enabled: false, scopes: [] };
  const normalizedRemoteAddress = normalizeIp(remoteAddress);
  const isTrustedProxy = isTrustedProxyPeer(normalizedRemoteAddress, trustProxy);
  const clientIp = isTrustedProxy
    ? getForwardedClientIp(forwardedFor) || getUsableIp(realIp) || normalizedRemoteAddress
    : normalizedRemoteAddress;

  return {
    remoteAddress,
    clientIp,
    forwardedFor,
    forwardedProto,
    isTrustedProxy
  };
}

function parseTrustProxy(value) {
  if (value == null || String(value).trim() === "") {
    return {
      enabled: false,
      scopes: []
    };
  }

  const normalizedValue = String(value).trim().toLowerCase();

  if (normalizedValue === "false") {
    return {
      enabled: false,
      scopes: []
    };
  }

  if (normalizedValue === "true") {
    return {
      enabled: true,
      scopes: ["all"]
    };
  }

  const scopes = normalizedValue
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

  if (scopes.length === 0 || scopes.some((scope) => !TRUST_PROXY_SCOPES.has(scope))) {
    throw new Error(`Invalid TRUST_PROXY value: ${value}`);
  }

  return {
    enabled: true,
    scopes
  };
}

function getForwardedClientIp(forwardedFor) {
  if (!forwardedFor) {
    return undefined;
  }

  const candidates = forwardedFor
    .split(",")
    .map((value) => getUsableIp(value))
    .filter(Boolean);

  return candidates.find(isPublicIp) || candidates[0];
}

function getUsableIp(value) {
  const normalized = normalizeIp(value);
  return normalized && net.isIP(normalized) ? normalized : undefined;
}

function getHeaderValue(headers, name) {
  const value = headers && headers[name];

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return typeof value === "string" ? value : undefined;
}

function normalizeIp(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const mappedIpv4 = trimmed.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mappedIpv4) {
    return mappedIpv4[1];
  }

  return trimmed;
}

function isTrustedProxyPeer(ip, trustProxy) {
  if (!trustProxy.enabled || !ip) {
    return false;
  }

  if (trustProxy.scopes.includes("all")) {
    return true;
  }

  return trustProxy.scopes.some((scope) => matchesScope(ip, scope));
}

function isPublicIp(ip) {
  return net.isIP(ip) !== 0
    && !matchesScope(ip, "loopback")
    && !matchesScope(ip, "linklocal")
    && !matchesScope(ip, "uniquelocal");
}

function matchesScope(ip, scope) {
  const family = net.isIP(ip);

  if (family === 4) {
    return matchesIpv4Scope(ip, scope);
  }

  if (family === 6) {
    return matchesIpv6Scope(ip.toLowerCase(), scope);
  }

  return false;
}

function matchesIpv4Scope(ip, scope) {
  const parts = ip.split(".").map(Number);

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  if (scope === "loopback") {
    return parts[0] === 127;
  }

  if (scope === "linklocal") {
    return parts[0] === 169 && parts[1] === 254;
  }

  if (scope === "uniquelocal") {
    return parts[0] === 10
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168)
      || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
  }

  return false;
}

function matchesIpv6Scope(ip, scope) {
  if (scope === "loopback") {
    return ip === "::1";
  }

  if (scope === "linklocal") {
    return ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb");
  }

  if (scope === "uniquelocal") {
    return ip.startsWith("fc") || ip.startsWith("fd");
  }

  return false;
}

module.exports = {
  getRequestAddressInfo,
  parseTrustProxy
};
