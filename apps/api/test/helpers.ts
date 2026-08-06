// In-memory db double injected at the context seam. Implements just the
// Prisma delegate surface the routers use; tests assert on procedure results
// and the double's observable state, never on call shapes.
import type { Context } from "../src/context.ts";
import type { Db } from "../src/db.ts";
import type { Visibility } from "../src/router.ts";

export interface UserRow {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RobotRow {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
}

export interface AnimationRow {
  id: string;
  ownerId: string;
  robotId: string;
  name: string;
  description: string | null;
  visibility: Visibility;
  payload: unknown;
  durationMs: number;
  keyframeCount: number;
  remixedFromId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

let nextId = 0;
export function uuid(): string {
  nextId += 1;
  return `00000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`;
}

export const ROBO_CAT_EARS: RobotRow = {
  id: "00000000-0000-4000-8000-00000000beef",
  slug: "robo-cat-ears",
  name: "Robo Cat Ears",
  createdAt: new Date("2026-01-01"),
};

/**
 * A complete animation row for tests that seed the fake directly rather than
 * going through `create`. One place to touch when the table gains a column.
 */
export function makeAnimationRow(overrides: Partial<AnimationRow> = {}): AnimationRow {
  return {
    id: uuid(),
    ownerId: uuid(),
    robotId: ROBO_CAT_EARS.id,
    name: "Seeded",
    description: null,
    visibility: "private",
    payload: validPayload(),
    durationMs: 500,
    keyframeCount: 2,
    remixedFromId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export class FakeDb {
  users: UserRow[] = [];
  robots: RobotRow[] = [ROBO_CAT_EARS];
  animations: AnimationRow[] = [];

  /** Mirrors Prisma `select`: only requested fields come back off the wire. */
  private applySelect(view: Record<string, unknown>, select?: unknown) {
    if (!select) return view;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(select as Record<string, unknown>)) {
      if (key in view) out[key] = view[key];
    }
    return out;
  }

  private robotView(row: AnimationRow) {
    const robot = this.robots.find((r) => r.id === row.robotId);
    const owner = this.users.find((u) => u.id === row.ownerId);
    return {
      ...row,
      owner: owner ? { id: owner.id, displayName: owner.displayName } : null,
      robot: robot ? { slug: robot.slug, name: robot.name } : null,
    };
  }

  readonly user = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.users.find((u) => u.id === where.id) ?? null,
    upsert: async ({ where, create }: { where: { id: string }; create: Omit<UserRow, "createdAt" | "updatedAt"> }) => {
      const existing = this.users.find((u) => u.id === where.id);
      if (existing) return existing;
      const row: UserRow = { ...create, createdAt: new Date(), updatedAt: new Date() };
      this.users.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
      const row = this.users.find((u) => u.id === where.id);
      if (!row) throw new Error("user not found");
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const idx = this.users.findIndex((u) => u.id === where.id);
      if (idx === -1) throw new Error("user not found");
      return this.users.splice(idx, 1)[0];
    },
  };

  readonly robot = {
    findUnique: async ({ where }: { where: { slug?: string; id?: string } }) =>
      this.robots.find((r) => (where.slug ? r.slug === where.slug : r.id === where.id)) ?? null,
    findMany: async () => [...this.robots],
  };

  readonly animation = {
    findUnique: async ({
      where,
      include,
      select,
    }: {
      where: { id: string };
      include?: unknown;
      select?: unknown;
    }) => {
      const row = this.animations.find((a) => a.id === where.id);
      if (!row) return null;
      if (select) return this.applySelect({ ...row }, select);
      return include ? this.robotView(row) : { ...row };
    },
    findMany: async (args: {
      where?: { ownerId?: string; visibility?: string; robot?: { slug: string }; id?: { in: string[] } };
      select?: unknown;
      take?: number;
      cursor?: { id: string };
      skip?: number;
    }) => {
      let rows = this.animations.filter((a) => {
        const w = args.where ?? {};
        if (w.ownerId && a.ownerId !== w.ownerId) return false;
        if (w.visibility && a.visibility !== w.visibility) return false;
        if (w.id && !w.id.in.includes(a.id)) return false;
        if (w.robot) {
          const robot = this.robots.find((r) => r.id === a.robotId);
          if (robot?.slug !== w.robot.slug) return false;
        }
        return true;
      });
      rows = [...rows].sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
      );
      if (args.cursor) {
        const idx = rows.findIndex((r) => r.id === args.cursor!.id);
        rows = idx === -1 ? [] : rows.slice(idx + (args.skip ?? 0));
      }
      if (args.take !== undefined) rows = rows.slice(0, args.take);
      return rows.map((r) => this.applySelect(this.robotView(r), args.select));
    },
    count: async ({ where }: { where: { ownerId: string } }) =>
      this.animations.filter((a) => a.ownerId === where.ownerId).length,
    create: async ({ data }: { data: Omit<AnimationRow, "id" | "description" | "visibility" | "remixedFromId" | "createdAt" | "updatedAt"> & { description?: string | null; visibility?: Visibility; remixedFromId?: string | null } }) => {
      const row: AnimationRow = {
        id: uuid(),
        description: null,
        visibility: "private",
        remixedFromId: null,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.animations.push(row);
      return { ...row };
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<AnimationRow> }) => {
      const row = this.animations.find((a) => a.id === where.id);
      if (!row) throw new Error("animation not found");
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const idx = this.animations.findIndex((a) => a.id === where.id);
      if (idx === -1) throw new Error("animation not found");
      return this.animations.splice(idx, 1)[0];
    },
    deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
      const before = this.animations.length;
      this.animations = this.animations.filter((a) => !where.id.in.includes(a.id));
      return { count: before - this.animations.length };
    },
  };
}

export function makeContext(overrides?: {
  db?: FakeDb;
  sub?: string | null;
  fetchProfile?: Context["fetchProfile"];
}): Context & { fake: FakeDb } {
  const fake = overrides?.db ?? new FakeDb();
  return {
    db: fake as unknown as Db,
    user: overrides?.sub === null || overrides?.sub === undefined ? null : { sub: overrides.sub },
    fetchProfile:
      overrides?.fetchProfile ??
      (async () => ({ email: "jeff@example.com", displayName: "Jeff" })),
    fake,
  };
}

export function validPayload(keyframes = 2) {
  return {
    schemaVersion: 1,
    keyframes: Array.from({ length: keyframes }, (_, i) => ({
      timeMs: i * 500,
      angles: [90, 90, 90, 90],
      easeInType: 1,
      easeOutType: 2,
      easeInMs: 100,
      easeOutMs: 150,
    })),
  };
}
