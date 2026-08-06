# TypeScript

How we write TypeScript in this repo. These rules hold in review everywhere; a
rule that names a scope applies only there.

## Model absence in the types

A value that can be missing says so in its type, and the caller handles it.
Don't hide the gap with a cast or a lie in the return type.

```ts
// no
function findAccount(id: string): Account {
  return accounts.get(id) as Account;
}

// yes
function findAccount(id: string): Account | undefined {
  return accounts.get(id);
}
```

## Index access can return `undefined`

Treat every `arr[i]` and `obj[key]` result as possibly `undefined`. Prefer
restructuring so the index disappears; narrow explicitly when it can't.

```ts
// no
for (let i = 0; i < rows.length; i++) {
  process(rows[i]);
}

// yes
for (const row of rows) {
  process(row);
}
```

When the index is genuinely needed, handle the miss:

```ts
// no
const row = rows[index];
return row.id;

// yes
const row = rows[index];
if (row === undefined) {
  throw new Error(`no row at index ${index}`);
}
return row.id;
```

## No non-null assertions

`!` is banned. It silences the compiler exactly where the value can be missing;
narrow explicitly instead.

```ts
// no
const user = users.find((u) => u.id === id)!;

// yes
const user = users.find((u) => u.id === id);
if (user === undefined) {
  throw new Error(`unknown user ${id}`);
}
```

## No `any`

`any` turns checking off for everything it touches and spreads through
inference. Never declare it. When one leaks in — a loose dependency,
`JSON.parse`, a network response — give the value a real type at the point it
enters instead of passing it along. Data from outside the process — HTTP
bodies, environment, storage — is parsed into a typed value at the boundary;
see [parse-dont-validate.md](./parse-dont-validate.md). For a value that is
genuinely unknown, the type is `unknown`, narrowed before use.

```ts
// no
const payload: any = await res.json();
render(payload.items);

// yes
const payload = parseSearchResponse(await res.json());
render(payload.items);
```

## Casts

Never use `as` to silence a type error — it makes the compiler believe
something it can't verify, and the error moves to runtime. `as const` and
`satisfies` are fine.

```ts
// no
const config = JSON.parse(raw) as AppConfig;

// yes
const config = parseAppConfig(JSON.parse(raw));
```

## Every promise is handled

A promise is awaited, returned, or explicitly discarded with `void`. A bare
call swallows rejections and races whatever runs next.

```ts
// no
this.audit.record(event);

// yes
await this.audit.record(event);

// yes — intentionally fire-and-forget, marked as such
void this.audit.record(event);
```

Don't hand an async function to an API expecting a synchronous callback; the
returned promises are dropped on the floor.

```ts
// no
items.forEach(async (item) => saveItem(item));

// yes
for (const item of items) {
  await saveItem(item);
}
```

## `??` for defaults

`||` replaces every falsy value — `0`, `''`, `false` — not just missing ones.
Default with `??` so only `null` and `undefined` trigger the fallback.

```ts
// no
const limit = query.limit || 25;

// yes
const limit = query.limit ?? 25;
```

## Optional chains

Use `?.` instead of chained `&&` existence checks.

```ts
// no
if (user && user.profile && user.profile.email) {
  send(user.profile.email);
}

// yes
if (user?.profile?.email) {
  send(user.profile.email);
}
```

## Exhaustive switches

A `switch` over a union names every member. The `default` asserts the value is
`never` and throws: a union member added later fails to compile, and an
unexpected runtime value throws instead of falling through silently.

```ts
// no
switch (status) {
  case 'active':
    return activate();
  default:
    return null;
}

// yes
switch (status) {
  case 'active':
    return activate();
  case 'suspended':
    return suspend();
  case 'closed':
    return close();
  default: {
    const unhandled: never = status;
    throw new Error(`unhandled status: ${String(unhandled)}`);
  }
}
```

## Template literals interpolate strings and numbers

Anything else stringifies badly (`[object Object]`, `null`). Interpolate an
explicit representation instead.

```ts
// no
logger.warn(`retrying ${request}`);

// yes
logger.warn(`retrying ${request.method} ${request.url}`);
```

## Type-only imports and exports

Anything imported or re-exported only for its type uses `import type` /
`export type`, so the binding carries no runtime cost and reads as what it is.

```ts
// no
import { AccountDto } from './account.dto';

// yes
import type { AccountDto } from './account.dto';
export type { AccountDto };
```

Mixed imports mark the type specifiers inline:

```ts
import { createAccount, type AccountDto } from './account';
```

## Explicit `override`

Every member that overrides a base-class member says so.

```ts
// no
class AuditedRepo extends Repo {
  save(entity: Entity): void {}
}

// yes
class AuditedRepo extends Repo {
  override save(entity: Entity): void {}
}
```

## Angular

Inject dependencies with `inject()`, not constructor parameters.

```ts
// no
constructor(private readonly accounts: AccountService) {}

// yes
private readonly accounts = inject(AccountService);
```

A class that uses a lifecycle hook implements its interface
(`implements OnInit` for `ngOnInit`, and so on), so a typo'd hook is a compile
error instead of a method that never runs.

Templates keep the accessibility bar: every form control has an associated
label (wrapped, `for`/`id`, or `aria-label`), interactive elements are
focusable and keyboard-operable, and images carry `alt` text.

## Smaller conventions

- `T[]` over `Array<T>`.
- `interface` for object shapes; `type` for unions, intersections, and
  function types.
- Dot notation (`obj.key`) over `obj['key']` when the key is known.
- `startsWith` / `endsWith` over `slice` or `indexOf` comparisons.
