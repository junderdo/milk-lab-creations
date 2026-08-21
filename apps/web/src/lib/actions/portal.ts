import type { Action } from "svelte/action";

/**
 * Moves the element to `document.body`, so an `inert` or `overflow: hidden`
 * ancestor cannot reach it. Svelte keeps its reference, so teardown still works.
 */
export const portal: Action = (node) => {
  document.body.appendChild(node);
  return {
    destroy() {
      node.remove();
    },
  };
};
