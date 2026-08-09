export const VISIBILITIES = ["private", "unlisted", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];
