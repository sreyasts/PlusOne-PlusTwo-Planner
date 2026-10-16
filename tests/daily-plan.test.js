import { describe, expect, it } from 'vitest';
import { getDailyPlan } from '../src/ui/daily-plan.js';

const task = (id, completed = false) => ({ id, subject: 'Physics', completed });
const day = (date, tasks) => ({ date, dayNumber: 1, tasks });

describe('Calendar study view', () => {
  it('shows the calendar day while retaining old pending work separately', () => {
    const pending = task('old');
    const current = day('2026-10-16', [task('today')]);
    const view = getDailyPlan([day('2026-10-15', [pending, task('done', true)]), current], '2026-10-16');
    expect(view.todayPlan).toBe(current);
    expect(view.overdueCount).toBe(1);
    expect(view.overdueDays[0].tasks).toEqual([pending]);
  });
  it('keeps a finished today visible instead of jumping into tomorrow', () => {
    const today = day('2026-10-16', [task('done', true)]);
    const tomorrow = day('2026-10-17', [task('next')]);
    const view = getDailyPlan([today, tomorrow], '2026-10-16');
    expect(view.todayPlan).toBe(today);
    expect(view.tomorrowPlan).toBe(tomorrow);
    expect(view.overdueCount).toBe(0);
  });
  it('advances on the next calendar date and keeps missed tasks pending', () => {
    const plan = [day('2026-10-16', [task('old')]), day('2026-10-17', [task('new')])];
    expect(getDailyPlan(plan, '2026-10-16').todayPlan).toBe(plan[0]);
    const nextDay = getDailyPlan(plan, '2026-10-17');
    expect(nextDay.todayPlan).toBe(plan[1]);
    expect(nextDay.overdueDays[0].tasks[0].id).toBe('old');
  });
  it('does not replace an empty or absent today with a future day', () => {
    const rest = day('2026-10-16', []);
    expect(getDailyPlan([rest, day('2026-10-17', [task('future')])], '2026-10-16').todayPlan).toBe(rest);
    expect(getDailyPlan([day('2026-10-17', [task('future')])], '2026-10-16').todayPlan).toBeUndefined();
  });
  it('retains old pending tasks after the plan deadline without changing the plan', () => {
    const plan = [day('2026-10-14', [task('older')]), day('2026-10-15', [task('yesterday')])];
    const before = JSON.stringify(plan);
    const view = getDailyPlan(plan, '2026-10-16');
    expect(view.todayPlan).toBeUndefined();
    expect(view.overdueDays.map(d => d.date)).toEqual(['2026-10-15', '2026-10-14']);
    expect(JSON.stringify(plan)).toBe(before);
  });
  it('handles year and leap-day boundaries using local calendar days', () => {
    expect(getDailyPlan([], '2027-01-01').yesterdayDate).toBe('2026-12-31');
    expect(getDailyPlan([], '2028-03-01').yesterdayDate).toBe('2028-02-29');
    expect(() => getDailyPlan([], '2026-02-30')).toThrow(TypeError);
  });
});
