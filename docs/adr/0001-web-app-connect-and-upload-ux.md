# Web-app connect-and-upload UX for the ears animation store

Status: accepted

The ears own a 16-slot animation store, reachable over Web Bluetooth through the `0x06 STORE`
opcode surface. This ADR settles how the web app exposes connecting to a pair of ears and putting an
animation on one. It was decided by building three structurally different variants against a fake
device and reacting to them; the prototype is on the throwaway branch `spike/connect-upload-ux`, and
the winning shape is "slot grid dialog".

**Connecting is global; uploading is a dialog that shows the device's real slots.** A persistent chip
in the app header owns the connection and its state; the animation detail page carries a single
"Send to my ears" button that opens a modal showing all 16 slots as a grid, with the device's actual
slot names read off it at connect time. The same dialog is the slot manager.

## The decisions

**Where connecting lives.** A chip in the global header, next to the theme toggle. It is the only
place that connects, and it doubles as the connection's status display. Web Bluetooth's
`requestDevice` needs transient user activation, so nothing can open a device picker on load — the
chip makes the required gesture into an ordinary, always-available affordance rather than something
buried inside each upload flow. Rejected: connecting per-upload at the point of use (prototype
variant C), which puts a device-pairing step inside what should be a two-click action and gives the
connection nowhere to live between uploads.

**Connected state.** One module-level singleton owns the device, the capability record and the slot
list. It survives SPA navigation and does not survive a reload — browsers do not persist device
permission without two Chrome flags we will not ask users to set, so **connect-per-session** is the
contract, and the UI says so in plain words rather than pretending otherwise. Every GATT operation
serializes app-wide through this one object, which is what the protocol requires (concurrent
operations may reject with `NetworkError`); all of it is main-thread only.

**Choosing a slot.** The dialog shows the device's real occupancy — the mandated connect sequence
already reads `LIST`, so there is no reason to guess. The default target is the slot already holding
this animation (matched on the 16-byte `Animation.id`), else the first empty slot. Rejected: silently
taking the next free slot with no grid, which hides the one piece of state the user most needs
before overwriting something.

**Overwrite.** Inline in the dialog, not a second modal: the grid already shows what is in the slot,
so the warning names the occupant and the button reads "Replace slot N". `STORE` is unconditional and
atomic on the device, so there is nothing to undo and the copy does not promise otherwise.

**Uploading an animation the user does not own.** Allowed, from any animation detail page the user
can view. The slot stores the **animation's** `Animation.id` and name, not the uploader's — slot
identity is the animation, so a non-owner upload is indistinguishable on-device from an owner's, and
that is correct. Whether a gallery *card* also gets a direct upload affordance is **not** settled
here; the prototype only covered the detail page. Default to no, so the gallery stays a browsing
surface.

**Eligibility.** The send button is **visible but disabled, with the reason on the page** — not
hidden, and not attempted-and-nacked. A missing button is a mystery; a disabled one with "Your ears
hold 64 keyframes; this one has 71" is an answer. The reason renders as page text rather than only a
tooltip, because a tooltip never opens on a touch device. The limits checked client-side
(`max_keyframes` 64, robot slug) are fixed by protocol version 1 and deliberately absent from the
wire, so the client knows them from the version it agreed to. Rejected: letting the ears nack
(variant C) — fewer places to drift, but it spends a full chunked transfer to learn something the
client already knew, and `TOO_LARGE` is worse copy than the specific number.

**Names.** The device takes **32 bytes**; the web app allows **100 characters**. The upload dialog
offers an editable name field pre-filled with the truncated web name, plus a live byte counter.
The user chooses what the ears call it rather than discovering later that it was silently chopped.
Truncation never splits a UTF-8 code point. Rejected: capping `NAME_MAX` at 32 bytes, which is a
migration that constrains the gallery for the device's sake.

**Progress.** Per-frame, against the real chunk count derived from `max_chunk_bytes` — a bar on the
target slot in the grid plus "frame N of M". A worst-case store is 2 frames, so this is brief by
design; it exists so a slow link does not look like a hang.

**Failure.** Each of the 11 status codes maps to one sentence in the second person saying what to do
next, with the code shown as secondary text for bug reports. Codes a correct client cannot provoke
still get copy, because they fire exactly when the client is the broken thing.

**Timeout is an unknown outcome, never a failure.** On the 5 s request timeout the UI says "Your ears
went quiet. Checking whether it saved…", re-reads `LIST`, and reports what actually happened. It
never assumes failure and never silently retries — the ears may well have committed, and a blind
retry could overwrite a slot the user did not choose. (This settles the "what the web app shows
during an unknown-outcome timeout" question left open by the opcode-surface decision.)

**Unsupported browsers explain themselves.** On iOS Safari and Firefox `navigator.bluetooth` is
simply absent. The chip stays visible reading "Ears need Chrome", and the detail page says which
browsers work and that iPhone and iPad do not. Rejected: hiding the entry point, which erases the
feature for the users most likely to be confused about why it is missing.

**Managing the device.** The web app gets **delete** and **play-by-slot** against the store, in the
same dialog. It does **not** get rename or read-back: both are reserved-unimplemented opcodes that
answer `UNSUPPORTED_OPCODE`, and a rename is just a `STORE` with a different name for anything the
web app uploaded.

## Consequences

- A watch-authored slot (zero `Animation.id`) can be deleted and played from the web app but never
  renamed, because renaming needs a payload the web app does not have and read-back does not exist.
  The UI labels these "made on the ears".
- Because the store is only read at connect time and there is no live invalidation, the slot list can
  go stale if the ears are changed by another client mid-session. Acceptable: the ears accept one
  client at a time and stop advertising while connected.
- The connection is app-wide state but only one page uses it today. If a second upload surface is
  added later (a gallery card, `/my`), it consumes the same singleton and needs no new connect flow.
