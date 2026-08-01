/**
 * Talking to a dispenser through the relay.
 *
 * The relay is a mailbox with a long poll. Two slots per device:
 *
 *     desired    the app writes, the dispenser reads   — what the schedule should be
 *     reported   the dispenser writes, the app reads   — what it is actually doing
 *
 * They are separate because they have different writers and different truths.
 * Merging them is how a device's own report of what it did gets played back to
 * it as an instruction.
 *
 * Everything crossing the relay is sealed (`envelope.ts`). The relay stores
 * ciphertext, revisions, sizes and timestamps, and is structurally incapable of
 * reading a schedule or a dose log — it is given the device id and the access
 * token, which are different HKDF branches from the box key.
 *
 * Mixed content does not apply here: the relay is HTTPS, so an HTTPS app can
 * `fetch` it normally. That is the whole reason this path exists alongside the
 * LAN one.
 */

import { deriveKeys, type DeviceKeys } from './derive.ts';
import { seal, unseal, type Envelope, type Slot } from './envelope.ts';
import { encodeWeekly } from './schedule.ts';
import type { DesiredSchedule, DeviceReport, MailboxMeta, WeeklySlot } from './types.ts';

/** A relay that answered, but not the way we hoped. */
export class RelayError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'RelayError';
  }
}

/**
 * Somebody else wrote a newer revision while you were editing.
 *
 * The loser is holding a stale copy of the schedule. Show them the newer one —
 * do **not** retry blind with a bumped number, which is exactly how an edit
 * made on a second phone silently disappears.
 */
export class RevisionConflictError extends RelayError {
  constructor(readonly currentRev: number, message: string) {
    super(message, 409);
    this.name = 'RevisionConflictError';
  }
}

export interface DispenserClientOptions {
  /** `https://snapcare-relay.fly.dev` — no trailing slash needed. */
  relayUrl: string;
  /** The ten-character code off the label. */
  claim: string;
  /** For tests, or for a runtime without a global `fetch`. */
  fetchImpl?: typeof fetch;
}

/**
 * One paired dispenser.
 *
 * Construct with `DispenserClient.pair(...)`, which does the key derivation
 * once — deriving on every call would be three HKDF passes per request for no
 * reason.
 */
export class DispenserClient {
  private constructor(
    private readonly relayUrl: string,
    private readonly keys: DeviceKeys,
    private readonly doFetch: typeof fetch,
  ) {}

  static async pair(options: DispenserClientOptions): Promise<DispenserClient> {
    const keys = await deriveKeys(options.claim);
    const base = options.relayUrl.replace(/\/+$/, '');
    const impl = options.fetchImpl ?? globalThis.fetch;
    if (!impl) throw new Error('no fetch available — pass fetchImpl');
    return new DispenserClient(base, keys, impl.bind(globalThis));
  }

  /** The relay's address for this device. Safe to store and to log. */
  get deviceId(): string {
    return this.keys.deviceId;
  }

  // ── the relay's own view ──────────────────────────────────────────────────

  /**
   * Revisions and timestamps — no plaintext. Read this **before writing**: you
   * do not own the revision counter, and `desired.rev + 1` is the only correct
   * next value.
   */
  async meta(): Promise<MailboxMeta> {
    const response = await this.request('GET', '');
    if (response.status === 404) {
      throw new RelayError('this device has never been seen by the relay', 404);
    }
    return (await response.json()) as MailboxMeta;
  }

  // ── writing a schedule ───────────────────────────────────────────────────

  /**
   * Publish a schedule. Returns the revision the relay now holds.
   *
   * Reads the current revision first, so the common case needs no ceremony
   * from the caller. A concurrent write still surfaces as
   * `RevisionConflictError` — re-read and show the newer schedule rather than
   * retrying, because the whole point of the check is that the retry would win
   * a race it should lose.
   */
  async setSchedule(schedule: DesiredSchedule | WeeklySlot[]): Promise<number> {
    const payload: DesiredSchedule = Array.isArray(schedule)
      ? { payload: encodeWeekly(schedule) }
      : schedule;

    if (!payload.payload && !payload.slots) {
      throw new Error('give it a payload or a slots array');
    }

    let currentRev = 0;
    try {
      const meta = await this.meta();
      currentRev = Number(meta.desired?.rev ?? 0);
    } catch (error) {
      // A device whose mailbox does not exist yet is not an error here: the
      // first write is what creates it. Anything else is.
      if (!(error instanceof RelayError) || error.status !== 404) throw error;
    }

    return this.publishAt(payload, currentRev + 1);
  }

