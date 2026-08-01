/**
 * A dispenser screen, as an example of what to show and when.
 *
 * Not styled and not meant to be shipped as-is — the point of this file is the
 * *decisions*: which fields are worth a person's attention, which states have
 * to be distinguishable, and the two that a naive screen gets wrong.
 *
 * The two:
 *
 *   1. `clock.trusted === false` means **nothing will be dispensed**, and the
 *      device is otherwise completely healthy-looking. It is the most important
 *      boolean on the object and it needs to be louder than everything else.
 *
 *   2. "Connected" is not a fact anybody can observe from here. A dispenser
 *      whose power has been pulled sends nothing and looks identical to one
 *      that simply has nothing new to say. Show the age of the last report.
 */
'use client';

import { useState } from 'react';
import { describeDays, EVERY_DAY, RevisionConflictError } from '@/lib/snapcare/dispenser';
import { useDispenser } from './useDispenser';

export function DispenserPanel({ relayUrl, claim }: { relayUrl: string; claim: string }) {
  const { report, loading, error, stale, setSchedule, getSchedule, release } = useDispenser(
    relayUrl,
    claim,
  );
  const [saving, setSaving] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);

  if (loading) return <p>Looking for the dispenser…</p>;

  if (error) {
    return (
      <div role="alert">
        <h2>Cannot reach the dispenser</h2>
        <p>{error.message}</p>
        <p>The dispenser keeps its schedule and its clock on its own, so it is still
           dispensing. This is the connection to it that is down, not the device.</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div>
        <h2>This dispenser has never been heard from</h2>
        <p>It has not yet been put on a WiFi network, or it has not been told which
           relay to use. Both are on the printed label.</p>
      </div>
    );
  }

  const { status } = report;

  async function save() {
    setSaving(true);
    setConflict(null);
    try {
      await setSchedule([
        { tray: 1, times: ['0800', '2000'], days: EVERY_DAY, durationDays: 30 },
      ]);
    } catch (err) {
      if (err instanceof RevisionConflictError) {
        // Somebody else saved while this screen was open. Show them what is
        // actually stored rather than overwriting it.
        const current = await getSchedule();
        setConflict(current?.schedule.payload ?? 'a newer schedule');
      } else {
        throw err;
      }
    } finally {
      setSaving(false);
    }
  }

  async function doRelease() {
    setReleasing(true);
    try {
      // No argument: everything currently due.
      await release();
    } finally {
      // Cleared on the way out either way. The report that comes back with an
      // empty `awaitingRelease` is what removes the button, so a failed release
      // has to leave it tappable — this is somebody's medication.
      setReleasing(false);
    }
  }

  return (
    <section>
      {/* The one that stops pills coming out. Above everything else. */}
      {!status.clock.trusted && (
        <div role="alert">
          <h2>The dispenser will not open a tray</h2>
          <p>
            It does not know what time it is, so it is refusing to guess — a tray
            that opens at the wrong time is worse than one that stays shut.
            {status.clock.rtc?.running === false &&
              ' Its clock chip lost power: the coin cell is flat or was never fitted.'}
          </p>
          <p>Put it on a network with internet, or set its clock from this app.</p>
        </div>
      )}

      {stale && (
        <div role="alert">
          <h2>Not heard from since {new Date(report.at).toLocaleString()}</h2>
          <p>The dispenser may be unplugged, or its network may be down.</p>
        </div>
      )}

      {/* The one control the machine depends on. Nothing has left the hopper
          for anything listed here — the tray opens when this is tapped, and if
          nobody taps before `expiresAt` the dose is recorded missed with the
          tray still shut. Stop offering it past that instant: a button that
          quietly does nothing sends somebody away believing they have their
          medication. */}
      {status.awaitingRelease.length > 0 && (
        <div role="alert">
          <h2>Ready to take</h2>
          <ul>
            {status.awaitingRelease.map((dose) => (
              <li key={`${dose.tray}-${dose.time}`}>
                Tray {dose.tray}, due {dose.time} — until{' '}
                {new Date(dose.expiresAt).toLocaleTimeString()}
              </li>
            ))}
          </ul>
          {/* Through the relay, so it works whether or not the phone is on the
              house WiFi. Sending no tray releases everything due, which is what
              this button means — two trays owed at 08:00 are two medications
              for 08:00, and making somebody tap twice is how the second gets
              forgotten.

              This does not tell us whether a pill came out; the relay is a
              mailbox. The report arriving with an empty `awaitingRelease` is
              what does, and `waitForReport` will bring it within a second or
              two. */}
          <button onClick={doRelease} disabled={releasing}>
            {releasing
              ? 'Releasing…'
              : `Release ${status.awaitingRelease.length > 1 ? 'these doses' : 'this dose'}`}
          </button>
          {report.network.deviceUrl && (
            <p>
              On the same WiFi? <a href={`${report.network.deviceUrl}release`}>
                Release it directly
              </a>{' '}
              — no internet needed.
            </p>
          )}
        </div>
      )}

      <h2>Next dose</h2>
      {status.nextDose ? (
        <p>
          Tray {status.nextDose.tray} at {status.nextDose.time}
        </p>
      ) : (
        <p>Nothing scheduled.</p>
      )}

      <h2>The plan</h2>
      <ul>
        {status.slots.map((slot) => (
          <li key={slot.tray}>
            Tray {slot.tray}: {slot.times.join(', ')} — {describeDays(slot.days ?? EVERY_DAY)}
            {slot.durationDays ? ` for ${slot.durationDays} days` : ' (ongoing)'}
          </li>
        ))}
      </ul>

      {/* What the schedule lost in transit. The device will not hide these and
          neither should we — a Mon/Wed/Fri course quietly running seven days a
          week is the failure they exist to name. */}
      {status.notes.length > 0 && (
        <div role="note">
          <h3>Worth knowing about this schedule</h3>
          <ul>
            {status.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      <h2>Recent doses</h2>
      <ul>
        {report.events.map((event) => (
          <li key={`${event.at}-${event.seq}`}>
            {new Date(event.at).toLocaleString()} — tray {event.tray}, due {event.time}
            {/* The two ways a dose can be missed are worth telling apart: one
                means nobody was told, the other means the device never got the
                chance to ask. Only the first is a problem with the household's
                routine. */}
            {event.reason === 'released'
              ? ' — taken'
              : event.reason === 'manual'
                ? ' — dropped by hand at the device'
                : event.reason === 'not-released'
                  ? ' — missed: it was offered and nobody released it'
                  : ' — missed: its window had already closed'}
          </li>
        ))}
      </ul>

      <button onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save schedule'}
      </button>

      {conflict && (
        <div role="alert">
          <h3>Somebody else changed this</h3>
          <p>The dispenser now has: <code>{conflict}</code></p>
          <p>Your change was not saved. Check theirs before replacing it.</p>
        </div>
      )}

      <details>
        <summary>Device</summary>
        <dl>
          <dt>Firmware</dt><dd>{report.firmware}</dd>
          <dt>Trays fitted</dt><dd>{status.trayCount}</dd>
          <dt>Clock</dt><dd>{status.clock.source || 'nothing has vouched for it'}</dd>
          <dt>Servo driver</dt>
          <dd>
            {status.servoBackend}
            {!status.servoSteady && ' — jittery fallback; the servos will hum'}
          </dd>
          <dt>Fitted</dt><dd>{status.indicators.join(', ') || 'no ring, no buzzer'}</dd>
          {/* Somebody standing next to the dispenser should not be round-tripping
              through a data centre to open a tray. Mixed content means this is a
              link, never a fetch. */}
          <dt>On the LAN</dt>
          <dd><a href={report.network.deviceUrl}>{report.network.deviceUrl}</a></dd>
        </dl>
      </details>
    </section>
  );
}
