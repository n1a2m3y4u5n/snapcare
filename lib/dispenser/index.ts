/**
 * SnapCare dispenser — the web app's side of the hardware sync.
 *
 * Copy this directory into `lib/snapcare/dispenser/` (or wherever it belongs)
 * and import from here. It has no dependencies, uses no framework API, and
 * touches nothing outside WebCrypto and `fetch` — so it runs unchanged in a
 * React client component, a route handler, or a plain script tag after
 * bundling.
 *
 *     import { DispenserClient, encodeWeekly } from '@/lib/snapcare/dispenser';
 *
 *     const client = await DispenserClient.pair({ relayUrl: RELAY, claim });
 *     await client.setSchedule([
 *       { tray: 1, times: ['0800', '2000'], days: EVERY_DAY, durationDays: 30 },
 *     ]);
 *
 * The dispenser does not drop pills on a timer. When a dose falls due it goes on
 * `status.awaitingRelease` and the machine waits — so the screen you build has
 * one control the whole device depends on:
 *
 *     await client.release();     // opens the tray for everything due now
 *
 * See INTEGRATION.md for the flows, the states a UI has to show, and the three
 * mistakes that are worth reading about before writing the screen.
 */

export {
  normaliseClaim,
  isValidClaim,
  formatClaim,
  claimFromPairUrl,
  CLAIM_LENGTH,
} from './claim.ts';

export {
  deriveKeys,
  deviceId,
  accessToken,
  boxKey,
  b64url,
  unb64url,
  InvalidClaimError,
  type DeviceKeys,
} from './derive.ts';

export {
  seal,
  unseal,
  aad,
  SealError,
  ENVELOPE_VERSION,
  ALG,
  type Envelope,
  type Slot,
} from './envelope.ts';

export {
  encodeWeekly,
  decodeWeekly,
  normaliseSlots,
  parseHhmm,
  formatHhmm,
  daysToMask,
  maskToDays,
  describeDays,
  ScheduleError,
  DAY_NAMES,
  MAX_TRAYS,
  MAX_TIMES,
  MAX_DURATION_DAYS,
} from './schedule.ts';

export {
  DispenserClient,
  RelayError,
  RevisionConflictError,
  type DispenserClientOptions,
} from './relay.ts';

export {
  EVERY_DAY,
  type WeeklySlot,
  type ClockStatus,
  type DispenserStatus,
  type AwaitingRelease,
  type DoseEvent,
  type DeviceReport,
  type DesiredSchedule,
  type ReleaseCommand,
  type MailboxMeta,
} from './types.ts';
