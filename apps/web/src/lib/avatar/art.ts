/**
 * The art, keyed by preset.
 *
 * Imported rather than addressed as `/avatars/<key>.svg`: Vite hashes the
 * filenames, so a redrawn cat busts its own cache instead of needing a
 * CloudFront invalidation the way `static/models/*.glb` does. At well under
 * Vite's 4 KB inline limit each one lands in the bundle, costing no request.
 *
 * `Record<AvatarPreset, string>` is what keeps this honest: a preset added to
 * the API's closed set fails to compile here until its art exists.
 */

import type { AvatarPreset } from "@milklab/api/avatar";
import cat01 from "$lib/assets/avatars/cat-01.svg";
import cat02 from "$lib/assets/avatars/cat-02.svg";
import cat03 from "$lib/assets/avatars/cat-03.svg";
import cat04 from "$lib/assets/avatars/cat-04.svg";
import cat05 from "$lib/assets/avatars/cat-05.svg";
import cat06 from "$lib/assets/avatars/cat-06.svg";
import cat07 from "$lib/assets/avatars/cat-07.svg";
import cat08 from "$lib/assets/avatars/cat-08.svg";

export const AVATAR_ART: Record<AvatarPreset, string> = {
  "cat-01": cat01,
  "cat-02": cat02,
  "cat-03": cat03,
  "cat-04": cat04,
  "cat-05": cat05,
  "cat-06": cat06,
  "cat-07": cat07,
  "cat-08": cat08,
};
