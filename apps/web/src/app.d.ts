// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

// SST resource types for code imported from @milklab/api (svelte-check
// compiles those sources but doesn't see the api package's tsconfig include)
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../../sst-env.d.ts" />

// Web Bluetooth, for the ears client. Referenced rather than left to automatic
// @types discovery, which SvelteKit's generated tsconfig excludes along with
// the rest of node_modules.
/// <reference types="web-bluetooth" />

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
