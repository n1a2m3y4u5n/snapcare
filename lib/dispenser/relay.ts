/**
 * Talking to a dispenser through the relay.
 *
 * The relay is a mailbox with a long poll. Three slots per device:
 *
 *     desired    the app writes, the dispenser reads   — what the schedule should be
 *     reported   the dispenser writes, the app reads   — what it is actually doing
 *     command    the app writes, the dispenser reads   — release the dose, now
 *
 * `desired` and `reported` are separate because they have different writers and
 * different truths: merging them is how a device's own report of what it did
 * gets played back to it as an instruction.
 *
 * `command` is separate from `desired` for a different reason. A schedule is a
 * *state* — true until it is edited, and a device reconnecting after a week
 * should adopt the newest one it finds. A release is an *act*, true for one hour
 * on one morning, and a device that treated it the same way would drop a pill
 * into an empty room the moment its connection came back.
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
import { encodeWeekly, parseHhmm } from './schedule.ts';
import type {
  DesiredSchedule,
  DeviceReport,
  MailboxMeta,
  ReleaseCommand,
  DeviceCommand,
  WeeklySlot,
} from './types.ts';

/*
 * 아래 세 생성자는 **파라미터 프로퍼티를 쓰지 않는다** (`constructor(readonly x: T)`).
 *
 * 원본 키트는 그것을 썼고, 그래서 `node --test --experimental-strip-types` 아래에서
 * 모듈을 읽는 순간 죽는다 — 타입만 지우는 방식은 값 생성 문법을 만들어 내지 못한다
 * (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX). 키트 자신의 Makefile 도 같은 명령을 쓰므로
 * `make -C pill_dispenser/webapp_kit test` 도 같은 자리에서 죽는다. 즉 이 키트를
 * 믿을 만하게 만드는 근거인 **펌웨어 생성 골든 벡터 시험이 한 번도 돈 적이 없다.**
 *
 * 필드로 풀어 쓰면 동작은 같고 시험이 돈다. 옮겨 적은 것 중 이것만 바꿨다.
 */

