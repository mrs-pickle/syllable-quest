const WINDOW = 10;
const FAST_MS = 600;
const MIN_ACCURACY = 0.75;



export function createMonitor() {
  let recent = [];
  let fast = false;
  let before = [];

  const lastMisses = (n) => recent.length >= n && recent.slice(-n).every(r => !r.correct);
  const clickingAtRandom = () => {
    const last3 = recent.slice(-3);
    return last3.length === 3 && last3.every(r => r.ms < FAST_MS) && last3.filter(r => !r.correct).length >= 2;
  };

  return {
    record({ correct, ms }) {
      before.push({ recent: [...recent], fast });
      recent.push({ correct, ms });
      if (recent.length > WINDOW) recent.shift();
      if (clickingAtRandom()) fast = true;
    },

    signal() {
      if (lastMisses(3) || clickingAtRandom()) return 'break';
      if (lastMisses(2)) return 'ease';
      if (recent.length >= WINDOW && recent.filter(r => r.correct).length / recent.length < MIN_ACCURACY) return 'ease';
      return 'ok';
    },

    fast: () => fast,

    reset() {
      recent = [];
      before = [];
    },

    undo() {
      const was = before.pop();
      if (!was) return;
      ({ recent, fast } = was);
    },
  };
}
