#!/usr/bin/env python3
"""Regenerate docs/spec/wire-format-fixture.json.

Deliberately a third, independent implementation of the wire format: the web
app's packWireFormat and the firmware's custom_animation_serialize are both
tested against the bytes this emits, so agreement between the three means
something. Change this only alongside a change to the format itself.

Usage: python3 scripts/gen-wire-format-fixture.py
"""

import json
import pathlib
import re

CHANNELS = 4
MAX_KEYFRAMES = 64
UINT16_MAX = 0xFFFF

EASE_NONE, EASE_SINE, EASE_CUBIC, EASE_ELASTIC = 0, 1, 2, 3


def keyframe(time_ms, angles, ease_in_type, ease_out_type, ease_in_ms, ease_out_ms):
    return {
        "timeMs": time_ms,
        "angles": list(angles),
        "easeInType": ease_in_type,
        "easeOutType": ease_out_type,
        "easeInMs": ease_in_ms,
        "easeOutMs": ease_out_ms,
    }


def be16(value):
    return [(value >> 8) & 0xFF, value & 0xFF]


def keyframe_bytes(kf):
    return (
        be16(kf["timeMs"])
        + list(kf["angles"])
        + [kf["easeInType"], kf["easeOutType"]]
        + be16(kf["easeInMs"])
        + be16(kf["easeOutMs"])
    )


def hex_lines(keyframes):
    """One hex line for the count byte, then one per keyframe, so a byte that
    moves shows up on a single line of the diff."""
    lines = ["%02x" % len(keyframes)]
    lines += ["".join("%02x" % b for b in keyframe_bytes(kf)) for kf in keyframes]
    return lines


CASES = [
    {
        "name": "single-keyframe",
        "why": "The floor: one keyframe, the shortest legal animation.",
        "keyframes": [keyframe(0x1234, [10, 20, 30, 40], EASE_SINE, EASE_ELASTIC, 0x0102, 0x0A0B)],
    },
    {
        "name": "angle-extremes",
        "why": "Angles at both ends of the servo range, 0 and 180.",
        "keyframes": [
            keyframe(0, [0, 180, 0, 180], EASE_NONE, EASE_NONE, 0, 0),
            keyframe(1000, [180, 0, 180, 0], EASE_NONE, EASE_NONE, 0, 0),
        ],
    },
    {
        "name": "every-ease-type",
        "why": "All four easing curves appear in both the in and the out slot.",
        "keyframes": [
            keyframe(0, [90, 90, 90, 90], EASE_NONE, EASE_SINE, 100, 200),
            keyframe(500, [45, 45, 45, 45], EASE_SINE, EASE_CUBIC, 100, 200),
            keyframe(1000, [135, 135, 135, 135], EASE_CUBIC, EASE_ELASTIC, 100, 200),
            keyframe(1500, [90, 90, 90, 90], EASE_ELASTIC, EASE_NONE, 100, 200),
        ],
    },
    {
        "name": "uint16-ceilings",
        "why": "timeMs, easeInMs and easeOutMs all at the uint16 ceiling.",
        "keyframes": [
            keyframe(0, [0, 0, 0, 0], EASE_NONE, EASE_NONE, UINT16_MAX, UINT16_MAX),
            keyframe(UINT16_MAX, [180, 180, 180, 180], EASE_CUBIC, EASE_CUBIC, UINT16_MAX, UINT16_MAX),
        ],
    },
    {
        "name": "repeated-timestamps",
        "why": "Times are non-decreasing, not strictly increasing: equal timestamps are legal and snap the pose.",
        "keyframes": [
            keyframe(0, [10, 10, 10, 10], EASE_NONE, EASE_NONE, 0, 0),
            keyframe(250, [20, 20, 20, 20], EASE_NONE, EASE_NONE, 0, 0),
            keyframe(250, [30, 30, 30, 30], EASE_NONE, EASE_NONE, 0, 0),
            keyframe(250, [40, 40, 40, 40], EASE_NONE, EASE_NONE, 0, 0),
            keyframe(500, [50, 50, 50, 50], EASE_NONE, EASE_NONE, 0, 0),
        ],
    },
    {
        "name": "max-keyframes",
        "why": "The ceiling: 64 keyframes, 769 bytes, CUSTOM_ANIMATION_MAX_SERIALIZED_SIZE.",
        "keyframes": [
            keyframe(
                i * 100,
                [i * 2, 180 - i * 2, (i * 3) % 181, (i * 5) % 181],
                i % 4,
                (i + 1) % 4,
                i * 10,
                i * 20,
            )
            for i in range(MAX_KEYFRAMES)
        ],
    },
]


def one_line_keyframes(text):
    """Collapse each keyframe object onto one line. json.dumps(indent=2) spreads
    the 64-keyframe case over 700 lines, which no one will read in a diff."""
    return re.sub(r"\{\s+(\"timeMs\".*?)\s+\}", lambda m: "{ %s }" % re.sub(r"\s+", " ", m.group(1)), text, flags=re.S)


def main():
    root = pathlib.Path(__file__).resolve().parent.parent
    out_path = root / "docs" / "spec" / "wire-format-fixture.json"

    fixture = {
        "description": (
            "Golden bytes for the ears animation wire format. Canonical copy lives at "
            "docs/spec/wire-format-fixture.json in github.com/junderdo/milk-lab-creations; "
            "github.com/junderdo/robo-cat-ears carries a byte-identical copy at "
            "test/wire-format-fixture.json. Regenerate with scripts/gen-wire-format-fixture.py."
        ),
        "channels": CHANNELS,
        "keyframeWireSize": 8 + CHANNELS,
        "maxKeyframes": MAX_KEYFRAMES,
        "cases": [
            {
                "name": case["name"],
                "why": case["why"],
                "payload": {"keyframes": case["keyframes"]},
                "hex": hex_lines(case["keyframes"]),
            }
            for case in CASES
        ],
    }

    out_path.write_text(one_line_keyframes(json.dumps(fixture, indent=2)) + "\n")
    print("wrote %s (%d cases)" % (out_path, len(CASES)))


if __name__ == "__main__":
    main()
