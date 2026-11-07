const MS_PER_DAY = 86400000;

export function dayNumber(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY;
}

export function todayFrom(offset, clock = () => new Date()) {
  return dayNumber(clock()) + offset;
}
