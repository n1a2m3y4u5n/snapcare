/**
 * The three keys behind a pairing code.
 *
 *     claim code ──HKDF──> device id      the relay's address for it   (relay sees this)
 *                ──HKDF──> access token   proves the right to it       (relay sees this)
 *                ──HKDF──> box key        opens the schedule           (relay never does)
 *
 * The second stage hangs off the *code*, not the board's serial number, because
 * the phone only ever sees ten characters off a sticker. The three purposes are
 * separated by HKDF's `info` argument, which is what lets the relay be given
 * two of them and remain structurally unable to derive the third.
 *
 * This must agree byte for byte with `provisioning.py` in the firmware. It is
 * pinned in both directions by `tests/vectors.json`, which is generated from
 * the Python side — if you change anything here, regenerate and run the tests
 * rather than reasoning about it. A disagreement between the two
 * implementations is a pairing that simply never works, with no error at
 * either end.
 */

import { normaliseClaim } from './claim.ts';

/**
 * Domain separation for this stage. Deliberately different from the salt used
 * to derive the code itself, so the code cannot be fed back into the first
 * stage to recover the board serial. Matches `_HKDF_SALT`.
 */
const HKDF_SALT = 'snapcare/pill-dispenser/cloud/v1';

const utf8 = new TextEncoder();

/** base64url, padding stripped — on both envelope fields and both key ids.
 *
 * Python's decoder is strict about padding where the browser's `atob` is not,
 * so a stray `=` here fails at the device end on about one message in four.
 * That ratio is why it is worth its own function: it looks like flakiness.
 */
export function b64url(raw: Uint8Array): string {
  let binary = '';
  for (const byte of raw) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The inverse, tolerant of the padding being absent. */
export function unb64url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** Thrown when a code is not ten characters of the printed alphabet. */
export class InvalidClaimError extends Error {
  constructor() {
    super('not a valid pairing code — it is ten characters from the printed alphabet');
    this.name = 'InvalidClaimError';
  }
}

async function hkdf(claim: string, info: string, bytes: number): Promise<Uint8Array> {
  const bare = normaliseClaim(claim);
  if (!bare) throw new InvalidClaimError();

  const ikm = await crypto.subtle.importKey('raw', utf8.encode(bare), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: utf8.encode(HKDF_SALT), info: utf8.encode(info) },
    ikm,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

/**
 * The relay's address for this device. 128 bits through a one-way function.
 *
 * Deliberately not the claim code itself: the relay writes this to its log on
 * every request, and a key that appears in a server log is not a key.
 */
export async function deviceId(claim: string): Promise<string> {
  return b64url(await hkdf(claim, 'device-id', 16));
}

/**
 * The bearer token. The relay stores only its SHA-256, so a stolen relay
 * database yields nothing replayable against the relay and nothing at all
 * about the box key.
 */
export async function accessToken(claim: string): Promise<string> {
  return b64url(await hkdf(claim, 'access', 32));
}

/**
 * The AES-256-GCM key the schedule is sealed with. This one never leaves the
 * phone and never leaves the device — it is the reason the relay can be a dumb
 * mailbox on somebody else's hardware and still not be a place where a
 * person's medication times are readable.
 */
export async function boxKey(claim: string): Promise<CryptoKey> {
  const raw = await hkdf(claim, 'box', 32);
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Everything derived from one code, in one round trip. */
export interface DeviceKeys {
  /** The ten-character code, normalised. Treat as a credential. */
  claim: string;
  deviceId: string;
  accessToken: string;
  boxKey: CryptoKey;
}

export async function deriveKeys(claim: string): Promise<DeviceKeys> {
  const bare = normaliseClaim(claim);
  if (!bare) throw new InvalidClaimError();
  const [id, token, key] = await Promise.all([
    deviceId(bare),
    accessToken(bare),
    boxKey(bare),
  ]);
  return { claim: bare, deviceId: id, accessToken: token, boxKey: key };
}
