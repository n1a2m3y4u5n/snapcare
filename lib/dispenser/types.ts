/**
 * What the dispenser actually sends, as TypeScript.
 *
 * These are transcribed from the firmware, not invented for the app:
 *   `DispenserStatus`  ← `Dispenser.status()` in `device.py`
 *   `DoseEvent`        ← `Dispenser._record()` in `device.py`
 *   `DeviceReport`     ← `CloudLink._report()` in `cloud.py`
 *
 * If a field here disagrees with the device you are holding, the device is
 * right and this file is stale — the firmware is the source of truth.
 */

/** Monday-first bitmask. Matches `EVERY_DAY` in `sc1.py` and `protocol.ts`. */
export const EVERY_DAY = 0b1111111; // 127

/** One tray's plan: when it fires, on which days, for how long. */
export interface WeeklySlot {
  /** 1–8. The compartment, not the pin. */
  tray: number;
  /** `'0800'`, 24-hour, zero-padded. Sorted and de-duplicated by the device. */
  times: string[];
  /** Monday-first bitmask, 1–127. `EVERY_DAY` when unset. */
  days?: number;
  /** 0 means ongoing. Otherwise the course length in days, up to 999. */
  durationDays?: number;
}

/** Whether the time can be believed at all — and until it can, nothing drops. */
export interface ClockStatus {
  /** ISO 8601, seconds precision, in the device's local time. */
  now: string;
  /** False means the tray stays shut. This is a feature. */
  trusted: boolean;
  /** What vouched: `'ntp'`, `'rtc'`, `'phone'`, or `''` when nothing has. */
  source: string;
  /** Null when the build has no RTC configured. */
  rtc: {
    present: boolean;
    /**
     * `true` the oscillator has run continuously, `false` it demonstrably
     * stopped, `null` we could not tell. Null is **not** false: only `false` is
     * a statement about the hardware.
     */
    running: boolean | null;
    trustworthy: boolean;
    detail: string;
  } | null;
  /** When the clock was last vouched for, or null. */
  setAt: string | null;
}

export interface DispenserStatus {
  /** Tray numbers this build accepts, ascending. */
  trays: number[];
  trayCount: number;
  /** Tray number (as a string key) to BCM GPIO. */
  pins: Record<string, number>;
  /** `'pigpio'`, `'lgpio'`, `'rpigpio'` or `'mock'`. */
  servoBackend: string;
  /**
   * False means pulse timing is at the mercy of CPU load — the servos twitch
   * and hum. Worth surfacing on a diagnostics screen; it is a real complaint
   * from anyone whose dispenser is in a bedroom.
   */
  servoSteady: boolean;
  clock: ClockStatus;
  /** Mirrors `clock.trusted`. False means nothing will be dispensed. */
  dispensing: boolean;
  /**
   * 왜 이 기기가 약을 내보내지 않는가 — **문장으로**. 내보내고 있으면 빈 문자열.
   *
   * NOTES-FOR-WEBAPP.md 는 이 필드를 안내하는데 키트의 타입에는 빠져 있었다. 실제
   * 기기가 보낸다 — 모의 기기에서 "the clock has not been vouched for by NTP, the
   * RTC or a phone" 을 받아 확인했다.
   *
   * 사람에게 그대로 읽어 줄 수 있는 유일한 진단이라 화면에 쓴다. servoUsable 이
   * 거짓인 기기는 아무것도 내보내지 않으면서 **기록도 남기지 않으므로**, 조용한
   * 이벤트 로그를 건강한 것으로 읽으면 안 된다.
   */
  blockedReason?: string;
  /** GPIO 라이브러리가 아예 없으면 거짓 — 기기가 움직일 수 없다. */
  servoUsable?: boolean;
  /** Where the loaded plan came from: `'cloud'`, `'api'`, `'save'`, `'sheet'`… */
  scheduleSource: string;
  /** The plan in SC1 form, or `''`. */
  payload: string;
  slots: WeeklySlot[];
  /**
   * What the loaded plan loses in transit — e.g. a `/save` schedule that has
   * no day-of-week field and therefore runs every day. Show these; the device
   * will not hide them and neither should the app.
   */
  notes: string[];
  nextDose: { tray: number; time: string } | null;
  /**
   * Doses that are due **and have not been released yet**, earliest first.
   * Empty almost all the time.
   *
   * Nothing has left the hopper for any entry here: at its scheduled minute the
   * device lights up and chirps, and the tray opens only when the app posts to
   * `/api/release`. A non-empty array is a release button on the main screen and
   * a push notification.
   *
   * Stop offering the button at `expiresAt` — past it the device will refuse to
   * open, and a button that quietly does nothing is worse than no button.
   */
  awaitingRelease: AwaitingRelease[];
  dropCounts: Record<string, number>;
  /** Which of `'ring'` and `'buzzer'` are actually fitted. */
  indicators: string[];
}

