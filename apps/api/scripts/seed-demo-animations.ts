// Gives one account a starter set of public robo-cat-ears animations, so a
// fresh stage has something in the gallery to look at and remix.
//
//   npx sst shell --stage <stage> -- \
//     node --experimental-strip-types apps/api/scripts/seed-demo-animations.ts \
//     --email someone@example.com [--visibility public|unlisted|private] [--dry-run]
//
// Idempotent by (owner, name): an animation whose name is already in the
// account is left exactly as it is, never updated. Rename or delete it first if
// you want the seed version back.
import { getDb } from "../src/db.ts";
import { derivedScalars, payloadSchemaFor, ROBOT_PROFILES } from "../src/payload.ts";

const ROBOT_SLUG = "robo-cat-ears";

/** Matches `EaseType` in apps/web/src/lib/animation/interpolator.ts. */
const EASE = { none: 0, sine: 1, cubic: 2, elastic: 3 } as const;
type Ease = (typeof EASE)[keyof typeof EASE];

/**
 * A pose, authored without ease *windows*.
 *
 * The firmware eases out of a keyframe for `easeOutMs`, holds at the halfway
 * pose, then eases into the next for `easeInMs` — so windows that don't add up
 * to the segment produce a freeze mid-move, and zero windows produce a step.
 * Continuous motion is the overwhelmingly common intent, so the windows are
 * derived (half the adjacent segment each) rather than repeated by hand.
 * A deliberate hold is written as two poses with identical angles.
 */
interface Pose {
  timeMs: number;
  angles: [number, number, number, number]; // L az, L lat, R az, R lat — 90 is neutral
  ease: Ease;
}

interface Demo {
  name: string;
  description: string;
  poses: Pose[];
}

const DEMOS: Demo[] = [
  {
    name: "Perk Up",
    description:
      "Ears snap from a droop to fully alert, overshoot on the elastic curve, then settle.",
    poses: [
      { timeMs: 0, angles: [90, 60, 90, 60], ease: EASE.sine },
      { timeMs: 300, angles: [90, 135, 90, 135], ease: EASE.elastic },
      { timeMs: 1100, angles: [90, 135, 90, 135], ease: EASE.sine },
      { timeMs: 1500, angles: [90, 120, 90, 120], ease: EASE.sine },
    ],
  },
  {
    name: "Curious Tilt",
    description:
      "An asymmetric lean — one ear swivels forward while the other stays back — held, then released.",
    poses: [
      { timeMs: 0, angles: [90, 90, 90, 90], ease: EASE.sine },
      { timeMs: 600, angles: [60, 108, 122, 96], ease: EASE.sine },
      { timeMs: 1500, angles: [60, 108, 122, 96], ease: EASE.sine },
      { timeMs: 2100, angles: [90, 90, 90, 90], ease: EASE.sine },
    ],
  },
  {
    name: "Ear Twitch",
    description: "Two quick involuntary flicks with a still beat between them.",
    poses: [
      { timeMs: 0, angles: [90, 90, 90, 90], ease: EASE.none },
      { timeMs: 80, angles: [102, 98, 78, 96], ease: EASE.none },
      { timeMs: 170, angles: [86, 86, 94, 88], ease: EASE.none },
      { timeMs: 260, angles: [90, 90, 90, 90], ease: EASE.none },
      { timeMs: 900, angles: [90, 90, 90, 90], ease: EASE.none },
      { timeMs: 980, angles: [78, 96, 102, 98], ease: EASE.none },
      { timeMs: 1070, angles: [94, 88, 86, 86], ease: EASE.none },
      { timeMs: 1160, angles: [90, 90, 90, 90], ease: EASE.none },
    ],
  },
  {
    name: "Slow Sweep",
    description: "Both ears sweep smoothly right, back through centre, left, and home again.",
    poses: [
      { timeMs: 0, angles: [90, 90, 90, 90], ease: EASE.sine },
      { timeMs: 1000, angles: [132, 96, 132, 96], ease: EASE.sine },
      { timeMs: 2000, angles: [90, 90, 90, 90], ease: EASE.sine },
      { timeMs: 3000, angles: [48, 96, 48, 96], ease: EASE.sine },
      { timeMs: 4000, angles: [90, 90, 90, 90], ease: EASE.sine },
    ],
  },
  {
    name: "Sleepy Droop",
    description: "A slow cubic settle into a drooped resting pose, then a lazy rise back to neutral.",
    poses: [
      { timeMs: 0, angles: [90, 112, 90, 112], ease: EASE.cubic },
      { timeMs: 1600, angles: [84, 52, 96, 56], ease: EASE.cubic },
      { timeMs: 3200, angles: [84, 48, 96, 52], ease: EASE.cubic },
      { timeMs: 5000, angles: [90, 112, 90, 112], ease: EASE.cubic },
    ],
  },
  {
    name: "Happy Wiggle",
    description: "Ears alternate side to side four times on an elastic bounce, then square up.",
    poses: [
      { timeMs: 0, angles: [90, 90, 90, 90], ease: EASE.sine },
      { timeMs: 250, angles: [112, 102, 68, 78], ease: EASE.elastic },
      { timeMs: 500, angles: [68, 78, 112, 102], ease: EASE.elastic },
      { timeMs: 750, angles: [112, 102, 68, 78], ease: EASE.elastic },
      { timeMs: 1000, angles: [68, 78, 112, 102], ease: EASE.elastic },
      { timeMs: 1300, angles: [90, 90, 90, 90], ease: EASE.sine },
    ],
  },
];

