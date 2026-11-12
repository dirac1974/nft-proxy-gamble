import { getAddress } from "ethers";

// Minimal EIP-4361 (Sign-In with Ethereum) message formatting + parsing.
// The server only ever verifies messages it issued itself (stored verbatim in
// AuthNonce), so parsing is used to locate the nonce and to sanity-check fields;
// the byte-for-byte comparison against the stored message is the real check.

export interface SiweFields {
  domain: string;
  address: string; // EIP-55 checksummed
  statement?: string;
  uri: string;
  version: "1";
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
}

export const SIWE_STATEMENT = "Sign in to NFT Proxy Gamble. This request will not trigger a blockchain transaction or cost any gas.";

export function formatSiweMessage(f: SiweFields): string {
  const lines = [
    `${f.domain} wants you to sign in with your Ethereum account:`,
    f.address,
    "",
  ];
  if (f.statement) lines.push(f.statement, "");
  lines.push(
    `URI: ${f.uri}`,
    `Version: ${f.version}`,
    `Chain ID: ${f.chainId}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issuedAt}`,
  );
  if (f.expirationTime) lines.push(`Expiration Time: ${f.expirationTime}`);
  return lines.join("\n");
}

const HEADER_RE = /^(?<domain>[^\s]+) wants you to sign in with your Ethereum account:$/;
const FIELD_RE = /^(URI|Version|Chain ID|Nonce|Issued At|Expiration Time|Not Before|Request ID): (.+)$/;

export function parseSiweMessage(message: string): SiweFields | null {
  const lines = message.split("\n");
  if (lines.length < 8) return null;
  const header = HEADER_RE.exec(lines[0]);
  if (!header?.groups) return null;
  let address: string;
  try {
    if (!/^0x[0-9a-fA-F]{40}$/.test(lines[1])) return null;
    address = getAddress(lines[1]);
    if (address !== lines[1]) return null; // must be EIP-55 checksummed
  } catch {
    return null;
  }
  if (lines[2] !== "") return null;

  let i = 3;
  let statement: string | undefined;
  if (!FIELD_RE.test(lines[i] ?? "")) {
    statement = lines[i];
    if (lines[i + 1] !== "") return null;
    i += 2;
  }
  const fields = new Map<string, string>();
  for (; i < lines.length; i++) {
    const m = FIELD_RE.exec(lines[i]);
    if (!m || fields.has(m[1])) return null;
    fields.set(m[1], m[2]);
  }
  const uri = fields.get("URI");
  const version = fields.get("Version");
  const chainId = Number(fields.get("Chain ID"));
  const nonce = fields.get("Nonce");
  const issuedAt = fields.get("Issued At");
  if (!uri || version !== "1" || !Number.isInteger(chainId) || chainId <= 0 || !nonce || !issuedAt) return null;
  if (!/^[A-Za-z0-9]{8,}$/.test(nonce)) return null;
  return {
    domain: header.groups.domain,
    address,
    statement,
    uri,
    version: "1",
    chainId,
    nonce,
    issuedAt,
    expirationTime: fields.get("Expiration Time"),
  };
}
