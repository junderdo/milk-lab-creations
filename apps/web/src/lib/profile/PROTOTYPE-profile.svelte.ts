/**
 * PROTOTYPE — throwaway, prototype/profile-and-registration.
 *
 * Everything the profile section would read from the server, faked in memory:
 * the user's name and avatar, the private device list, and a connection that
 * can hand back a serial. Nothing here talks to the API — neither `users.avatar`
 * nor the `devices` table exists yet, and Web Bluetooth cannot run under WSL2.
 *
 * The faults object is what the switcher's bug panel drives, so every state the
 * variants have to answer for (pre-serial firmware, an already-registered pair,
 * a dismissed prompt, no Chrome) can be reached in two clicks.
 */

import type { PresetKey } from "./PROTOTYPE-avatars";

export interface ProtoDevice {
  readonly serial: string;
  name: string;
  readonly registeredAt: Date;
}

export type LinkFault = "disconnected" | "connected" | "pre-serial" | "unsupported";

const SERIALS = ["a41f3c9d2b70", "0c8e17ff42a1", "7b2d55e0c93f"] as const;

const SEED_NAMES = ["Desk ears", "Cosplay pair", "Kid's ears"];

function seedDevices(count: number): ProtoDevice[] {
  return SERIALS.slice(0, count).map((serial, i) => ({
    serial,
    name: SEED_NAMES[i]!,
    registeredAt: new Date(Date.now() - (i + 1) * 86_400_000 * 9),
  }));
}

function createProfile() {
  const userId = "prototype-user";

  let displayName = $state("Jeff");
  let avatar = $state<string | null>(null);
  let devices = $state<ProtoDevice[]>(seedDevices(2));
  let dismissed = $state<string[]>([]);

  const faults = $state({
    link: "connected" as LinkFault,
    /** Which of the three fake pairs is on the other end when connected. */
    serialIndex: 2,
    seeded: 2,
  });

  /** Spec §7: the width is unresearched, so the prototype just uses 12 hex chars. */
  const connectedSerial = $derived(
    faults.link === "connected" ? (SERIALS[faults.serialIndex] ?? SERIALS[0]) : null,
  );

  const connectedDevice = $derived(
    connectedSerial ? (devices.find((d) => d.serial === connectedSerial) ?? null) : null,
  );

  return {
    userId,
    faults,
    get displayName() {
      return displayName;
    },
    set displayName(value: string) {
      displayName = value;
    },
    get avatar() {
      return avatar;
    },
    get devices() {
      return devices;
    },
    get link() {
      return faults.link;
    },
    /** null while disconnected, and null on firmware too old to say who it is. */
    get connectedSerial() {
      return connectedSerial;
    },
    get connectedDevice() {
      return connectedDevice;
    },
    /** The advertised BLE name — a model name, shared by every unit (spec §2.3). */
    get advertisedName() {
      return "Robo Cat Ears";
    },
    get preSerialFirmware() {
      return faults.link === "pre-serial";
    },
    /** Spec §3: the prompt is owed only for an unregistered, undismissed pair. */
    get needsRegistration() {
      return (
        connectedSerial !== null && connectedDevice === null && !dismissed.includes(connectedSerial)
      );
    },
    get dismissedHere() {
      return connectedSerial !== null && dismissed.includes(connectedSerial);
    },
    isRegistered(serial: string) {
      return devices.some((d) => d.serial === serial);
    },
    setAvatar(key: PresetKey) {
      avatar = `preset:${key}`;
    },
    register(serial: string, name: string) {
      if (devices.some((d) => d.serial === serial)) return;
      devices = [...devices, { serial, name: name.trim(), registeredAt: new Date() }];
      dismissed = dismissed.filter((s) => s !== serial);
    },
    rename(serial: string, name: string) {
      devices = devices.map((d) => (d.serial === serial ? { ...d, name: name.trim() } : d));
    },
    /** Spec §3.3: forgetting writes the dismissal too, or the prompt reappears. */
    forget(serial: string) {
      devices = devices.filter((d) => d.serial !== serial);
      if (!dismissed.includes(serial)) dismissed = [...dismissed, serial];
    },
    dismiss(serial: string) {
      if (!dismissed.includes(serial)) dismissed = [...dismissed, serial];
    },
    undismiss(serial: string) {
      dismissed = dismissed.filter((s) => s !== serial);
    },
    reseed(count: number) {
      devices = seedDevices(count);
      dismissed = [];
    },
    connect() {
      faults.link = "connected";
    },
    disconnect() {
      faults.link = "disconnected";
    },
  };
}

export const proto = createProfile();
