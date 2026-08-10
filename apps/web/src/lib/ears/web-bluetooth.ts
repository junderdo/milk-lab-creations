/**
 * The radio: `navigator.bluetooth` in, an `EarsLink` out.
 *
 * Everything browser-specific is here — the device picker, GATT discovery, the
 * `ABF2` subscription — so the session and the connect sequence stay testable
 * without one. Main thread only; Web Bluetooth exists nowhere else.
 *
 * `requestDevice` needs transient user activation, so this is only ever called
 * straight out of a click.
 */

import type { EarsLink } from "./session";

/** The service UUID as a *number*. The string "0xABF0" throws `TypeError`. */
const EARS_SERVICE = 0xabf0;
/** Client -> ears. Every request, write-with-response. */
const REQUEST_CHARACTERISTIC = 0xabf1;
/** Ears -> client. Store responses, as indications. */
const RESPONSE_CHARACTERISTIC = 0xabf2;

export type LinkResult =
  | { readonly kind: "ok"; readonly link: EarsLink }
  /** The picker closed without a device. Not a failure — say nothing. */
  | { readonly kind: "cancelled" }
  | { readonly kind: "failed"; readonly message: string };

/**
 * Whether this browser has Web Bluetooth at all. Touching `navigator.bluetooth`
 * where it is absent must not throw, which is why this is an `in` check.
 */
export function bluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export async function openEarsLink(): Promise<LinkResult> {
  if (!bluetoothSupported()) {
    return { kind: "failed", message: "This browser has no Web Bluetooth." };
  }

  let device: BluetoothDevice;
  try {
    device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [EARS_SERVICE] }],
    });
  } catch (error) {
    if (isDomError(error, "NotFoundError")) return { kind: "cancelled" };
    return { kind: "failed", message: pickerFailure(error) };
  }

  const gatt = device.gatt;
  if (gatt === undefined) {
    return { kind: "failed", message: "Your ears turned up without any services to talk to." };
  }

  try {
    const server = await gatt.connect();
    const service = await server.getPrimaryService(EARS_SERVICE);
    const request = await service.getCharacteristic(REQUEST_CHARACTERISTIC);
    const response = await service.getCharacteristic(RESPONSE_CHARACTERISTIC);
    // step 1 of the connect sequence: nothing can answer until this lands
    await response.startNotifications();

    return { kind: "ok", link: linkOver(device, gatt, request, response) };
  } catch (error) {
    gatt.disconnect();
    return {
      kind: "failed",
      message: `Couldn't finish connecting to your ears. ${detailOf(error)}`,
    };
  }
}

function linkOver(
  device: BluetoothDevice,
  gatt: BluetoothRemoteGATTServer,
  request: BluetoothRemoteGATTCharacteristic,
  response: BluetoothRemoteGATTCharacteristic,
): EarsLink {
  return {
    deviceName: device.name ?? "Your ears",
    write: async (frame) => {
      await request.writeValueWithResponse(frame);
    },
    onResponse: (handler) => {
      response.addEventListener("characteristicvaluechanged", () => {
        const value = response.value;
        if (value !== undefined) handler(value.buffer);
      });
    },
    onDisconnect: (handler) => {
      device.addEventListener("gattserverdisconnected", () => {
        handler();
      });
    },
    disconnect: () => {
      // fires gattserverdisconnected, so going out of range and clicking
      // disconnect land in the same place
      if (gatt.connected) gatt.disconnect();
    },
  };
}

function isDomError(error: unknown, name: string): boolean {
  return error instanceof DOMException && error.name === name;
}

function pickerFailure(error: unknown): string {
  if (isDomError(error, "SecurityError")) {
    return "This page isn't allowed to use Bluetooth. It needs to be served over HTTPS or localhost.";
  }
  return `Chrome couldn't open the device picker. ${detailOf(error)}`;
}

function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
