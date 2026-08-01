/**
 * The sealed envelope that crosses the relay.
 *
 * The relay is a mailbox on somebody else's computer. It has to know which
 * device a message is for, and it must not be able to read it — a schedule is a
 * list of what medication a named person takes and when they are alone in the
 * house with it.
 *
 *     {"v": 1, "rev": 7, "alg": "A256GCM", "iv": "<b64url, 12 bytes>", "ct": "<b64url>"}
 *
 * `rev` is outside the ciphertext because the relay has to compare it to answer
 * a long poll — "is there anything newer than revision 6" is the entire
 * protocol. It is *also* inside the authenticated data, which is the part that
 * matters: a relay that could renumber a revision could hold back today's
 * schedule and serve last week's under a higher number, and the device would
 * take it. Binding it into the AAD makes that fail to open rather than open
 * into something plausible.
 *
 * Mirrors `snapcare_dispenser/envelope.py`.
 */

import { b64url, unb64url } from './derive.ts';

export const ENVELOPE_VERSION = 1;
export const ALG = 'A256GCM';

/** 96 bits — what GCM is specified for and what WebCrypto's default expects. */
const IV_BYTES = 12;

/** Which direction a message travels. They are separate slots on the relay. */
export type Slot = 'desired' | 'reported';

export interface Envelope {
  v: number;
  rev: number;
  alg: string;
  iv: string;
  ct: string;
}

/**
 * Never says why it did not open, on purpose.
 *
 * Wrong key, wrong device, wrong revision, wrong slot and deliberate tampering
 * are all the same answer. Distinguishing them for the caller means
 * distinguishing them for anybody who can reach the endpoint that reports it.
 */
export class SealError extends Error {
  constructor(message = 'did not open') {
    super(message);
    this.name = 'SealError';
  }
}

const utf8 = new TextEncoder();
const decoder = new TextDecoder();

/**
 * What the ciphertext is bound to, and therefore cannot be moved away from.
 * Every field is one substitution somebody would otherwise be able to make by
 * editing the relay's disk:
 *
 *   the version  — an envelope from a future format, read by an old device
 *   the device   — one household's schedule delivered to another's dispenser
 *   the slot     — what the device *reported*, played back to it as a command
 *   the revision — last month's prescription, renumbered to look like today's
 */
export function aad(deviceId: string, slot: Slot, rev: number): Uint8Array {
  return utf8.encode(`snapcare/relay/v${ENVELOPE_VERSION}|${deviceId}|${slot}|${rev}`);
}

/** Wrap `payload` so only the holder of `key` can read it back. */
export async function seal(
  key: CryptoKey,
  deviceId: string,
  slot: Slot,
  rev: number,
  payload: unknown,
): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = utf8.encode(JSON.stringify(payload));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad(deviceId, slot, rev) },
    key,
    plaintext,
  );
  return {
    v: ENVELOPE_VERSION,
    rev,
    alg: ALG,
    iv: b64url(iv),
    ct: b64url(new Uint8Array(ct)),
  };
}

/**
 * Open an envelope, or throw `SealError`.
 *
 * The revision is read from the envelope and fed straight into the AAD, which
 * looks circular and is not: a forged `rev` produces an AAD that does not match
 * the one used to seal, and the open fails. That *is* the check — you can trust
 * `envelope.rev` precisely because it opened.
 */
export async function unseal<T = Record<string, unknown>>(
  key: CryptoKey,
  deviceId: string,
  slot: Slot,
  envelope: unknown,
): Promise<T> {
  if (!envelope || typeof envelope !== 'object') throw new SealError('not an envelope');
  const candidate = envelope as Partial<Envelope>;
  if (candidate.v !== ENVELOPE_VERSION || candidate.alg !== ALG) {
    throw new SealError('unrecognised envelope format');
  }

  let iv: Uint8Array;
  let ct: Uint8Array;
  let rev: number;
  try {
    rev = Number(candidate.rev);
    if (!Number.isInteger(rev)) throw new Error('rev');
    iv = unb64url(String(candidate.iv));
    ct = unb64url(String(candidate.ct));
  } catch {
    throw new SealError('malformed envelope');
  }
  if (iv.length !== IV_BYTES) throw new SealError('malformed envelope');

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aad(deviceId, slot, rev) },
      key,
      ct,
    );
  } catch {
    throw new SealError();
  }

  let opened: unknown;
  try {
    opened = JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new SealError('opened, but is not JSON');
  }
  if (!opened || typeof opened !== 'object' || Array.isArray(opened)) {
    throw new SealError('opened, but is not an object');
  }
  return opened as T;
}