  /** Publish at an exact revision, when you are managing the counter yourself. */
  async publishAt(schedule: DesiredSchedule, rev: number): Promise<number> {
    if (!Number.isInteger(rev) || rev < 1) throw new Error('rev must be an integer of 1 or more');

    const envelope = await seal(this.keys.boxKey, this.keys.deviceId, 'desired', rev, schedule);
    const response = await this.request('PUT', '/desired', { envelope });

    if (response.status === 409) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      const meta = await this.meta().catch(() => null);
      throw new RevisionConflictError(
        Number(meta?.desired?.rev ?? rev),
        body.error ?? 'somebody else wrote a newer schedule',
      );
    }
    await this.assertOk(response);
    const body = (await response.json()) as { rev: number };
    return body.rev;
  }

  /** What we last told the device to do. Null if nothing has been published. */
  async getSchedule(): Promise<{ rev: number; schedule: DesiredSchedule } | null> {
    const found = await this.read('desired', 0, 0);
    return found && { rev: found.rev, schedule: found.opened as DesiredSchedule };
  }

  // ── reading what the device says ─────────────────────────────────────────

  /** The device's latest report, or null if it has never published one. */
  async getReport(): Promise<{ rev: number; report: DeviceReport } | null> {
    const found = await this.read('reported', 0, 0);
    return found && { rev: found.rev, report: found.opened as DeviceReport };
  }

  /**
   * Wait for the device to say something new.
   *
   * `sinceRev` is the revision you already have. Resolves to null when the hold
   * expires with nothing new, which is the normal case and not an error —
   * reconnect. That loop is what makes a dose event appear in about a second.
   *
   * Treat a dropped connection as normal too: it happens whenever a phone locks
   * its screen. Reconnect with backoff.
   */
  async waitForReport(
    sinceRev: number,
    holdSeconds = 50,
    signal?: AbortSignal,
  ): Promise<{ rev: number; report: DeviceReport } | null> {
    const found = await this.read('reported', sinceRev, holdSeconds, signal);
    return found && { rev: found.rev, report: found.opened as DeviceReport };
  }

  /**
   * Has this device been heard from recently?
   *
   * Use the report's own timestamp rather than the word "connected". A
   * dispenser whose power has been pulled sends nothing and otherwise looks
   * identical to a healthy one — and "the dispenser has been unplugged since
   * Tuesday" is the single most useful thing a carer can be told.
   *
   * Be generous with the threshold: the device heartbeats on its own schedule,
   * and after a WiFi outage it republishes the instant the network returns
   * rather than at the end of a retry interval.
   */
  static isStale(report: DeviceReport, thresholdSeconds = 15 * 60, now = new Date()): boolean {
    const at = new Date(report.at);
    if (Number.isNaN(at.getTime())) return true;
    return (now.getTime() - at.getTime()) / 1000 > thresholdSeconds;
  }

  // ── plumbing ─────────────────────────────────────────────────────────────

  private async read(
    slot: Slot,
    since: number,
    hold: number,
    signal?: AbortSignal,
  ): Promise<{ rev: number; opened: unknown } | null> {
    const response = await this.request(
      'GET',
      `/${slot}?since=${since}&wait=${hold}`,
      undefined,
      signal,
    );

    // 204 is "you are up to date" — one branch, no body to parse. 404 is a
    // mailbox that does not exist yet, which for a read is the same answer.
    if (response.status === 204 || response.status === 404) return null;
    await this.assertOk(response);

    const body = (await response.json()) as { rev: number; envelope: Envelope };
    const opened = await unseal(this.keys.boxKey, this.keys.deviceId, slot, body.envelope);
    return { rev: body.rev, opened };
  }

  private request(
    method: string,
    suffix: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<Response> {
    return this.doFetch(`${this.relayUrl}/v1/devices/${this.keys.deviceId}${suffix}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.keys.accessToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  }

  private async assertOk(response: Response): Promise<void> {
    if (response.ok) return;
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new RelayError(body.error ?? `the relay answered ${response.status}`, response.status);
  }
}