function toPayload(poses: Pose[]) {
  return {
    schemaVersion: 1 as const,
    keyframes: poses.map((pose, i) => {
      const previous = poses[i - 1];
      const next = poses[i + 1];
      return {
        timeMs: pose.timeMs,
        angles: pose.angles,
        easeInType: pose.ease,
        easeOutType: pose.ease,
        easeInMs: previous === undefined ? 0 : Math.round((pose.timeMs - previous.timeMs) / 2),
        easeOutMs: next === undefined ? 0 : Math.round((next.timeMs - pose.timeMs) / 2),
      };
    }),
  };
}

function parseArgs(argv: string[]) {
  const flag = (name: string) => {
    const at = argv.indexOf(`--${name}`);
    return at === -1 ? undefined : argv[at + 1];
  };
  const email = flag("email");
  if (email === undefined) throw new Error("--email is required");
  const visibility = flag("visibility") ?? "public";
  if (!["public", "unlisted", "private"].includes(visibility)) {
    throw new Error(`--visibility must be public, unlisted or private (got "${visibility}")`);
  }
  return { email, visibility, dryRun: argv.includes("--dry-run") };
}

const { email, visibility, dryRun } = parseArgs(process.argv.slice(2));
const profile = ROBOT_PROFILES[ROBOT_SLUG];
if (profile === undefined) throw new Error(`no validation profile for robot "${ROBOT_SLUG}"`);
const schema = payloadSchemaFor(profile);

// Validated against the same schema the API enforces on write, before any
// connection is opened — a bad demo should fail here, not halfway through.
const prepared = DEMOS.map((demo) => {
  const payload = schema.parse(toPayload(demo.poses));
  return { ...demo, payload, ...derivedScalars(payload) };
});

const db = getDb();

const owner = await db.user.findFirst({ where: { email }, select: { id: true, displayName: true } });
if (owner === null) throw new Error(`no user with email ${email} — they must sign in once first`);

const robot = await db.robot.findUnique({ where: { slug: ROBOT_SLUG }, select: { id: true } });
if (robot === null) throw new Error(`robot "${ROBOT_SLUG}" is not seeded — run migrations first`);

const existing = new Set(
  (await db.animation.findMany({ where: { ownerId: owner.id }, select: { name: true } })).map(
    (animation) => animation.name,
  ),
);

console.log(`owner: ${owner.displayName} <${email}> (${owner.id})`);
console.log(`visibility: ${visibility}${dryRun ? "  [dry run]" : ""}`);

for (const demo of prepared) {
  if (existing.has(demo.name)) {
    console.log(`skip   ${demo.name} — already in the account`);
    continue;
  }
  const summary = `${demo.keyframeCount} keyframes, ${demo.durationMs} ms`;
  if (dryRun) {
    console.log(`would  ${demo.name} — ${summary}`);
    continue;
  }
  const created = await db.animation.create({
    data: {
      ownerId: owner.id,
      robotId: robot.id,
      name: demo.name,
      description: demo.description,
      visibility,
      payload: demo.payload,
      durationMs: demo.durationMs,
      keyframeCount: demo.keyframeCount,
    },
    select: { id: true },
  });
  console.log(`create ${demo.name} — ${summary} → ${created.id}`);
}

process.exit(0);
