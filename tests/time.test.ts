import { describe, expect, it } from 'vitest';
import { getPreviousUtcWeekRange } from '@/lib/time';

describe('weekly reporting window', () => {
  it('uses the previous Monday-to-Monday UTC window', () => {
    expect(getPreviousUtcWeekRange(new Date('2026-09-07T07:00:00Z'))).toEqual({
      periodStart: '2026-08-31T00:00:00.000Z',
      periodEnd: '2026-09-07T00:00:00.000Z',
      weekStart: '2026-08-31',
    });
  });

  it('keeps retries later in the same week on the same digest key', () => {
    const monday = getPreviousUtcWeekRange(new Date('2026-09-07T07:00:00Z'));
    const sunday = getPreviousUtcWeekRange(new Date('2026-09-13T23:59:59Z'));
    expect(sunday).toEqual(monday);
  });
});
