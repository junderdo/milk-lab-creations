# How the ears derive a stable, hashed device serial

Research ticket:
[Research: how the ears derive a stable hashed serial](https://trello.com/c/9ymc6Nrg/92-research-how-the-ears-derive-a-stable-hashed-serial).

The `Device` model in [`docs/spec/profile-and-devices.md`](../spec/profile-and-devices.md) is keyed on
`(ownerId, serial)` and stores the serial as bare `TEXT`, lowercase hex, with the width pinned in Zod
as `SERIAL_HEX_CHARS`. That constant is the number this note exists to settle, together with what the
firmware must actually compute to produce it.

Everything below is sourced from the ESP-IDF tree the firmware builds against, the rendered ESP-IDF
documentation for that version, Espressif chip documentation, and the firmware's own code. Where
Espressif is silent, that is stated as a finding rather than filled in.

> **The decision this note fed is recorded in
> [ADR-0002 — How a pair of ears is identified](../adr/0002-how-a-pair-of-ears-is-identified.md).**
> This note is a dated snapshot of what the sources said on 2026-08-16 and is not revised to stay
> true; the ADR is what binds.

> **One recommendation here was overridden.** §7 proposes omitting the six bytes when the read fails;
> card 95 chose a fixed-width record with a reserved all-zero value instead, because omission makes the
> record's length non-monotone and destroys the stable offsets that later appends depend on. See §7.2
> of [`docs/spec/profile-and-devices.md`](../spec/profile-and-devices.md). Everything else below stands.

## Sources

- Firmware: local checkout `/home/jeffu/personal/projects/robo-cat-ears`
  (remote https://github.com/junderdo/robo-cat-ears) at commit
  `3e2ad50dfaddf39aec3d6cab003078a87e90b999`.
- ESP-IDF **v5.5.2**, local install `~/esp/v5.5.2/esp-idf`, matching
  [`espressif/esp-idf` tag `v5.5.2`](https://github.com/espressif/esp-idf/tree/v5.5.2). Confirmed by
  `CONFIG_IDF_INIT_VERSION="5.5.2"` (`sdkconfig:300`) and `"idf_path": "/home/jeffu/esp/v5.5.2/esp-idf"`
  in `build/project_description.json`.
- Rendered docs pinned to that version:
  [ESP-IDF v5.5.2 programming guide](https://docs.espressif.com/projects/esp-idf/en/v5.5.2/).
- Chip documentation, all fetched from espressif.com on 2026-08-16 (versions matter — cited inline):
  ESP8684 TRM v1.3, ESP32-C3 TRM v1.4, ESP32-S3 TRM v1.8; ESP8684 Series Datasheet v2.3 (2026-01-06),
  ESP32-C3 Series Datasheet v2.4 (2026-05-06), ESP32-S3 Series Datasheet v2.2 (2026-03-05).
- The wire protocol contract:
  [`robo-cat-ears/docs/ble-protocol.md`](https://github.com/junderdo/robo-cat-ears/blob/main/docs/ble-protocol.md)
  and this repo's [`docs/research/web-bluetooth-abf0.md`](./web-bluetooth-abf0.md).

---

## 1. What the firmware does today

**Nothing.** There is no device identifier anywhere in the firmware.

- Every unit advertises the same name: `#define SAMPLE_DEVICE_NAME "ROBO_CAT_EARS"` (`main/ble.c:40`),
  passed to `esp_ble_gap_set_device_name` (`main/ble.c:612`). Two pairs of ears are
  indistinguishable to a scanning client.
- Nothing in `main/` calls `esp_read_mac`, `esp_efuse_mac_get_default`, or any eFuse API. A grep for
  `mac`/`efuse`/`serial` across `main/` returns only serialization helpers for animations and
  calibration.
- The `CAPABILITY` response is assembled in one place — `respond_capability` in `main/store.c:92`:

  ```c
  static void respond_capability(uint8_t corr)
  {
      uint16_t chunk_bytes = max_chunk_bytes();
      const uint8_t record[] = {
          STORE_PROTOCOL_VERSION,
          STORE_SLOT_COUNT,
          (uint8_t)(chunk_bytes >> 8),
          (uint8_t)(chunk_bytes & 0xff),
      };
      respond(corr, STORE_STATUS_OK, record, sizeof(record));
  }
  ```

  Four bytes, matching `[protocol_version:u8][slot_count:u8][max_chunk_bytes:u16]` in §8 of the BLE
  protocol doc.

Two properties of the existing protocol make appending a serial cheap:

- **The extensibility rule already permits it.** §8: "clients MUST ignore trailing bytes they do not
  understand. Appending a field is then non-breaking … Additive changes do not bump the version at
  all." A serial appended to the capability record therefore does **not** bump
  `STORE_PROTOCOL_VERSION`.
- **The deployed web client already tolerates it.** `parseCapability`
  (`apps/web/src/lib/ears/protocol.ts:177`) checks `payload.length < CAPABILITY_BYTES` and reads
  fixed offsets; trailing bytes are ignored, not rejected. No client change is required for the
  firmware change to land safely — only to _use_ the new field.

**Targets.** The repo carries `sdkconfig.defaults.esp32c2`, `sdkconfig.defaults.esp32c3` and
`sdkconfig.defaults.esp32s3`, each pinning `CONFIG_IDF_TARGET`. The checked-in `sdkconfig` is
currently `esp32c3`. The template README's "Supported Targets" table lists many more chips, but that
table is inherited verbatim from the Espressif BLE-SPP example (it sits below the line
"BELOW THIS IS THE ORIGINAL README FROM TEMPLATE GATT SERVER SPP PROJECT") and is not a statement
about this project. **The real target list is ESP32-C2, ESP32-C3, ESP32-S3.**

The BLE stack is **Bluedroid**, not NimBLE: `CONFIG_BT_BLUEDROID_ENABLED=y` /
`# CONFIG_BT_NIMBLE_ENABLED is not set` (`sdkconfig:562-563`), and `main/ble.c:897-920` runs
`esp_bt_controller_init` → `esp_bluedroid_init_with_cfg` → `esp_bluedroid_enable`.

---

## 2. eFuse MAC semantics across the three targets

### 2.1 What Espressif states, verbatim

The MAC section of the programming guide is one shared source file rendered per target
(`docs/en/api-reference/system/misc_system_api.rst` at v5.5.2). The load-bearing sentences are:

> In ESP-IDF, the MAC addresses for the various network interfaces are calculated from a single
> **base MAC address**. By default, the Espressif base MAC address is used. This base MAC address is
> pre-programmed into the {IDF_TARGET_NAME} eFuse in the factory during production.

> The default base MAC is pre-programmed by Espressif in eFuse {IDF_TARGET_BASE_MAC_BLOCK}.

([ESP-IDF v5.5.2, Miscellaneous System APIs — MAC Address](https://docs.espressif.com/projects/esp-idf/en/v5.5.2/esp32c3/api-reference/system/misc_system_api.html#mac-address);
the same page exists per target for
[esp32c2](https://docs.espressif.com/projects/esp-idf/en/v5.5.2/esp32c2/api-reference/system/misc_system_api.html#mac-address)
and
[esp32s3](https://docs.espressif.com/projects/esp-idf/en/v5.5.2/esp32s3/api-reference/system/misc_system_api.html#mac-address).)

The same page also says, per target:

> {IDF_TARGET_NAME} comes pre-programmed with enough valid Espressif universally administered MAC
> addresses for all internal interfaces.

The Kconfig help text is where the word "universal" is defined:

> Configure the number of universally administered (by IEEE) MAC addresses.

(`components/esp_hw_support/port/esp32c3/Kconfig.mac`, and the C2 and S3 equivalents — identical
wording.)

The Technical Reference Manuals add that the block is factory-written and read-only to us:

| Chip               | TRM               | Block holding the factory MAC                | TRM sentence                                                                       |
| ------------------ | ----------------- | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| ESP32-C2 / ESP8684 | v1.3, Table 4.3-2 | **BLOCK2** (`EFUSE_SYS_DATA_PART1`, 48 bits) | "BLOCK2 cannot be programmed by users as it has been programmed at manufacturing." |
| ESP32-C3           | v1.4, Table 4.3-3 | **BLOCK1** (`EFUSE_MAC`, 48 bits)            | "BLOCK1 cannot be programmed by users as it has been programmed at manufacturing." |
| ESP32-S3           | v1.8, Table 5.3-3 | **BLOCK1** (`EFUSE_MAC`, 48 bits)            | "BLOCK1 cannot be programmed by users as it has been programmed at manufacturing." |

The C3 TRM describes the registers as read-only — "EFUSE_MAC_0 Stores the low 32 bits of MAC address.
(RO)" / "EFUSE_MAC_1 Stores the high 16 bits of MAC address. (RO)" — with the S3 TRM identical in
substance. This is the property the serial actually depends on: the value is burned before we ever
see the part and cannot be altered by our firmware, our tooling, or a user.

### 2.2 Espressif does not state per-chip uniqueness anywhere

This is the finding, and it is worth stating plainly rather than papering over.

Searched, and the word **"unique" does not appear** in connection with the MAC in any of them:

- **The programming guide.** The full MAC section of the v5.5.2 `misc_system_api` page, for all three
  targets, contains no occurrence of "unique".
- **The three datasheets** — ESP8684 Series Datasheet **v2.3** (2026-01-06), ESP32-C3 Series
  Datasheet **v2.4** (2026-05-06), ESP32-S3 Series Datasheet **v2.2** (2026-03-05). In all three, the
  only mention of a MAC address outside Wi-Fi-MAC/HMAC contexts is one identically worded glossary
  entry:

  > **eFuse** — A one-time programmable (OTP) memory which stores system and user parameters, such as
  > MAC address, chip revision number, flash encryption key, etc.

  There is no "48-bit MAC address" feature bullet and no uniqueness claim. (The only near-hit is the
  S3's unrelated `EFUSE_OPTIONAL_UNIQUE_ID` field.)

- **The three TRM eFuse chapters.** None uses the word "unique" about the MAC.

Also worth noting: there is no `esp32-c2_datasheet_en.pdf` on espressif.com — the ESP8684 datasheet
is the only ESP32-C2 datasheet.

So the strongest printed wording is **"pre-programmed … in the factory during production"** plus
**"universally administered (by IEEE)"**. "Universally administered" is an IEEE term of art: the U/L
bit of the first octet is clear, meaning the address is drawn from an OUI-derived globally
administered space rather than a locally administered one. That is a statement about _which address
space the value comes from_, and it carries the strong implication that Espressif does not reissue
values — an OUI holder that duplicated addresses would be violating the assignment — but it is an
implication, not a printed guarantee with a defect rate attached.

Practical reading: uniqueness is as good as any MAC-based identifier ever is, and better than
anything we could invent, but it rests on Espressif's manufacturing discipline rather than on a
documented warranty. Design so that a duplicate is survivable (see §6.3), do not design so that a
duplicate is impossible.

### 2.3 The derivation table, and where the BLE MAC sits

From the same page, for all three targets (the table is emitted for every chip except ESP32-S2):

| Interface     | MAC Address (4 universally administered, default) | MAC Address (2 universally administered)   |
| ------------- | ------------------------------------------------- | ------------------------------------------ |
| Wi-Fi Station | `base_mac`                                        | `base_mac`                                 |
| Wi-Fi SoftAP  | `base_mac`, +1 to the last octet                  | Local MAC (derived from Wi-Fi Station MAC) |
| Bluetooth     | `base_mac`, **+2 to the last octet**              | `base_mac`, **+1 to the last octet**       |
| Ethernet      | `base_mac`, +3 to the last octet                  | Local MAC (derived from Bluetooth MAC)     |

The source agrees exactly (`components/esp_hw_support/mac_addr.c` at v5.5.2):

```c
#if CONFIG_ESP_MAC_UNIVERSAL_MAC_ADDRESSES_FOUR
#define MAC_ADDR_UNIVERSE_BT_OFFSET 2
#else
#define MAC_ADDR_UNIVERSE_BT_OFFSET 1
#endif
```

```c
case ESP_MAC_BT:
    memcpy(mac, base_mac_addr, 6);
    #if SOC_WIFI_SUPPORTED
        // If the chips do not have wifi module, the mac address do not need to add the BT offset
        mac[5] += MAC_ADDR_UNIVERSE_BT_OFFSET;
    #endif
    break;
```

**All three of our targets default to FOUR**, so the BLE MAC is `base_mac + 2` in the last octet on
every one of them:

| Target   | Kconfig                           | Default                                        | ⇒ BT offset |
| -------- | --------------------------------- | ---------------------------------------------- | ----------- |
| ESP32-C2 | `ESP32C2_UNIVERSAL_MAC_ADDRESSES` | `default ESP32C2_UNIVERSAL_MAC_ADDRESSES_FOUR` | +2          |
| ESP32-C3 | `ESP32C3_UNIVERSAL_MAC_ADDRESSES` | `default ESP32C3_UNIVERSAL_MAC_ADDRESSES_FOUR` | +2          |
| ESP32-S3 | `ESP32S3_UNIVERSAL_MAC_ADDRESSES` | `default ESP32S3_UNIVERSAL_MAC_ADDRESSES_FOUR` | +2          |

The offset is **not** a chip property. It is a **build-configuration** property, switchable to +1 by
one menuconfig choice, and the guard `#if SOC_WIFI_SUPPORTED` means a Wi-Fi-less chip (ESP32-H2) gets
no offset at all. This is the single strongest argument in this note for not deriving the serial from
the BLE MAC — see §3.

### 2.4 ESP32-C2 is genuinely different, in three ways

**(a) The factory MAC is in a different eFuse block, and it shares that block with analog
calibration data.** From `components/efuse/esp32c2/esp_efuse_table.csv` at v5.5.2:

```
USER_DATA,             EFUSE_BLK1,   0,  88, [] User data block
USER_DATA.MAC_CUSTOM,  EFUSE_BLK1,   0,  48, [MAC_CUSTOM CUSTOM_MAC] Custom MAC address
MAC,                   EFUSE_BLK2,  40,   8, [MAC_FACTORY] MAC address
…
WAFER_VERSION_MINOR,   EFUSE_BLK2,  48,   4, [] WAFER_VERSION_MINOR
OCODE,                 EFUSE_BLK2,  62,   7, [] OCode
TEMP_CALIB,            EFUSE_BLK2,  69,   9, [] Temperature calibration data
ADC1_INIT_CODE_ATTEN0, EFUSE_BLK2,  78,   8, [] ADC1 init code at atten0
```

On ESP32-C3 and ESP32-S3 the layout is the conventional one — `MAC` in `EFUSE_BLK1`,
`USER_DATA.MAC_CUSTOM` at bit 200 of `EFUSE_BLK3`
(`components/efuse/esp32c3/esp_efuse_table.csv:147-152,191` and
`components/efuse/esp32s3/esp_efuse_table.csv:183-188,238`). C2 inverts this: factory MAC in BLK2,
custom MAC in BLK1.

This is corroborated by the ESP8684 TRM v1.3 Table 4.3-2, which lists `EFUSE_CUSTOMED_MAC` (88 bits,
"Customize MAC address or user data") in **BLOCK1** and the MAC in **BLOCK2**
(`EFUSE_SYS_DATA_PART1`) — the mirror image of C3/S3.

**This makes the rendered ESP32-C2 documentation wrong, and it was confirmed on the rendered page.**
The docs source begins with the substitution `{IDF_TARGET_BASE_MAC_BLOCK: default="BLK1",
esp32="BLK0"}`, and the ESP32-C2 page duly renders:

> The default base MAC is pre-programmed by Espressif in eFuse **BLK1**.

> This loads the MAC address from eFuse **BLK3**.

Both are wrong for ESP32-C2. BLK1 on C2 is the user-data block that holds the _custom_ MAC — as the
espefuse tool's own sample output for esp32c2 shows (`[01] BLOCK1 is empty, will burn the new value`,
[Burn Custom Mac — ESP32-C2](https://docs.espressif.com/projects/esptool/en/latest/esp32c2/espefuse/burn-custom-mac-cmd.html)) —
and BLK3 on C2 is `KEY0`, the flash-encryption / secure-boot key block. The same page's note that
"BLK3 uses RS-coding during burning" is mis-targeted too, though the RS-coding constraint itself does
apply to C2's BLOCK1.

The identical sentence is **correct** for ESP32-C3 and ESP32-S3, whose TRMs both place `EFUSE_MAC` in
BLOCK1. This is a C2-specific substitution bug. Treat the eFuse table CSV and the TRM as
authoritative over the prose for C2.

**(b) ESP-IDF itself flags the C2 MAC configuration as unverified.** The last lines of
`components/esp_hw_support/port/esp32c2/Kconfig.mac`:

```
config ESP32C2_UNIVERSAL_MAC_ADDRESSES
    # TODO: check ESP32-C2 mac address WIFI-4134
    int
    default 2 if ESP32C2_UNIVERSAL_MAC_ADDRESSES_TWO
    default 4 if ESP32C2_UNIVERSAL_MAC_ADDRESSES_FOUR
```

That TODO with an internal Jira key appears on **no other target's** `Kconfig.mac`. Espressif has an
open internal item against whether ESP32-C2 really has four universally administered MAC addresses,
and it has been carried forward as far as v5.5.2. It does not cast doubt on the _base_ MAC — only on
how many derived addresses may legitimately be spent from it. Another reason to hash the base MAC and
never a derived one.

**(c) C2 has a `CUSTOM_MAC_USED` flag that the MAC code never reads.** `esp_efuse_table.csv:76`:

```
CUSTOM_MAC_USED,  EFUSE_BLK0,  58,  1, [ENABLE_CUSTOM_MAC] True if MAC_CUSTOM is burned
```

It exists only on ESP32-C2 (grep across `components/efuse/*/esp_efuse_table.csv` at v5.5.2 finds it
nowhere else), and `mac_addr.c` never consults it — `get_efuse_mac_custom` decides emptiness by
testing whether all 48 bits are zero. The espefuse `burn-custom-mac` page for esp32c2 also notes that
where encoding constraints bite, "The correct way is to contact Espressif to order chips with
`CUSTOM_MAC` pre-burned from the factory"
([esptool, Burn Custom Mac — ESP32-C2](https://docs.espressif.com/projects/esptool/en/latest/esp32c2/espefuse/burn-custom-mac-cmd.html)).
The existence of a dedicated "custom MAC in use" flag on C2 and nowhere else is circumstantial
evidence that C2 is the part Espressif expects customers to re-MAC. It is not evidence that C2 ships
without a factory MAC, and no Espressif document states that it does.

The ESP8684 TRM also names the BLOCK0 flag directly: `EFUSE_CUSTOM_MAC_USED` — "Enable customized MAC
writing". Between that flag, the dedicated 88-bit `EFUSE_CUSTOMED_MAC` block, and the espefuse page's
advice to "contact Espressif to order chips with `CUSTOM_MAC` pre-burned from the factory", it is
clear that re-MACing is an _expected_ C2 workflow in a way it is not on C3/S3. That is inference from
the shape of the tooling, not an Espressif statement.

**What could not be established:** no Espressif document reviewed states a defect rate, a uniqueness
warranty, or any circumstance under which a production ESP32-C2/C3/S3 ships with an unset or
duplicated factory MAC. The C2 "ships without a factory MAC" hypothesis is **not established** —
neither confirmed nor denied by anything found. Absence of a documented failure mode is not the same
as a documented guarantee, and this note does not claim otherwise.

---

## 3. `esp_efuse_mac_get_default` vs `esp_read_mac`

Both are declared in
[`components/esp_hw_support/include/esp_mac.h`](https://github.com/espressif/esp-idf/blob/v5.5.2/components/esp_hw_support/include/esp_mac.h)
and implemented in
[`components/esp_hw_support/mac_addr.c`](https://github.com/espressif/esp-idf/blob/v5.5.2/components/esp_hw_support/mac_addr.c).

| Call                                       | Returns                                        | Affected by `esp_base_mac_addr_set`? | Affected by the universal-MAC-count Kconfig? |
| ------------------------------------------ | ---------------------------------------------- | ------------------------------------ | -------------------------------------------- |
| `esp_efuse_mac_get_default(mac)`           | the **factory** MAC read straight out of eFuse | **No**                               | **No**                                       |
| `esp_read_mac(mac, ESP_MAC_EFUSE_FACTORY)` | identical to the above                         | No                                   | No                                           |
| `esp_read_mac(mac, ESP_MAC_BASE)`          | the base MAC — factory MAC _unless_ overridden | **Yes**                              | No                                           |
| `esp_base_mac_addr_get(mac)`               | `esp_read_mac(mac, ESP_MAC_BASE)` verbatim     | Yes                                  | No                                           |
| `esp_read_mac(mac, ESP_MAC_BT)`            | base MAC **+1 or +2** in the last octet        | Yes                                  | **Yes**                                      |

Documented as:

> `esp_efuse_mac_get_default()` — Return base MAC address which is factory-programmed by Espressif in
> EFUSE.

> `esp_read_mac()` — This function first get base MAC address using `esp_base_mac_addr_get()`. Then
> calculates the MAC address of the specific interface requested.

([ESP-IDF v5.5.2 API reference, esp_mac.h](https://docs.espressif.com/projects/esp-idf/en/v5.5.2/esp32c3/api-reference/system/misc_system_api.html#api-reference))

The source confirms the split. `esp_efuse_mac_get_default` is a thin wrapper over
`get_efuse_factory_mac`, which reads `ESP_EFUSE_MAC_FACTORY` and — on ESP32 only — validates a CRC.
`esp_read_mac` goes through `s_mac_table`, honours anything previously installed by
`esp_iface_mac_addr_set`/`esp_base_mac_addr_set`, and for `ESP_MAC_BT` applies the offset from §2.3.

**Does the BLE MAC differ from the base MAC, and by how much?** Yes, on all three targets, by **+2 in
the last octet** with the default `…UNIVERSAL_MAC_ADDRESSES_FOUR`, and by **+1** if the build is
switched to `…_TWO`. Note the addition is a plain `uint8_t` add with wraparound (`mac[5] += 2`), not
a 48-bit increment — a base MAC ending `…:FE` yields a BLE MAC ending `…:00`, sharing the first five
octets. That wraparound is a real (if rare) reason two derived addresses could alias in ways the base
addresses do not.

**Conclusion for the serial: hash the factory MAC via `esp_efuse_mac_get_default`.** It is the only
one of these reads that is invariant to sdkconfig, to any future `esp_base_mac_addr_set` call, and to
the C2 `WIFI-4134` question. A serial that changes when someone flips a menuconfig choice is not a
serial; it silently orphans every registered `Device` row.

**A note on why the serial has to be on the wire at all.** Web Bluetooth never exposes the peer's
Bluetooth address — `BluetoothDevice` has `id` and `name` and nothing else, and `id` is an
origin-scoped opaque string, not a hardware address (see
[`web-bluetooth-abf0.md`](./web-bluetooth-abf0.md) §5 on the absence of session resumption). Even if
the BLE MAC were the identifier we wanted, the web client could not read it. The device must tell us.

---

## 4. Hash primitive available without adding a dependency

### 4.1 All three targets have a hardware SHA accelerator

**The silicon, per the Technical Reference Manuals.**

ESP8684 TRM **v1.3**, ch. 16 "SHA Accelerator (SHA)", p. 295
([PDF](https://www.espressif.com/sites/default/files/documentation/esp8684_technical_reference_manual_en.pdf)):

> ESP8684 integrates an SHA accelerator, which is a hardware device that speeds up SHA algorithm
> significantly, compared to SHA algorithm implemented solely in software. […] ESP8684's SHA
> accelerator supports: • Hash algorithms introduced in FIPS PUB 180-4 Spec. – SHA-1 – SHA-224 –
> SHA-256 • Two working modes – Typical SHA – DMA-SHA

ESP32-C3 TRM **v1.4**, ch. 21, p. 513
([PDF](https://www.espressif.com/sites/default/files/documentation/esp32-c3_technical_reference_manual_en.pdf)):

> • The following hash algorithms introduced in FIPS PUB 180-4 Spec. – SHA-1 – SHA-224 – SHA-256
> • Two working modes – Typical SHA – DMA-SHA

ESP32-S3 TRM **v1.8**, ch. 18, p. 843
([PDF](https://www.espressif.com/sites/default/files/documentation/esp32-s3_technical_reference_manual_en.pdf)):

> • All the hash algorithms introduced in FIPS PUB 180-4 Spec. – SHA-1 – SHA-224 – SHA-256 – SHA-384
> – SHA-512 – SHA-512/224 – SHA-512/256 – SHA-512/t • Two working modes – Typical SHA – DMA-SHA

**What ESP-IDF exposes**, from the v5.5.2 SoC capability headers:

| Capability                                                         | esp32c2           | esp32c3  | esp32s3  |
| ------------------------------------------------------------------ | ----------------- | -------- | -------- |
| `SOC_SHA_SUPPORTED`                                                | 1                 | 1        | 1        |
| `SOC_SHA_SUPPORT_SHA1` / `SHA224` / `SHA256`                       | 1                 | 1        | 1        |
| `SOC_SHA_SUPPORT_SHA384` / `512` / `512_224` / `512_256` / `512_T` | —                 | —        | 1        |
| `SOC_SHA_SUPPORT_DMA`                                              | **commented out** | 1        | 1        |
| `SOC_SHA_GDMA` / `SOC_SHA_DMA_MAX_BUFFER_SIZE`                     | —                 | 1 / 3968 | 1 / 3968 |
| `SOC_SHA_SUPPORT_RESUME`                                           | 1                 | 1        | 1        |

([esp32c2](https://github.com/espressif/esp-idf/blob/v5.5.2/components/soc/esp32c2/include/soc/soc_caps.h#L201),
[esp32c3](https://github.com/espressif/esp-idf/blob/v5.5.2/components/soc/esp32c3/include/soc/soc_caps.h#L283),
[esp32s3](https://github.com/espressif/esp-idf/blob/v5.5.2/components/soc/esp32s3/include/soc/soc_caps.h#L442))

**A correction worth recording, because the obvious reading is wrong.** ESP32-C2 is _not_ a chip
without SHA DMA — the TRM above documents DMA-SHA on ESP8684 silicon. It is **ESP-IDF that disables
it**, deliberately, and says so in the header:

```c
/* Due to very limited availability of the DMA channels, DMA support for the SHA peripheral is disabled */
// #define SOC_SHA_SUPPORT_DMA             (1)
```

So on C2 under IDF, SHA always runs in block (CPU-fed) mode. This is a software policy about a scarce
GDMA channel, not a silicon limitation, and it could change in a future IDF.

**SHA-256 is the intersection.** It is the only SHA-2 mode all three accelerate — SHA-384/512 exist
only on S3 and would fall back to software on C2 and C3. It is also what we want anyway. The DMA
question is irrelevant at our input size: a 6-byte message is a single 64-byte padded block, so the
block-at-a-time path is what runs on all three regardless (setting up DMA for one block would be
slower).

### 4.2 The API to call, and what it costs to link

Three candidates, in decreasing order of "should we use this":

**mbedTLS `mbedtls_sha256` — recommended.** ESP-IDF ships a hardware-backed mbedTLS port. The knob
is `CONFIG_MBEDTLS_HARDWARE_SHA`, which `components/mbedtls/Kconfig` declares `default y` for any
chip with `SOC_SHA_SUPPORTED`, and which is already on in the firmware's own config:
`CONFIG_MBEDTLS_HARDWARE_SHA=y` (`sdkconfig:1842`). It works by swapping the port implementations
into `mbedcrypto`:

```cmake
if(CONFIG_MBEDTLS_HARDWARE_SHA)
    target_sources(mbedcrypto PRIVATE "${COMPONENT_DIR}/port/sha/${SHA_PERIPHERAL_TYPE}/esp_sha256.c" …)
endif()
```

([`components/mbedtls/CMakeLists.txt`](https://github.com/espressif/esp-idf/blob/v5.5.2/components/mbedtls/CMakeLists.txt);
`SHA_PERIPHERAL_TYPE` is `core` for all three of our targets — only ESP32-classic uses
`parallel_engine`.) The port is `MBEDTLS_SHA256_ALT`, so **the API you call is the ordinary
`mbedtls/sha256.h` one** — identical symbol names hardware or software.

**The build-system detail, which has a trap in it.** Ordinarily "the component named `main` is
special because it automatically requires all other components in the build"
([build system guide, v5.5.2](https://docs.espressif.com/projects/esp-idf/en/v5.5.2/esp32c3/api-guides/build-system.html)),
so `main` could include `mbedtls/sha256.h` with no `REQUIRES` change. **But this project sets
`idf_build_set_property(MINIMAL_BUILD ON)`** in its top-level `CMakeLists.txt`, and the same guide
says of that mode:

> when using the `MINIMAL_BUILD` build property, ensure that all required components are specified in
> the `REQUIRES` or `PRIV_REQUIRES` argument during component registration.

Under `MINIMAL_BUILD` the build contains only the common components plus `main`'s dependency closure.
mbedTLS happens to be inside that closure today — `components/bt/CMakeLists.txt` lists `mbedtls` in
`bt_priv_requires` (line 951), and `build/project_description.json` confirms `components/mbedtls`
among `build_component_paths` — but that is a _private_ requirement of a component we merely depend
on, which is exactly the kind of accident that stops being true after an unrelated change.
**Add `mbedtls` to `main`'s `PRIV_REQUIRES` explicitly.** One word, no new component pulled in, only
the SHA-256 object code itself.

**`esp_sha()` — works, is not the recommended entry point, and buys nothing.** At v5.5.2 the real
header is
[`components/mbedtls/port/include/sha/sha_core.h`](https://github.com/espressif/esp-idf/blob/v5.5.2/components/mbedtls/port/include/sha/sha_core.h)
(the older `sha_dma.h` and `sha_block.h` are now one-line shims that just `#include "sha/sha_core.h"`).
Its own comments steer callers away:

> **@note** If you're looking for a SHA API to use, try mbedtls component `mbedtls/shaXX.h`. That API
> supports hardware acceleration.

> **@note** It is not necessary to lock any SHA hardware before calling this function, thread safety
> is managed internally.

`port/include` _is_ a public `INCLUDE_DIRS` entry of the mbedtls component, so it compiles. But there
is no generated API-reference page for it, and the v5.5 migration guide documents a **breaking change
to `esp_sha_block()`/`esp_sha_dma()` between minor releases** — they "used to set the SHA mode
internally" and now "you must explicitly set the SHA mode before invoking them"
([v5.5 security migration guide](https://docs.espressif.com/projects/esp-idf/en/v5.5.2/esp32c3/migration-guides/release-5.x/5.5/security.html)) —
which is the behaviour of a supported-but-undocumented API, not a stable one. Decisively:
`esp_sha()` is itself implemented as a wrapper that calls
`mbedtls_sha256_init/starts/update/finish` (`components/mbedtls/port/sha/esp_sha.c`). There is no
cheaper path hiding behind it. Note also that `esp_sha_dma` is `#if SOC_SHA_SUPPORT_DMA`-guarded and
therefore **not even declared on C2**.

**ROM SHA — reject.** `ets_sha_*` exists for all three targets
(`components/esp_rom/esp32c2/include/esp32c2/rom/sha.h` and the c3/s3 equivalents), and the public
type `esp_sha_type` is literally a typedef of the ROM's enum (`hal/sha_types.h:20`:
`typedef enum SHA_TYPE esp_sha_type;`). There is no `esp_rom_sha*` wrapper — the symbols are raw
`ets_*`, Espressif's internal-ROM naming convention. No primary source declares them public or
stable, and critically **they take no crypto lock**, so calling them concurrently with mbedTLS
SHA/AES/HMAC would corrupt shared peripheral state. Reject.

**Cost.** RAM: `mbedtls_sha256_context` in the accelerated port is
`uint32_t total[2]; uint32_t state[8]; unsigned char buffer[64]; int first_block; esp_sha_type mode;
esp_sha256_state sha_state;` — **116 bytes** (8 + 32 + 64 + 4 + 4 + 4), on the stack, transiently.
(`components/mbedtls/port/include/sha256_alt.h`, the `SOC_SHA_SUPPORT_DMA || SOC_SHA_SUPPORT_RESUME`
branch, which is the one all three targets take.)

Time: **no Espressif-published benchmark for a small or single-block input exists.** What Espressif
publishes is a CI throughput _floor_ for a 4 MB streaming hash, asserted in
`components/idf_test/include/<target>/idf_performance_target.h`:

| target  | `IDF_PERFORMANCE_MIN_SHA256_THROUGHPUT_MBSEC` |
| ------- | --------------------------------------------- |
| esp32c2 | 14                                            |
| esp32c3 | 90                                            |
| esp32s3 | 90                                            |

The C2 figure being 6× lower is precisely the disabled-DMA gap from §4.1. **These numbers do not
transfer to a 6-byte input**, where the cost is entirely fixed overhead — lock acquire, peripheral
clock enable, mode set, one block, digest readout, clock disable, lock release — and not throughput.
Reasoning from block count, this is microseconds, once. But that is an inference, not a measurement:
**if the number matters, measure it on hardware.** In any case the result should be computed once and
cached in a `static uint8_t[6]`, so the `CAPABILITY` path hashes nothing.

### 4.3 Why hash at all — and what hashing does not buy

Worth stating, because it is easy to over-claim.

Hashing the MAC gives an identifier that is **opaque, non-routable, and decoupled from the radio**.
The serial ends up in a database primary key, in client cache keys, in `localStorage` dismissal keys
(`milklab:device-dismissed:<userId>:<serial>`), and potentially in URLs. A raw MAC in all of those
places is a globally meaningful tracking identifier leaking out of a hobby project; a hash is not.

**It does not make the MAC confidential.** The input space is 48 bits, and in practice far smaller:
Espressif's OUIs are public and few, so the realistic candidate set is on the order of 2^32 or less.
An unsalted SHA-256 over that space is exhaustively searchable in seconds on commodity hardware. A
secret salt compiled into the firmware would raise the bar, but the firmware is readable off the
flash of any unit an attacker holds, so it raises it against remote attackers only. **Do not describe
the serial as anonymised.** Describe it as opaque.

A fixed, non-secret domain-separation prefix is still worth including — something like
`"milklab-ears-serial-v1"` prepended to the 6 MAC bytes. It costs nothing, it makes the derivation
self-describing in the code, and it means a future second identifier derived from the same MAC cannot
collide with this one by construction.

---

## 5. How many bytes of digest to keep

### 5.1 The maths

For `n` devices drawing from `N` equally likely values, the probability that at least two collide is
the birthday bound:

```
p(n, N) = 1 − exp( −n(n−1) / (2N) )        with   N = 2^(8w)   for a w-byte truncation
```

and for small `p` the useful approximation is `p ≈ n² / (2N)`.

Truncating a SHA-256 digest to its first `w` bytes is sound: SHA-256 output is
indistinguishable from uniform, so the truncated value is uniform over `2^(8w)` and the bound applies
directly.

### 5.2 The table

Probability of **at least one collision anywhere in a fleet of `n` devices**:

| Width        | Values `N`        | n = 100     | n = 1 000   | n = 10 000     | n = 100 000    | n = 1 000 000 |
| ------------ | ----------------- | ----------- | ----------- | -------------- | -------------- | ------------- |
| 4 B (8 hex)  | 2³² ≈ 4.29 × 10⁹  | 1.2 × 10⁻⁶  | 1.2 × 10⁻⁴  | **1.2 × 10⁻²** | **0.69**       | ≈ 1           |
| 5 B (10 hex) | 2⁴⁰ ≈ 1.10 × 10¹² | 4.5 × 10⁻⁹  | 4.5 × 10⁻⁷  | 4.5 × 10⁻⁵     | **4.5 × 10⁻³** | **0.37**      |
| 6 B (12 hex) | 2⁴⁸ ≈ 2.81 × 10¹⁴ | 1.8 × 10⁻¹¹ | 1.8 × 10⁻⁹  | 1.8 × 10⁻⁷     | 1.8 × 10⁻⁵     | 1.8 × 10⁻³    |
| 8 B (16 hex) | 2⁶⁴ ≈ 1.84 × 10¹⁹ | 2.2 × 10⁻¹⁶ | 2.7 × 10⁻¹⁴ | 2.7 × 10⁻¹²    | 2.7 × 10⁻¹⁰    | 2.7 × 10⁻⁸    |

### 5.3 Reading the table

**4 bytes is out.** A 1.2 % chance of a collision at ten thousand units is not a tail risk, it is a
schedule. Even at a realistic hobby scale of a few hundred it is only two orders of magnitude from
plausible, and the width is permanent — `SERIAL_HEX_CHARS` feeds a Zod regex and a DSQL primary key,
and DSQL has no `ALTER COLUMN … TYPE` (§2.2 of the spec). Choosing a width that only works at today's
scale means choosing to migrate later, in a database that cannot.

**5 bytes is defensible but odd.** 4.5 × 10⁻³ at 100 000 units is fine for this project, and 10 hex
characters is a perfectly readable serial. But it buys nothing over 6 that matters, and it is a
strange number to look at in a byte-oriented protocol.

**6 bytes is the recommendation.** Three independent reasons converge on it:

1. **It matches the input width.** The message being hashed is a 48-bit MAC. The input space _is_
   2⁴⁸. Keeping 48 bits of digest means the truncation discards no more resolution than the input
   ever had — the serial is as distinguishing as the thing it identifies.
2. **The numbers are comfortable at every scale this project will ever see.** 1.8 × 10⁻⁹ at a thousand
   units, 1.8 × 10⁻⁵ at a hundred thousand.
3. **12 lowercase hex characters is a good human artefact.** It is exactly a MAC's worth of digits, a
   length people already read aloud, type, and paste into support threads without it feeling like a
   UUID.

**8 bytes is the honest counter-argument, and it loses narrowly.** At 8 bytes the truncation is
effectively injective over a 48-bit input — collisions stop being a thing you compute at all. The
cost is 2 more wire bytes (irrelevant; see §5.4) and 4 more hex characters in every URL, cache key
and support conversation. The deciding factor is §5.5: a collision here is not a corruption event.
If it were, take the 8.

### 5.4 The wire cost is negligible either way

The capability record grows from 4 bytes to 10, and the whole `CAPABILITY` response frame from 9
bytes to 15 (5-byte header + payload). §10 of the BLE protocol doc budgets 504 payload bytes per
frame at the negotiated MTU of 512. The response remains **one frame** with two orders of magnitude
of headroom. There is no framing, chunking, or `max_chunk_bytes` consequence at 4, 6 or 8 bytes.

### 5.5 The collision that actually matters is much rarer than the table says

The `Device` primary key is `(ownerId, serial)`, not `serial`. Two physically distinct pairs of ears
that hash to the same serial are only a problem if **the same user owns both of them**. The table
above is the global birthday bound; the operationally relevant `n` is the size of one person's
collection — realistically one to five.

Substituting `n = 5` into the same formula gives ~3.6 × 10⁻¹⁴ at 6 bytes. The failure mode when it
does happen is also mild and non-destructive: the second device's `register` call returns `CONFLICT`
(§5 of the spec), and the user sees their already-registered ears under the wrong name. No data is
lost and nothing is silently mis-attributed across owner boundaries.

This is why 6 wins over 8. The global figure is a sanity check, not the requirement.

---

## 6. Reading the MAC without BLE, and what it costs

### 6.1 It is a memory-mapped register read, and nothing else

`esp_efuse_mac_get_default` → `get_efuse_factory_mac` → `esp_efuse_read_field_blob` →
`esp_efuse_utility_read_reg`, whose entire non-virtual body at v5.5.2 is:

```c
value = REG_READ(range_read_addr_blocks[blk].start + num_reg * 4);
```

([`components/efuse/src/esp_efuse_utility.c:277-288`](https://github.com/espressif/esp-idf/blob/v5.5.2/components/efuse/src/esp_efuse_utility.c))

The eFuse controller shadows the fuse array into readable registers at reset, so fetching a 48-bit
field is **two 32-bit loads plus bit shuffling**. No flash access, no NVS, no lock, no clock enable,
no interrupt, no blocking. `mac_addr.c` additionally caches the result in `s_mac_table`, so a second
call is a `memcpy`.

There is no dependency on the radio anywhere in that chain. `mac_addr.c` includes `esp_efuse.h`,
`esp_efuse_table.h`, `esp_rom_efuse.h`, `esp_mac.h`, `soc/soc_caps.h` and `sdkconfig.h` — nothing
from `components/bt`. **The call is safe and correct before `esp_bt_controller_init`, before
`esp_bluedroid_init`, and in fact before any subsystem init at all.**

One caveat worth naming: `esp_read_mac(mac, ESP_MAC_BT)` is _also_ safe to call before BLE init — the
"BT" in the type names an address-derivation rule, not a live radio. It is nonetheless the wrong call
for our purposes, for the reasons in §3.

**The hash half of the same question.** `mbedtls_sha256_init()` is a plain `memset` of the caller's
context; there is no subsystem to bring up. Locking and clock gating happen inside each operation —
`components/mbedtls/port/sha/core/sha.c`:

```c
/* Enable SHA peripheral and then lock it */
void esp_sha_acquire_hardware(void)
{
    /* Released when releasing hw with esp_sha_release_hardware() */
    esp_crypto_sha_aes_lock_acquire();
    esp_crypto_sha_enable_periph_clk(true);
}
```

The lock is a newlib `_lock_t` in `components/esp_security/src/esp_crypto_lock.c`
(`static _lock_t s_crypto_sha_aes_lock;`, commented "Single lock for SHA and AES, sharing a reserved
GDMA channel") — not a BT- or driver-owned resource. The TRMs name only RSA_DS and HMAC as peripherals
that contend for the SHA accelerator (ESP32-C3 TRM §21.3: "ESP32-C3's RSA Digital Signature Peripheral
(RSA_DS) and HMAC Accelerator (HMAC) modules also call the SHA accelerator. Therefore, users cannot
access the SHA accelerator when these modules are working."). The Bluetooth controller is not among
them.

**Stated honestly:** no primary source says in so many words "SHA may be called before
`esp_bt_controller_init()`." The positive evidence is indirect — no init function exists to call, the
lock is not BT-owned, and ESP-IDF itself runs SHA-256 during bootloader image verification long
before any BT controller exists. It is safe; it is an inference from the code rather than a
documented guarantee.

### 6.2 So the `CAPABILITY` response is free

The intended shape is: compute the serial once during startup (or lazily on first use), store it in a
`static uint8_t serial[6]`, and have `respond_capability` `memcpy` it into the record. The
`CAPABILITY` path then does zero eFuse reads, zero hashing, and zero allocation — it is the same
four-byte-literal construction it is today with six more bytes appended.

Even the unoptimised version — read eFuse and SHA-256 on every `CAPABILITY` — would be inside the
noise of a BLE round trip. Caching is for tidiness, not for performance.

### 6.3 Handle the error, do not assume success

`esp_efuse_mac_get_default` returns `esp_err_t` and can fail (`ESP_ERR_INVALID_CRC` on ESP32,
`ESP_ERR_INVALID_MAC`, or a propagated eFuse read error). The firmware must decide what a
`CAPABILITY` response looks like when it has no serial. The protocol already has the right answer
available: **omit the field**, leaving a 4-byte record. Clients ignore trailing bytes they do not
understand, and by symmetry a client that finds no serial bytes is in exactly the case §3.2 of the
spec already handles — "Firmware without a serial in `CAPABILITY` shows the registration affordance
visible-but-disabled". A zero-filled or all-`ff` sentinel would be worse: it is a value that looks
registrable and would let every failing unit register as the same device.

---

## 7. Recommendation

**The derivation, concretely:**

```c
uint8_t mac[6];
ESP_ERROR_CHECK_WITHOUT_ABORT(esp_efuse_mac_get_default(mac));   // factory eFuse MAC, not ESP_MAC_BT

static const char DOMAIN[] = "milklab-ears-serial-v1";
uint8_t digest[32];
mbedtls_sha256_context ctx;
mbedtls_sha256_init(&ctx);
mbedtls_sha256_starts(&ctx, 0);                 // 0 = SHA-256, not SHA-224
mbedtls_sha256_update(&ctx, (const unsigned char *)DOMAIN, sizeof DOMAIN - 1);
mbedtls_sha256_update(&ctx, mac, sizeof mac);
mbedtls_sha256_finish(&ctx, digest);
mbedtls_sha256_free(&ctx);

memcpy(serial, digest, 6);                      // first 6 bytes, big-endian order as produced
```

| Decision            | Choice                                                         | Because                                                                                                                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which MAC           | `esp_efuse_mac_get_default` (factory eFuse MAC)                | The only read invariant to sdkconfig, to `esp_base_mac_addr_set`, and to the +1/+2 BT offset (§2.3, §3)                                                                                                                                                  |
| Which hash          | mbedTLS SHA-256, `CONFIG_MBEDTLS_HARDWARE_SHA=y` (already set) | The only SHA-2 mode all three targets accelerate; mbedTLS is already linked via `bt`. Add `mbedtls` to `main`'s `PRIV_REQUIRES` — `MINIMAL_BUILD ON` makes the transitive availability an accident (§4.2)                                                |
| Domain separation   | Fixed non-secret prefix `"milklab-ears-serial-v1"`             | Free; makes the derivation self-describing and future-proof against a second derived identifier                                                                                                                                                          |
| Truncation          | **First 6 bytes (48 bits)**                                    | Matches the 48-bit input width; 1.8 × 10⁻⁹ at 1 000 units; the real per-owner risk is ~10⁻¹⁴ (§5)                                                                                                                                                        |
| Wire encoding       | **6 raw bytes appended to the `CAPABILITY` record**            | Record becomes `[protocol_version:u8][slot_count:u8][max_chunk_bytes:u16][serial:6]`, 10 bytes, still one frame. No `STORE_PROTOCOL_VERSION` bump — §8's extensibility rule covers it, and the deployed `parseCapability` already ignores trailing bytes |
| Client encoding     | Lowercase hex in the client, **not** on the wire               | 12 characters ⇒ `SERIAL_HEX_CHARS = 12`. ASCII hex on the wire would double the bytes and put a hex encoder in firmware for no gain                                                                                                                      |
| Missing/failed read | Omit the 6 bytes entirely                                      | Reuses the spec's existing "pre-serial firmware" path (§3.2). Never a sentinel value                                                                                                                                                                     |

**So: `SERIAL_HEX_CHARS = 12`, regex `/^[0-9a-f]{12}$/`.**

### Open questions

1. ~~**The watch is the third client.**~~ _Resolved._ `AnimationStoreService::onCapabilityResponse`
   in `components/services/animation_store_service/animation_store_service.cpp:271` guards on
   `_rx_length < 4` — a minimum, not an equality — and carries the comment "Anything past the four
   bytes we know is a later version's addition." The watch tolerates the appended serial without a
   change, so the addition is additive for all three clients.
2. **No measured cost.** Espressif publishes only a 4 MB streaming throughput floor (§4.2); nothing
   for a single-block input, and nothing was measured here. "Microseconds" is reasoning from block
   count, not observation. If the number matters, measure it.
3. **Uniqueness is implied, never stated.** Espressif documents the factory MAC as
   "pre-programmed … in the factory during production" and "universally administered (by IEEE)", and
   the TRMs add that the block "has been programmed at manufacturing" and reads back RO — but the
   word "unique" appears in none of the three datasheets, none of the three TRM eFuse chapters, and
   nowhere in the programming guide's MAC section (§2.2). This is unlikely ever to be resolved from
   public sources; the mitigation is that a duplicate is survivable (§5.5), not that it is
   impossible.
4. **ESP32-C2's `WIFI-4134`.** ESP-IDF's own `Kconfig.mac` carries an unresolved internal TODO about
   the ESP32-C2 MAC address configuration, still present at v5.5.2. It concerns the count of derived
   universal addresses, not the base MAC, and hashing the base MAC sidesteps it — but if C2 hardware
   is ever actually built, verify the factory MAC reads sanely on a real unit before trusting the
   serial derived from it.
5. **The ESP32-C2 documentation is wrong about the eFuse block.** The rendered page says the base MAC
   is in BLK1 and the custom MAC in BLK3; the eFuse table and the ESP8684 TRM put the factory MAC in
   BLOCK2 and the custom MAC in BLOCK1 (§2.4a). The same text is correct for C3 and S3, so it is a
   C2-only substitution bug — worth an upstream issue against `espressif/esp-idf`. Nothing in our
   derivation depends on the block number (`esp_efuse_mac_get_default` resolves it via the generated
   table), but anyone reading the docs to check this note will be misled.
6. **Should the serial also be advertised?** Every unit currently advertises the identical name
   `ROBO_CAT_EARS`, so a user with two pairs cannot tell them apart in the Chrome chooser _before_
   connecting. Putting a few serial characters in the advertised local name would fix that, at the
   cost of the 31-byte advertising budget (currently 23 bytes used). Out of scope for this ticket,
   but the same derivation would feed it.