export interface AwaitingRelease {
  tray: number;
  /** `'0800'` — the scheduled minute this dose belongs to. */
  time: string;
  /** ISO 8601. When it fell due. */
  dueAt: string;
  /** ISO 8601. After this the tray will not open and the dose is recorded missed. */
  expiresAt: string;
}

export interface DoseEvent {
  /** ISO 8601, seconds precision. */
  at: string;
  tray: number;
  /** `'0800'` — the time the dose was *due*, not when it was recorded. */
  time: string;
  taken: boolean;
  /**
   * Whether a person asked for this dose. True for a release and for a manual
   * drop at the bench; false for anything the device recorded on its own.
   */
  confirmed: boolean;
  /**
   * - `released` — somebody tapped, the tray opened. The only scheduled path
   *   by which pills leave the machine.
   * - `not-released` — offered, nobody tapped, the window closed. **The tray
   *   stayed shut**, so nothing was dispensed.
   * - `window-closed` — already past its window when the device found it; it
   *   was never offered to anybody.
   * - `manual` — a bench drop through `/api/drop`, outside the schedule.
   */
  reason: 'released' | 'not-released' | 'window-closed' | 'manual' | string;
  /** Wraps at 100. Used to spot a replayed or dropped event. */
  seq: number;
  /** The 20-character `SC1*E*` form, replayable through any implementation. */
  sc1: string;
}

/** Everything the device publishes about itself, sealed. */
export interface DeviceReport {
  /** When the device wrote this, by its own clock. */
  at: string;
  firmware: string;
  /** The highest `desired` revision this device has actually applied. */
  desiredRev: number;
  /** Empty when the last cloud operation succeeded. */
  lastError: string;
  network: {
    ssid: string;
    address: string;
    /** `http://pilldispenser.local/` — the LAN shortcut. */
    deviceUrl: string;
  };
  status: DispenserStatus;
  events: DoseEvent[];
}

/** What the app writes into the `desired` slot. Send one or the other. */
export interface DesiredSchedule {
  /** SC1 form — `SC1*W*1:0800.2000-127-030`. Preferred: it is the canonical wire format. */
  payload?: string;
  /** Or the same thing as JSON, if you would rather not build the string. */
  slots?: WeeklySlot[];
}

/**
 * What the app writes into the `command` slot.
 *
 * An *act*, not a state — which is why it is not part of `DesiredSchedule`. A
 * schedule stays true until it is edited and a device coming back after a week
 * offline should adopt the newest one it finds; a release was true for one hour
 * on one morning, and a device that treated it the same way would drop a pill
 * into an empty room.
 *
 * `tray` and `minutes` name the dose. Omit both to release everything currently
 * due. The device acts only on a dose it is offering right now, so a command
 * that arrives late moves nothing.
 */
export interface ReleaseCommand {
  action: 'release';
  /** 1–8. Omit to mean every tray with a dose due. */
  tray?: number;
  /** Minutes since midnight — 480 is 08:00. Omit to mean any time due. */
  minutes?: number;
}

/** The relay's own view of a mailbox — revisions and timestamps, no plaintext. */
export interface MailboxMeta {
  ok: boolean;
  deviceId: string;
  desired?: { rev: number; updatedAt: number; bytes: number };
  reported?: { rev: number; updatedAt: number; bytes: number };
  command?: { rev: number; updatedAt: number; bytes: number };
  [key: string]: unknown;
}
