export function generateCandidateSlots(rangeStart: Date, rangeEnd: Date, duration: number) {
  const slots: { start: Date; end: Date }[] = [];
  const cur = new Date(rangeStart);

  while (cur < rangeEnd) {
    const dayOfWeek = cur.getDay(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      cur.setDate(cur.getDate() + 1);
      continue; // skip weekends
    }

    const dayStart = new Date(cur);
    dayStart.setHours(10, 0, 0, 0);
    const dayEnd = new Date(cur);
    dayEnd.setHours(18, 0, 0, 0);
    const lunchStart = new Date(cur);
    lunchStart.setHours(13, 0, 0, 0);
    const lunchEnd = new Date(cur);
    lunchEnd.setHours(14, 0, 0, 0);

    let slot = new Date(dayStart);
    while (slot.getTime() + duration * 60000 <= dayEnd.getTime()) {
      const slotEnd = new Date(slot.getTime() + duration * 60000);

      // Skip lunch hours
      if (!(slotEnd <= lunchStart || slot >= lunchEnd)) {
        slot = new Date(slot.getTime() + 30 * 60000);
        continue;
      }

      slots.push({ start: new Date(slot), end: new Date(slotEnd) });
      slot = new Date(slot.getTime() + 30 * 60000);
    }

    cur.setDate(cur.getDate() + 1);
  }

  return slots;
}

export function isSlotFree(slot: { start: Date; end: Date }, busyList: { start: Date; end: Date }[]) {
  return busyList.every(b => slot.end <= b.start || slot.start >= b.end);
}