/** A relay that answered, but not the way we hoped. */
export class RelayError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
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
  readonly currentRev: number;

  constructor(currentRev: number, message: string) {
    super(message, 409);
    this.currentRev = currentRev;
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
  private readonly relayUrl: string;
  private readonly keys: DeviceKeys;
  private readonly doFetch: typeof fetch;

  private constructor(relayUrl: string, keys: DeviceKeys, doFetch: typeof fetch) {
    this.relayUrl = relayUrl;
    this.keys = keys;
    this.doFetch = doFetch;
  }

  static async pair(options: DispenserClientOptions): Promise<DispenserClient> {
    const keys = await deriveKeys(options.claim);
    const base = options.relayUrl.replace(/\/+$/, '');
    const impl = options.fetchImpl ?? globalThis.fetch;
    if (!impl) throw new Error('no fetch available — pass fetchImpl');
    return new DispenserClient(base, keys, impl.bind(globalThis));
  }

  /**
   * 이미 파생해 둔 열쇠로 다시 붙는다 — **페어링 코드 없이.**
   *
   * 원본 키트에는 `pair()` 뿐이라, 다시 붙으려면 코드를 어딘가 들고 있어야 한다.
   * 그 코드는 의료기기에 일정을 쓰는 권한이고, 문자열이라 우리 출처에서 스크립트를
   * 돌릴 수 있는 무엇이든 읽어 갈 수 있다.
   *
   * 파생 결과만 남기면 상자 열쇠는 `extractable: false` 인 CryptoKey 로 IndexedDB 에
   * 들어가 **우리 코드조차 값을 읽지 못한다**(deviceKey.ts 와 같은 자세). 기기 id 와
   * 접근 토큰은 주소와 헤더라 문자열로 남을 수밖에 없지만, 그 둘만으로는 봉투를 만들
   * 수 없다 — 릴레이에 쓰레기를 넣을 수는 있어도 기기가 열지 못해 무시한다.
   *
   * `claim` 은 파생이 끝나면 이 클래스가 다시 보지 않으므로 빈 문자열로 둔다.
   */
  static fromKeys(options: {
    relayUrl: string;
    keys: Omit<DeviceKeys, 'claim'>;
    fetchImpl?: typeof fetch;
  }): DispenserClient {
    const impl = options.fetchImpl ?? globalThis.fetch;
    if (!impl) throw new Error('no fetch available — pass fetchImpl');
    return new DispenserClient(
      options.relayUrl.replace(/\/+$/, ''),
      { claim: '', ...options.keys },
      impl.bind(globalThis),
    );
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

  // ── releasing a dose ─────────────────────────────────────────────────────

  /**
   * Open the tray, now. This is what the release button sends when the phone
   * cannot reach the device over the LAN.
   *
   * **The device does not dispense on a timer.** At a dose's scheduled minute it
   * lights up, chirps, and puts the dose on `status.awaitingRelease` — and
   * opens nothing. This is what opens it, and if nobody sends it inside the
   * grace window the tray stays shut and the dose is recorded missed.
   *
   * With no arguments it releases everything currently due, which is what a
   * main-screen button means: two trays owed at 08:00 are two medications for
   * 08:00, and making somebody tap twice is how the second gets forgotten. Pass
   * `tray` and `at` to name one dose, which is what a notification about a
   * specific dose should do.
   *
   * ```ts
   * await client.release();                          // everything due
   * await client.release({ tray: 1, at: '0800' });    // one dose
   * ```
   *
   * Returns the revision the relay now holds. **It does not tell you whether a
   * pill came out** — the relay is a mailbox and cannot know. Watch
   * `awaitingRelease` empty out, or the dose appear in `report.events`, through
   * {@link waitForReport}.
   *
   * A release that arrives after its dose expired moves nothing: the device acts
   * only on a dose it is currently offering. So this is safe to send from a
   * stale notification, and you still want to stop *offering* the button at
   * `expiresAt` — a control that silently does nothing sends somebody away
   * believing they have their medication.
   */
  async release(dose?: { tray?: number; at?: string }): Promise<number> {
    const command: ReleaseCommand = { action: 'release' };
    if (dose?.tray !== undefined) command.tray = dose.tray;
    if (dose?.at !== undefined) {
      const minutes = parseHhmm(dose.at);
      if (minutes === null) throw new Error(`"${dose.at}" is not an HHMM time`);
      command.minutes = minutes;
    }
    return this.command(command);
  }

  /**
   * Open a tray now, whatever the schedule says.
   *
   * Different from {@link release}, and the difference is the whole point.
   * `release` asks for a dose that is **owed**, and a bench with no prescription
   * loaded has none — so it is no use to somebody who has just assembled a
   * machine and wants to know whether tray 3 turns. This asks the other
   * question: *does this thing work.*
   *
   * It does not touch the scheduler, so checking the machine cannot cancel a
   * real dose. What comes out is still recorded, marked `manual`, because
   * something did leave the hopper.
   */
  async drop(tray: number): Promise<number> {
    return this.command({ action: 'drop', tray });
  }

  /**
   * Make this tray's dose due **now**, for a demonstration.
   *
   * Not a fake. The device runs the same code a real scheduled minute runs, so
   * the buzzer, the screen, the phone's alert, the release button, the servo and
   * the record are all the ordinary ones. Nothing here exists only for a demo,
   * which is the only way a demonstration is worth watching.
   *
   * Use {@link release} to complete it, exactly as a person would.
   */
  async ringNow(tray: number): Promise<number> {
    return this.command({ action: 'due', tray });
  }

  /** Sound the buzzer. Moves nothing — it answers "is this the right box". */
  async beep(): Promise<number> {
    return this.command({ action: 'beep' });
  }

  /**
   * Tell the box somebody has claimed it. Moves nothing and makes no sound.
   *
   * Pairing happens entirely inside this app — the keys come off a printed code
   * and nothing is announced — so the device cannot observe it, and until this
   * existed it went on showing a "pair with me" QR to a phone that already had.
   * One sealed byte is the whole fix: only the holder of the code can produce
   * it, so receiving it *is* the evidence.
   */
  async hello(): Promise<number> {
    return this.command({ action: 'hello' });
  }

  /**
   * Tell the box nobody has it any more. The other half of {@link hello}.
   *
   * Must be sent **before** the keys are thrown away — after that there is
   * nothing left to seal an envelope with. Without it the box is orphaned:
   * claimed by a phone that has forgotten it, and therefore never showing its
   * pairing code to the next person who stands in front of it.
   */
  /**
   * 짝짓기 QR 을 잠깐 띄우라고 한다. 짝은 그대로다 — 화면만 바뀐다.
   *
   * 발표에서 첫 걸음(QR 한 장으로 폰과 잇기)을 보이려고 있다. 왜 짝을 풀지 않고
   * 이 길로 가는지는 `ShowPairingCommand` 에 적었다.
   */
  async showPairing(seconds?: number): Promise<number> {
    return this.command(seconds ? { action: 'show_pairing', seconds } : { action: 'show_pairing' });
  }

  /**
   * Take the pairing screen back down, without unpairing.
   *
   * `showPairing` is meant to end when a phone scans the code — that is the
   * moment the demo exists to show. This is the way back when it does not:
   * the wrong slide, a question, a rehearsal that ran long. Waiting out the
   * ninety seconds in front of an audience is not an option, and the only
   * other exit was a reboot.
   *
   * Zero seconds is the off switch. The box clamps positive values to at
   * least five, so a small number cannot stand in for this.
   */
  async hidePairing(): Promise<number> {
    return this.command({ action: 'show_pairing', seconds: 0 });
  }

  async goodbye(): Promise<number> {
    return this.command({ action: 'goodbye' });
  }

  /**
   * Seal a command into the mailbox at the next revision.
   *
   * The revision dance is shared by every command rather than copied per verb:
   * read what the relay holds, write one past it, and on a 409 read again and
   * retry once. Two phones tapping at the same moment need no merge here —
   * unlike a schedule, both taps are asking for the same thing.
   */
  private async command(command: DeviceCommand): Promise<number> {
    let currentRev = 0;
    try {
      const meta = await this.meta();
      currentRev = Number(meta.command?.rev ?? 0);
    } catch (error) {
      // No mailbox yet means no device has ever reported, so there is nothing
      // due to release — but the write is harmless and creates it.
      if (!(error instanceof RelayError) || error.status !== 404) throw error;
    }

    const rev = currentRev + 1;
    const envelope = await seal(this.keys.boxKey, this.keys.deviceId, 'command', rev, command);
    const response = await this.request('PUT', '/command', { envelope });

    if (response.status === 409) {
      // Two phones tapped release at once. Unlike a schedule conflict this
      // needs no merge — the other tap is doing the same job, and the device
      // will open the tray once either way. Re-read and retry once.
      const meta = await this.meta().catch(() => null);
      const next = Number(meta?.command?.rev ?? rev) + 1;
      const retry = await seal(this.keys.boxKey, this.keys.deviceId, 'command', next, command);
      const second = await this.request('PUT', '/command', { envelope: retry });
      await this.assertOk(second);
      return ((await second.json()) as { rev: number }).rev;
    }

    await this.assertOk(response);
    return ((await response.json()) as { rev: number }).rev;
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
   *
   * **The timestamp must carry a UTC offset**, and a stamp without one is
   * treated as unknown rather than guessed at. `new Date('2026-07-29T08:00:00')`
   * is parsed in the *browser's* timezone, and the browser is the carer's, not
   * the dispenser's. With a device in Asia/Seoul and a carer in the UK, a nine
   * hour gap swamps a fifteen minute threshold in both directions: a healthy
   * dispenser reads as unplugged, and — reversing the zones — one that has been
   * dead for days never trips. Returning true for an ambiguous stamp errs
   * towards "go and look at it", which is the recoverable mistake.
   *
   * The firmware emits an offset (`cloud.py`, `_report`). Older firmware does
   * not, which is exactly the case this branch is for.
   */
  static isStale(report: DeviceReport, thresholdSeconds = 15 * 60, now = new Date()): boolean {
    if (!/(Z|[+-]\d{2}:?\d{2})$/.test(report.at.trim())) return true;
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
