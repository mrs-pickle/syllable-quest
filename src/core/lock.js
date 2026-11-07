export function createLock() {
  let busy = false;
  return {
    async run(fn) {
      if (busy) return undefined;
      busy = true;
      try {
        return await fn();
      } finally {
        busy = false;
      }
    },
    locked: () => busy,
  };
}

export const ARRIVAL_MS = 600;


export function createArrivalGuard({ now = () => globalThis.performance?.now?.() ?? Date.now(), ms = ARRIVAL_MS } = {}) {
  const from = now();
  return { allows: (event) => event?.detail === 0 || now() - from >= ms };
}
