# A native phone app is a supported client

Status: accepted

The BLE protocol (`robo-cat-ears/docs/ble-protocol.md`) was written for two clients: the watch, which plays animations, and this web app, which manages them. §13 ruled out "iOS support and a native phone app", because every iOS browser uses WKWebView, which has no Web Bluetooth. That left iPhone owners with no way to reach the ears, and Android owners with only a browser tab.

`robo-cat-ears-app`, a Flutter app for Android and iOS, is now a supported client of the protocol. It was decided on the [phone app parity with the watch](https://trello.com/c/QfT0bxox) wayfinding map. The app's own decisions live in `robo-cat-ears-app/docs/adrs/`.

## The decisions

**The phone is play-only, like the watch.** It runs the connect sequence (§6), `LIST`, and `PLAY`, and never sends `STORE` or `DELETE`. It also carries the watch's direct commands: built-in animations, lighting, calibration, and animation mode. Managing the store stays with the web app, so there is still exactly one authoring tool. §12.5 now reads: the ears own the store, the web app manages it, the watch and the phone play from it.

**The wire format doesn't change for it.** A Flutter client using `flutter_blue_plus` covers the whole contract as written (`robo-cat-ears-app/docs/research/flutter-blue-plus-ears-protocol.md`). `protocol_version` stays at 1.

**What the phone must honour that the other clients get for free:**

- **It never sends a long write.** iOS chooses its own MTU, so the phone chunks by `max_chunk_bytes` from `CAPABILITY` and never sends a write longer than that (§1.4).
- **Its key for the ears is its own.** Android exposes the ears' address, but iOS gives a per-phone UUID instead. The phone tags its cache with that key (§6). The serial (ADR 0002) is the only identifier it shares with the watch and this app.
- **It holds the ears only in the foreground.** The ears accept one client at a time and stop advertising while one is connected (§1.3). The phone disconnects when it goes to the background, so it never locks out the watch while nobody is looking at it (`robo-cat-ears-app/docs/adrs/0001-phone-holds-the-ears-only-in-the-foreground.md`).

**§13 keeps the web app on iOS out of scope.** WKWebView still has no Web Bluetooth. iOS users reach the ears through the phone app instead.

## Consequences

- The protocol now has three clients across four repos, and the version rule's premise still holds: every client is controlled, since the phone app ships from the same hands as the rest. A `protocol_version` bump now has to land in the phone app as well as the watch and this app.
- Future wire changes, such as the state read the phone app needs for lighting profiles, must keep the watch and this app working. Each goes through the protocol document first, as before.
- This app's upload flow is unchanged. A phone connected to the ears blocks this app from connecting, just as the watch does. The phone releases the ears when it goes to the background.
