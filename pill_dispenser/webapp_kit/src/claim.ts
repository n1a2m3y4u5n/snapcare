/**
 * The pairing code printed on the dispenser's label.
 *
 * Ten characters out of a deliberately reduced alphabet — no O, I, L, 0 or 1,
 * because somebody is going to read this off a sticker and type it. The code is
 * derived from the board's SoC serial, so it is permanent: it survives a
 * reimage, and it differs on every board.
 *
 * Holding this code is equivalent to holding the device. Everything the cloud
 * path needs is derived from it (see `derive.ts`), and nothing else is ever
 * checked — there is no account and no password, because there is nothing
 * either could establish that the sticker does not already.
 */

/** No O, I, L, 0 or 1. Matches `_SSID_ALPHABET` in `provisioning.py`. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Ten characters, always. Matches `_CLAIM_LEN`. */
export const CLAIM_LENGTH = 10;

/** Printed in two groups of five: `6V9F5-9QK67`. Matches `_CLAIM_GROUP`. */
const GROUP = 5;

/**
 * Reduce whatever the person typed to the ten characters the key is derived
 * from, or `''` if it is not a valid code.
 *
 * **It never pads and never truncates.** That is the whole reason this is a
 * function rather than an inline `.toUpperCase()`. A code with one character
 * missing would otherwise derive a perfectly valid key for a mailbox that does
 * not exist, and the only symptom is a dispenser that looks like it has been
 * unplugged — no error, at either end, ever. Better to refuse it here while
 * somebody is still looking at the field they typed it into.
 */
export function normaliseClaim(code: string): string {
  let kept = '';
  for (const character of code.toUpperCase()) {
    if (ALPHABET.includes(character)) kept += character;
  }
  return kept.length === CLAIM_LENGTH ? kept : '';
}

/** True if this is a code the device could actually have printed. */
export function isValidClaim(code: string): boolean {
  return normaliseClaim(code) !== '';
}

/**
 * The form to *show* a person: `6V9F5-9QK67`.
 *
 * Display only. Never derive from this — the hyphen is not part of the key
 * material, and `normaliseClaim` is what strips it.
 */
export function formatClaim(code: string): string {
  const bare = normaliseClaim(code);
  if (!bare) return '';
  const groups: string[] = [];
  for (let i = 0; i < bare.length; i += GROUP) groups.push(bare.slice(i, i + GROUP));
  return groups.join('-');
}

/**
 * Pull the code out of a pairing URL — `https://relay.example/pair#6V9F59QK67`.
 *
 * The code is in the **fragment**, which browsers never send to the server. So
 * it reaches this function and reaches neither the relay, its access log, nor
 * any proxy in between. Keep that property if you build your own pairing page:
 * moving the code to a query parameter would put a medical device's write key
 * into somebody's HTTP logs.
 */
export function claimFromPairUrl(url: string): string {
  const hash = url.indexOf('#');
  return hash === -1 ? '' : normaliseClaim(url.slice(hash + 1));
}
