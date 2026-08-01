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
  /** A dose in the cup, waiting for the button. Null when there is none. */
  awaitingConfirmation: { tray: number; time: string } | null;
  dropCounts: Record<string, number>;
  /** Which of `'ring'` and `'buzzer'` are actually fitted. */
  indicators: string[];
}

export interface DoseEvent {
  /** ISO 8601, seconds precision. */
  at: string;
  tray: number;
  /** `'0800'` — the time the dose was *due*, not when it was recorded. */
  time: string;
  taken: boolean;
  /** Whether a person pressed the button. Different fact from `taken`. */
  confirmed: boolean;
  reason: 'dispensed' | 'window-closed' | 'manual' | 'confirmed' | string;
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

/** The relay's own view of a mailbox — revisions and timestamps, no plaintext. */
export interface MailboxMeta {
  ok: boolean;
  deviceId: string;
  desired?: { rev: number; updatedAt: number; bytes: number };
  reported?: { rev: number; updatedAt: number; bytes: number };
  [key: string]: unknown;
}
