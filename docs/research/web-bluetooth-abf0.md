# Web Bluetooth against the robo-cat-ears `0xABF0` GATT service

Research ticket: establish what the Web Bluetooth API actually permits and
guarantees, so the SvelteKit web-app, the ESP32 firmware and the API can agree on
one BLE protocol. Everything below is sourced from the specification, the WICG
registries, Chromium source, MDN and vendor standards-positions — never from a
blog summary.

Device under test: single SPP-style service `0xABF0` with characteristics
`0xABF1` (write-no-response, data RX), `0xABF2` (read + notify, data TX),
`0xABF3`/`0xABF4` (command RX/TX), `0xABF5` (notify + write + read, heartbeat).
Animation payloads are up to ~800 bytes, responses arrive as several
notifications.

Where a fact could not be established from a primary source it is called out as
**must be measured on hardware** rather than guessed. Those are the inputs to the
follow-up hardware spike.

---

## 1. UUID access

### 16-bit aliases are first-class

`BluetoothServiceUUID` and `BluetoothCharacteristicUUID` are both
`(DOMString or unsigned long)`, and `ResolveUUIDName` says: "If *name* is an
`unsigned long`, return `BluetoothUUID.canonicalUUID(name)`"
([spec, BluetoothUUID](https://webbluetoothcg.github.io/web-bluetooth/#bluetoothuuid)).
`canonicalUUID(alias)` is defined as "replacing the top 32 bits of
`00000000-0000-1000-8000-00805f9b34fb` with the bits of the alias"
([spec note](https://webbluetoothcg.github.io/web-bluetooth/#dom-bluetoothuuid-canonicaluuid)).

So passing the JS number `0xABF0` is legal and expands to
`0000abf0-0000-1000-8000-00805f9b34fb`. There is no requirement that the alias be
a SIG-assigned number — only that it is an `unsigned long`. A *string* like
`"0xABF0"` is **not** legal: a string must be either a full valid UUID or a
registered human-readable name, otherwise `getService` throws a `TypeError`
([ResolveUUIDName](https://webbluetoothcg.github.io/web-bluetooth/#resolveuuidname)).
Use the numeric literal, or the fully expanded 128-bit string.

`BluetoothUUID` is shipped on every Chrome platform per the CG's
[implementation-status.md](https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md).

### What must be listed in `requestDevice`

Only **services** are gated. Characteristics are not listed anywhere in
`requestDevice`; once the page holds a `BluetoothRemoteGATTService`, all of its
non-blocklisted characteristics are reachable via `getCharacteristic()`. The
`RequestDeviceOptions` dictionary has `filters`, `exclusionFilters` and
`optionalServices` only
([spec, requestDevice](https://webbluetoothcg.github.io/web-bluetooth/#dom-bluetooth-requestdevice)).

A service is accessible if it appears in a matched filter's `services` list **or**
in `optionalServices`; the union of the two becomes the granted set
([spec, request-bluetooth-device](https://webbluetoothcg.github.io/web-bluetooth/#dom-bluetooth-requestdevice)).
Chrome's own documentation states this bluntly: "you will also need to define the
`optionalServices` key to be able to access any services not included in a service
filter. If you don't, you'll get an error later when trying to access them"
([Chrome developers, Web Bluetooth](https://developer.chrome.com/docs/capabilities/bluetooth)).

Two shapes work for this device:

```js
// Filter on the service — the filter itself grants access.
navigator.bluetooth.requestDevice({ filters: [{ services: [0xabf0] }] });

// Filter on the name, then grant the service explicitly.
navigator.bluetooth.requestDevice({
  filters: [{ namePrefix: 'RoboCatEars' }],
  optionalServices: [0xabf0],
});
```

Caveat for the firmware side: filtering on `services` matches against the
**advertisement's** Service UUID data types, not against the GATT database
([spec, advertisement matching](https://webbluetoothcg.github.io/web-bluetooth/#advertising-data)).
The ESP32 must therefore put `0xABF0` in its advertising or scan-response packet
for a service filter to find it. If it doesn't, the page must filter on name and
list `0xABF0` in `optionalServices`.

### Blocklist status: clear

Fetched and inspected the authoritative file directly. The complete non-comment
content of
[`gatt_blocklist.txt`](https://raw.githubusercontent.com/WebBluetoothCG/registries/master/gatt_blocklist.txt)
(67 lines, 12 entries) is:

```
00001812-0000-1000-8000-00805f9b34fb            # HID
00001530-1212-efde-1523-785feabcd123            # Nordic legacy DFU
f000ffc0-0451-4000-b000-000000000000            # TI OTA
00060000-0000-1000-8000-00805f9b34fb            # Cypress bootloader
0000fffd-0000-1000-8000-00805f9b34fb            # FIDO
0000fff9-0000-1000-8000-00805f9b34fb            # FIDO
0000fde2-0000-1000-8000-00805f9b34fb            # Google FIDO pairingless
00002a02-0000-1000-8000-00805f9b34fb exclude-writes   # Peripheral privacy flag
00002a03-0000-1000-8000-00805f9b34fb                  # Reconnection address
00002a25-0000-1000-8000-00805f9b34fb                  # Serial number string
00002902-0000-1000-8000-00805f9b34fb exclude-writes   # CCCD
00002903-0000-1000-8000-00805f9b34fb exclude-writes   # SCCD
```

A case-insensitive grep for `abf` over that file returns **zero** matches.
Chromium's hardcoded copy
([`content/browser/bluetooth/bluetooth_blocklist.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/content/browser/bluetooth/bluetooth_blocklist.cc))
carries the same set plus three test-only `bad1…`/`bad2…`/`bad3…` UUIDs and an
Apple manufacturer-data prefix, and no `abfx` entry either.

**None of `0xABF0`–`0xABF5` is blocklisted.** Two second-order notes:

- Chromium updates the blocklist out of band via
  `PopulateWithServerProvidedValues()` off a `BluetoothDelegate` — the CG table
  calls this "Low-latency Blocklist Updates" and marks it shipped on all
  platforms. So the blocklist is not frozen at Chrome-release granularity; a
  future entry could land without a Chrome update. Vanishingly unlikely for a
  vendor-private range, but it is a real remote kill-switch.
- `0x2902` (CCCD) is `exclude-writes`. That is fine — the page never writes the
  CCCD itself; `startNotifications()` does it on the page's behalf, and the spec
  routes around the blocklist for that path
  ([spec, startNotifications](https://webbluetoothcg.github.io/web-bluetooth/#dom-bluetoothremotegattcharacteristic-startnotifications)).
  It does mean the page can never manually toggle notify-vs-indicate bits.

---

## 2. Write sizing

### The one hard cap: 512 bytes

Both `WriteCharacteristicValue` and the descriptor write algorithm contain the
same step:

> "If *bytes* is more than 512 bytes long (the maximum length of an attribute
> value, per Long Attribute Values) return a promise rejected with an
> `InvalidModificationError` `DOMException`"

([spec, writeValueWithResponse / writeValueWithoutResponse](https://webbluetoothcg.github.io/web-bluetooth/#dom-bluetoothremotegattcharacteristic-writevaluewithresponse)).
This check is mirrored in Blink's
[`bluetooth_remote_gatt_characteristic.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/modules/bluetooth/bluetooth_remote_gatt_characteristic.cc).

So an ~800-byte animation payload **cannot** be a single `writeValue*` call under
any circumstances. Chunking is mandatory regardless of MTU.

### The MTU is not observable from JavaScript. At all.

This is the single most consequential finding.

The spec has the UA negotiate the MTU during `connect()` — "Use the Exchange MTU
procedure to negotiate the largest supported MTU. Ignore any errors from this
step"
([spec, gatt.connect](https://webbluetoothcg.github.io/web-bluetooth/#dom-bluetoothremotegattserver-connect))
— and then never surfaces the result. There is no `mtu` attribute on
`BluetoothRemoteGATTServer`, no `getNegotiatedMTU()`, nothing in the IDL.

The gap is a known, **open** CG issue:
[#383 "API which provides the negotiated MTU is required"](https://github.com/WebBluetoothCG/web-bluetooth/issues/383)
states that MTU negotiation happens silently with no way to retrieve the outcome,
and requests exactly this for protocols that need segmentation.
[#284 "Add Web Bluetooth API support to change MTU"](https://github.com/WebBluetoothCG/web-bluetooth/issues/284)
has been open since 2016 and notes the platform spread — 23 bytes default on
Android against 512 reachable on ChromeOS. Neither has shipped.

**Conclusion: the protocol must carry its own chunk-size negotiation, or use a
chunk size small enough to be safe everywhere.** There is no way to read the MTU,
and no way to request one.

### Practical caps, and what the spec does *not* say

The BLE floor is ATT_MTU = 23, giving a 20-byte usable payload for a single
unacknowledged write (`ATT_MTU − 3`). That is the Bluetooth Core baseline, and it
is why Android's default was historically 23.

What the spec does **not** resolve: the write algorithm says that for
`response = "never"` the UA must "Use the **Write Without Response** procedure",
and for `response = "required"` the **Write Characteristic Value** procedure
([spec](https://webbluetoothcg.github.io/web-bluetooth/#dom-bluetoothremotegattcharacteristic-writevaluewithresponse)).
The spec's own index of GATT procedures lists only these two under "Characteristic
Value Write" — **"Write Long Characteristic Values" is not referenced anywhere in
the write path**. Yet the algorithm permits values up to 512 bytes, which no
single ATT packet can carry at any MTU. The spec therefore permits a value it
gives the UA no defined procedure to transmit.

In practice implementations delegate to the platform API (CoreBluetooth,
`BluetoothGatt`, WinRT, BlueZ), which perform a long write for a with-response
write that exceeds `ATT_MTU − 3`. But that behaviour is not written down in any
primary source I could find, and `writeValueWithoutResponse` has no long-write
equivalent at the protocol level — a >`ATT_MTU − 3` unacknowledged write has no
legal encoding.

**Not documented; must be measured on hardware.** Specifically, measure:

1. The largest `writeValueWithoutResponse` that arrives intact at the ESP32, per
   platform. Expect this to be `ATT_MTU − 3`, and expect *silent truncation or
   silent drop* above it rather than a rejected promise.
2. Whether `writeValueWithResponse` of 200–512 bytes is fragmented into a long
   write and reassembled correctly by the ESP32's GATT stack, per platform.
3. The actual negotiated MTU, observed **from the firmware side** (ESP-IDF raises
   an MTU-exchange event), for Chrome on Windows, macOS, Android and Linux.
   The firmware knowing the MTU is the only place this number is visible.

---

## 3. Write flavour: with-response vs without-response

### Property gating

`writeValueWithoutResponse()` requires the characteristic's `writeWithoutResponse`
property bit and `writeValueWithResponse()` requires the `write` bit; otherwise
`NotSupportedError`
([spec](https://webbluetoothcg.github.io/web-bluetooth/#dom-bluetoothremotegattcharacteristic-writevaluewithresponse)).

`0xABF1` is currently WRITE_NO_RESPONSE only, so **only
`writeValueWithoutResponse()` will work against it today**. The deprecated
`writeValue()` maps to `response = "optional"` and lets the UA pick either
procedure
([spec, writeValue — "This method is for backwards compatibility only"](https://webbluetoothcg.github.io/web-bluetooth/#dom-bluetoothremotegattcharacteristic-writevalue)).
Do not use it: with `"optional"` the page cannot tell which procedure ran, which
makes throughput and reliability unpredictable.

If the protocol wants acknowledged chunk transfer, the firmware must add the
`WRITE` (with response) property to `0xABF1`. That is a firmware change, and it is
the main cross-project decision this document surfaces.

### There is no queue, and no flow control

The spec is explicit, in an inline `Issue(188)` note inside the write algorithm:

> "If the UA is currently using the Bluetooth system, it MAY queue a global task
> on the Bluetooth task source given *global* to reject *promise* with a
> `NetworkError` `DOMException` and abort these steps.
>
> Issue(188): Implementations may be able to avoid this `NetworkError`, but for
> now **sites need to serialize their use of this API** and/or give the user a way
> to retry failed operations."

([spec, WriteCharacteristicValue](https://webbluetoothcg.github.io/web-bluetooth/#dom-bluetoothremotegattcharacteristic-writevaluewithresponse);
[CG issue #188](https://github.com/WebBluetoothCG/web-bluetooth/issues/188), still
open, filed 2015)

The CG's implementation-status page repeats it: "Some Bluetooth GATT operations
can't be run in parallel yet"
([implementation-status.md](https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md)),
and Chrome's own docs say "Reading and writing to Bluetooth characteristics in
parallel may raise errors depending on the platform. I strongly suggest you
manually queue GATT operation requests when appropriate"
([Chrome developers](https://developer.chrome.com/docs/capabilities/bluetooth)).

Blink does not serialize on the page's behalf: `bluetooth_remote_gatt_characteristic.cc`
tracks in-flight notification registrations and registers promises in
`activeAlgorithms` for disconnect cleanup, but contains no read/write operation
queue.

**So: there is a documented queueing model, and it is "there is no queue — the
site must be the queue."** Every GATT operation must be awaited before the next is
issued.

### What "resolved" means for an unacknowledged write

Read the algorithm carefully. For `response = "never"` the UA performs the Write
Without Response procedure and then resolves the promise. Write Without Response
generates no ATT response by definition, so there is nothing for the UA to wait
for. The resolved promise therefore means *the UA handed the bytes to the
Bluetooth stack*, **not** that the peripheral received them.

Nothing in the spec, in Chrome's documentation, or in Blink defines what happens
when a page issues unacknowledged writes faster than the link can drain them.
There is no `bufferedAmount`, no drain event, no backpressure signal of any kind —
contrast Web Serial's `WritableStream`, which Web Bluetooth does not use. The
host controller's buffer behaviour under overrun (block vs drop) is a stack
detail below the API.

**Not documented; must be measured on hardware.** Whether back-to-back
`await writeValueWithoutResponse()` calls with no pacing lose chunks is exactly
the kind of thing the hardware spike exists to find out. Empirically this is the
classic BLE-over-web failure mode, and the protocol should be designed to survive
it rather than to assume it away.

Throughput trade-off, from the Bluetooth Core behaviour rather than from any web
source: unacknowledged writes can pack multiple PDUs per connection event, while
each acknowledged write costs a round trip and is therefore bounded by the
connection interval. The web-facing cost of with-response writes is worse when
each is awaited serially, because the JS `await` adds a task-queue hop on top of
the radio round trip.

---

## 4. Notifications

### Ordering: guaranteed, per event loop

The delivery algorithm is short and precise. On each Characteristic Value
Notification or Indication the UA must, for each global in the characteristic's
active notification context set, **queue a global task on the Bluetooth task
source** that sets `characteristic.value` to "a new `DataView` wrapping a new
`ArrayBuffer`" and fires `characteristicvaluechanged` with `bubbles = true`
([spec, Responding to Notifications and Indications](https://webbluetoothcg.github.io/web-bluetooth/#notification-events)).

Two guarantees fall out of this:

- **Ordering is preserved.** Tasks on a single task source run in the order they
  were queued, per the HTML event-loop processing model. Notifications that reach
  the UA in order fire in order. Chunk sequencing at the JS layer is safe *given*
  the underlying link delivered them in order — which the BLE Link Layer does for
  packets it delivers at all.
- **No aliasing.** Each event gets a *new* `ArrayBuffer`, so
  `event.target.value` captured inside the handler is not overwritten by the next
  notification. Reading `characteristic.value` outside the handler, however, only
  ever shows the latest value.

### Coalescing and loss: not addressed, with one explicit exception

The spec defines **no** coalescing or batching — one notification, one task, one
event. It also defines no buffering limit and no drop policy. There is no
documented guarantee that every notification the peripheral sends produces an
event.

The one loss the spec does acknowledge is at subscription boundaries:

> "All notifications become inactive when a device is disconnected. A site that
> wants to keep getting notifications after reconnecting needs to call
> `startNotifications()` again, and there is an **unavoidable risk that some
> notifications will be missed in the gap** before `startNotifications()` takes
> effect."

([spec, active notification context set](https://webbluetoothcg.github.io/web-bluetooth/#dom-bluetoothremotegattcharacteristic-startnotifications))

The spec also notes that value-change events "won't be delivered until"
`startNotifications()`'s promise resolves — so do not start the request that
triggers a response until the subscription promise has settled.

Where losses realistically come from, none of which the web API can see or report:

- The peripheral's own notification queue. On ESP-IDF, `esp_ble_gatts_send_indicate`
  with `need_confirm = false` will fail with a "congested" status if the
  controller buffer is full; if the firmware ignores that return code, the
  notification is simply never transmitted. This is a firmware-side concern and
  the firmware is the only party that can detect it.
- Notification vs indication. `0xABF2` is NOTIFY-only. Notifications are
  unacknowledged at the ATT layer. Indications are acknowledged, but the spec
  gives the page no control over which is used — `startNotifications()` "will
  ensure that one of the Notification or Indication bits" is set, and if the
  characteristic declares both the choice is the UA's
  ([spec](https://webbluetoothcg.github.io/web-bluetooth/#dom-bluetoothremotegattcharacteristic-startnotifications)).

**Not documented; must be measured on hardware.** How many back-to-back
notifications the ESP32 can emit before either the firmware reports congestion or
the browser drops events. Design the protocol to detect the loss regardless.

---

## 5. Preconditions

### Secure context

Every Web Bluetooth interface carries `[Exposed=Window, SecureContext]`
([spec IDL](https://webbluetoothcg.github.io/web-bluetooth/#bluetooth)). Chrome's
docs: "it is made available only to secure contexts. This means you'll need to
build with TLS in mind"
([Chrome developers](https://developer.chrome.com/docs/capabilities/bluetooth)).
`http://localhost` counts as a secure context, so the SvelteKit dev server on
`:5173` is fine without TLS.

Also note `[Exposed=Window]` — **no Worker access**. All BLE I/O runs on the main
thread, competing with rendering. That matters for chunk pacing.

### Transient user activation

`requestDevice()` requires it: "Check that the algorithm is triggered while its
relevant global object has a transient activation, otherwise throw a
`SecurityError`"
([spec, requestDevice](https://webbluetoothcg.github.io/web-bluetooth/#dom-bluetooth-requestdevice)).
Chrome's docs name the qualifying events: `pointerup`, `click`, `touchend`
([Chrome developers](https://developer.chrome.com/docs/capabilities/bluetooth)).

Activation is *transient* and is consumed/expires, so an `await` before
`requestDevice()` can silently invalidate it. Call `requestDevice()` synchronously
from the handler; everything after it (`gatt.connect()`, `getPrimaryService()`,
etc.) needs no activation.

### Permissions-Policy

`"bluetooth"` is a policy-controlled feature, and `requestDevice` rejects with
`SecurityError` if the document "is not allowed to use the policy-controlled
feature named 'bluetooth'"
([spec](https://webbluetoothcg.github.io/web-bluetooth/#dom-bluetooth-requestdevice)).

Per [MDN, `Permissions-Policy: bluetooth`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/bluetooth):

- Default allowlist is `self` — top-level document and same-origin iframes work
  with no configuration.
- Cross-origin iframes need `<iframe allow="bluetooth">`.
- Denied documents get: `getAvailability()` fulfils with `false`;
  `getDevices()` and `requestDevice()` reject with `SecurityError`.
- "Specifying the `Permissions-Policy` header disallows `bluetooth` for other
  origins, even if they are allowed by the iframe's `allow` attribute" — a header
  set for other reasons can break it.

Practical: the SvelteKit app must serve the BLE page as a top-level document, or
control the embedding page's `allow` attribute. Check any existing
`Permissions-Policy` header (CDN, framework default, Cloudflare) doesn't omit
`bluetooth` while listing other directives.

### Permission persistence

The spec models granted devices as a `BluetoothPermissionStorage` with an
`allowedDevices` list, and `getDevices()` returns "the `BluetoothDevice` object
representing *allowedDevice*" for each entry, with the note that these "may not be
in range of the Bluetooth radio"
([spec, getDevices](https://webbluetoothcg.github.io/web-bluetooth/#dom-bluetooth-getdevices)).
Adding to storage is a **MAY** for the UA, not a MUST
([spec, "The UA MAY add device to storage"](https://webbluetoothcg.github.io/web-bluetooth/#dom-bluetooth-requestdevice)).

In Chrome this is **doubly flagged and not on by default**:

- `getDevices()` is behind `chrome://flags/#enable-experimental-web-platform-features`
  ([implementation-status.md](https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md);
  [MDN BCD](https://github.com/mdn/browser-compat-data/blob/main/api/Bluetooth.json)
  records `getDevices` as Chrome 85 behind that preference).
- "Persistent Device Permissions" is behind a *second* flag,
  `chrome://flags/#enable-web-bluetooth-new-permissions-backend`
  ([implementation-status.md](https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md)).

MDN marks `getDevices()` "Experimental / Limited availability / not Baseline"
([MDN, Bluetooth.getDevices](https://developer.mozilla.org/en-US/docs/Web/API/Bluetooth/getDevices)).

**Assume no persistence.** Every page load requires a fresh user gesture and a
fresh chooser dialog. Design the UX around an explicit "Connect" button per
session, and do not build reconnect-on-load into the protocol's assumptions.

---

## 6. Platform matrix

Primary sources: the CG's
[implementation-status.md](https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md)
and [MDN browser-compat-data `api/Bluetooth.json`](https://github.com/mdn/browser-compat-data/blob/main/api/Bluetooth.json).

| Platform | State |
| --- | --- |
| Chrome / Android 6.0+ | Shipped, no flag. `requestDevice` since Chrome 56. Best-supported target. |
| Chrome / macOS 10.10+ | Shipped, no flag (Chrome 56). Some older MacBooks lack BLE — check System Report / Bluetooth. |
| Chrome / Windows 10 1703+ | Shipped, no flag, Chrome 70. Some sub-features (characteristic properties, notifications, descriptors, disconnect event) landed only in 70. |
| Chrome / ChromeOS | Shipped, no flag. |
| **Chrome / Linux** | **Not enabled by default.** BCD: Chrome 70, `partial_implementation: true`, note "Linux support is not enabled by default." CG: "Linux is partially implemented and not supported. The `chrome://flags/#enable-experimental-web-platform-features` flag must be enabled." Requires kernel 3.19+ and BlueZ 5.41+; below BlueZ 5.43 `bluetoothd` must run with `-E`. |
| Edge 79+ | Supported (Chromium). BCD lists Edge as `mirror` of Chrome. |
| Firefox / all | **Not supported, no plan.** Mozilla standards position is `negative`: "The Web Bluetooth CG has opted to only rely on user consent, which we believe is not sufficient protection." ([mozilla/standards-positions #95](https://github.com/mozilla/standards-positions/issues/95), [bug 674737](https://bugzilla.mozilla.org/show_bug.cgi?id=674737)) |
| Safari / macOS + iOS | **Not supported, no plan.** WebKit standards position is `oppose`, concerns: privacy, security, device independence ([WebKit/standards-positions #570](https://github.com/WebKit/standards-positions/issues/570), [bug 101034](https://bugs.webkit.org/show_bug.cgi?id=101034)). iOS is worse than "Safari doesn't support it": every iOS browser uses WKWebView, so Chrome for iOS cannot support it either — "iOS: Uses the web exposed APIs as provided by the WKWebView, no implementation planned in the Chromium codebase." Third-party wrapper browsers (WebBLE, Bluefy) implement it over CoreBluetooth. |
| Android WebView | Not supported ([crbug 40703318](https://crbug.com/40703318)). Rules out wrapping the app in a WebView shell. |

Experimental / flagged surface, which this project should **not** depend on:
`getDevices()`, `watchAdvertisements()`, Persistent Device Permissions, and the
whole Scanning API (`requestLEScan`) — all behind
`#enable-experimental-web-platform-features`, and Scanning is only partially
implemented at all. Nothing here is behind an origin trial; the GATT
Communication API is shipped-by-default on its supported platforms, not
trial-gated.

### WSL2: Web Bluetooth cannot work from inside WSL2

Definitive, and it changes how this gets tested.

Microsoft's [WSL FAQ](https://learn.microsoft.com/en-us/windows/wsl/faq) states:
"As of right now WSL 2 does not include serial support, or USB device support. We
are investigating the best way to add these features. However, USB support is now
available through the USBIPD-WIN project."

Consequences:

- There is no Bluetooth adapter inside the WSL2 VM. No `hci0`, and BlueZ has
  nothing to bind to. A Linux Chrome running inside WSL2 (via WSLg) would fail at
  `getAvailability()`.
- `usbipd-win` can forward a USB device into WSL2, but that detaches it from
  Windows entirely, and Bluetooth-over-usbip into BlueZ is not a supported path.
  Not worth attempting.
- Even if the adapter existed, Linux Chrome needs the experimental flag (§6
  above), so it would be the least representative platform to test on.

**The working setup is: run the dev server inside WSL2, open the page in Chrome on
Windows.** The WSL FAQ confirms this works out of the box: "WSL shares the IP
address of Windows... you can access any ports on localhost". So
`http://localhost:5173` in Windows Chrome reaches the SvelteKit dev server in
WSL2, `localhost` is a secure context, and Windows Chrome talks to the ESP32 over
the machine's real Bluetooth radio with no flags. Windows 10 1703+ / Chrome 70+
is the de-facto primary development target, with Android Chrome as the second.

---

## Implications for the protocol design

Concrete constraints the opcode/chunking design must respect.

1. **Chunking is mandatory and non-negotiable.** 512 bytes is a hard spec cap
   enforced in Blink; an ~800-byte animation can never be one write. (§2)

2. **The protocol must carry its own chunk-size negotiation, because the MTU is
   invisible to JS.** Either the firmware advertises its supported chunk size in a
   handshake response on `0xABF2`, or both sides hard-code a conservative
   constant. A safe floor is **20 bytes of payload** (ATT_MTU 23 − 3). A handshake
   is strongly preferred: it costs one round trip and removes a permanent unknown.
   Do not design anything that reads or assumes the MTU. (§2)

3. **Every chunk needs an explicit sequence number, and the last chunk needs an
   explicit end marker or a declared total length in the header.** Chunk framing
   cannot rely on write boundaries: an unacknowledged write that exceeds
   `ATT_MTU − 3` has no legal on-air encoding and its failure mode is expected to
   be silent. (§2, §3)

4. **Assume unacknowledged writes can be lost silently, with no error surfaced to
   JS.** `writeValueWithoutResponse()` resolving means "handed to the stack", not
   "delivered". There is no `bufferedAmount`, no drain event, no backpressure of
   any kind. The protocol therefore needs an **application-level ACK on `0xABF2`
   or `0xABF4`** — either per chunk, or a windowed/final ACK naming the highest
   contiguous sequence received — plus a client-side timeout and retransmit. A
   design that assumes writes arrive is a design that will fail intermittently and
   unreproducibly. (§3)

5. **Prefer making `0xABF1` WRITE (with response) as well as WRITE_NO_RESPONSE.**
   This is a firmware change and the main cross-project decision here. With-response
   writes give a real per-chunk ACK from the link layer for free and remove the
   need for application-level per-chunk ACKs. Cost is one round trip per chunk,
   bounded by the connection interval. Given the payload is ~800 bytes and
   uploads are user-initiated and infrequent, correctness should win over
   throughput. Keeping the no-response path as an option for a future bulk mode is
   fine — but then item 4 is mandatory. (§3)

6. **Serialize every GATT operation. The site is the queue.** One in-flight
   operation at a time, `await`ed, across the whole app — not per characteristic.
   Concurrent operations are permitted by spec to reject with `NetworkError`, and
   Chrome's own docs advise manual queueing. This means one shared operation
   queue/mutex in the web client, and the protocol must not require the page to
   read one characteristic while writing another. Every operation also needs a
   retry path, since `NetworkError` here is transient. (§3)

7. **Responses must be self-delimiting across notifications.** Ordering is
   guaranteed by the Bluetooth task source, but delivery is not. Every response
   chunk needs a sequence number and the set needs a total-count or terminator, so
   the client can detect a gap rather than silently reassemble a truncated
   response. Include a request/response correlation ID so a late notification from
   a timed-out request cannot be mistaken for a reply to the next one. (§4)

8. **Subscribe before you ask.** `startNotifications()` must resolve on `0xABF2`
   (and `0xABF4`, `0xABF5` as needed) before any request is written, since events
   are not delivered until then. On reconnect, re-subscribe and treat any
   in-flight exchange as lost — the spec calls the reconnect gap an "unavoidable
   risk that some notifications will be missed". Make every command idempotent or
   re-drivable, so a reconnect mid-upload can restart cleanly. (§4)

9. **No session resumption. Design for connect-per-session.** Persistent device
   permissions and `getDevices()` are behind two Chrome flags and off by default,
   so every page load starts from a user-gesture-gated chooser. Upload state must
   live in the page, and an interrupted upload restarts from scratch (or from an
   explicit resume opcode the firmware supports — worth considering given 800-byte
   payloads over 20-byte chunks is ~40 round trips). (§5)

10. **The protocol must not assume a fast link.** ~800 bytes at a 20-byte payload
    is ~40 chunks. With-response and a 30 ms connection interval, that is on the
    order of a second or more. All BLE I/O is on the main thread (`[Exposed=Window]`,
    no Worker access), so the UI needs a progress indicator and the protocol
    should expose enough per-chunk feedback to drive one. (§2, §5)

11. **Nothing about `0xABF0`–`0xABF5` is blocklisted, and 16-bit UUIDs are fine.**
    No UUID change is needed. Pass the numeric literals, not strings. Do ensure the
    ESP32 advertises `0xABF0` if the web client wants to filter on service UUID.
    Be aware the blocklist is server-updatable in Chromium, so this is worth
    re-checking if a connect ever starts failing with `SecurityError`. (§1)
