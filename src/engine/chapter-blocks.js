export const MAX_DAILY_BLOCKS = 3;

export function studyMinutes(task) {
  const minutes = Number(task.estimatedMinutes ?? task.minutes);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
}

export function studyBlockKey(task) {
  if (!task.chapId || task.isRevision || task.isExamEveTask || task.isSpacedRetrieval || task.isForgettingCurveReview) {
    return JSON.stringify([task.id]);
  }
  return JSON.stringify([task.grade, task.subject, task.chapId]);
}

export function groupStudyBlocks(tasks) {
  const blocks = new Map();
  for (const task of tasks) {
    const key = studyBlockKey(task);
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key).push(task);
  }
  return [...blocks.values()];
}

/** Assign consecutive chapter parts within the daily minutes and block limit. */
export function scheduleChapterBlocks(days, tasks, minutesForDay, subjectWeights, boostWeekends = false) {
  if (!tasks.length || !days.length) return tasks;

  const subjectChapters = new Map();
  for (const chapter of groupStudyBlocks(tasks)) {
    const subject = chapter[0].subject;
    if (!subjectChapters.has(subject)) subjectChapters.set(subject, []);
    subjectChapters.get(subject).push(chapter);
  }

  const availability = days.map(day => ({
    minutes: minutesForDay(day) - day.tasks.reduce((sum, task) => sum + studyMinutes(task), 0),
    slots: MAX_DAILY_BLOCKS - groupStudyBlocks(day.tasks).length,
  }));
  const largestRemainingDay = new Array(availability.length);
  for (let i = availability.length - 1; i >= 0; i--) {
    const { minutes, slots } = availability[i];
    largestRemainingDay[i] = Math.max(largestRemainingDay[i + 1] ?? 0, slots > 0 ? minutes : 0);
  }

  function attempt(limit, spread, fillGaps) {
    const queues = [...subjectChapters].map(([subject, chapters]) => ({
      chapters, chapterIndex: 0, partIndex: 0, lastDay: -4,
      weight: Math.min(3, Math.max(0.1, Number(subjectWeights[subject]) || 1)),
    }));
    let scheduled = 0;
    let scheduledMinutes = 0;
    const assignments = availability.map(({ minutes, slots }, dayIndex) => {
      const spreadParts = spread && !(boostWeekends && [0, 6].includes(days[dayIndex].dayOfWeek));
      const blocks = [];
      const used = new Set();
      for (let slot = 0; slot < Math.min(limit, slots); slot++) {
        const candidates = [];
        for (const queue of queues) {
          let chapter = queue.chapters[queue.chapterIndex];
          // A portion that fits on no remaining day should not block other chapters.
          while (chapter && studyMinutes(chapter[queue.partIndex]) > largestRemainingDay[dayIndex]) {
            queue.chapterIndex++;
            queue.partIndex = 0;
            chapter = queue.chapters[queue.chapterIndex];
          }
          if (!chapter || used.has(chapter)) continue;

          const remaining = chapter.slice(queue.partIndex);
          let fit = 0;
          let duration = 0;
          for (const task of remaining) {
            const next = studyMinutes(task);
            if (duration + next > minutes) break;
            duration += next;
            fit++;
            if (spreadParts) break;
          }
          if (!fit) continue;
          const whole = fit === remaining.length;
          if (!whole && !spreadParts && !fillGaps && blocks.length) continue;
          const score = Math.min(10, dayIndex - queue.lastDay) + queue.weight * 2;
          candidates.push({ queue, chapter, remaining, fit, duration, whole, score });
        }
        candidates.sort((a, b) => (!spreadParts && Number(b.whole) - Number(a.whole)) || b.score - a.score || b.duration - a.duration);
        const chosen = candidates[0];
        if (!chosen) break;
        const { queue, chapter, remaining, fit, duration, whole } = chosen;
        used.add(chapter);
        blocks.push(...remaining.slice(0, fit));
        scheduled += fit;
        scheduledMinutes += duration;
        minutes -= duration;
        queue.lastDay = dayIndex;
        if (whole) {
          queue.chapterIndex++;
          queue.partIndex = 0;
        } else {
          queue.partIndex += fit;
        }
      }
      return blocks;
    });
    return { assignments, scheduled, scheduledMinutes };
  }

  // Leave a chapter's parts on separate days if one block per day is enough.
  // Under deadline pressure, try whole chapters and add daily blocks only as needed.
  let best = attempt(1, true, false);
  for (let limit = 1; limit <= MAX_DAILY_BLOCKS && best.scheduled < tasks.length; limit++) {
    for (const fillGaps of [false, true]) {
      const candidate = attempt(limit, false, fillGaps);
      if (candidate.scheduledMinutes > best.scheduledMinutes ||
          (candidate.scheduledMinutes === best.scheduledMinutes && candidate.scheduled > best.scheduled)) {
        best = candidate;
      }
      if (best.scheduled === tasks.length) break;
    }
  }

  const scheduledIds = new Set();
  best.assignments.forEach((assigned, dayIndex) => {
    for (const task of assigned) {
      scheduledIds.add(task.id);
      days[dayIndex].tasks.push({
        ...task, completed: false, isFullOnDay: false,
        isFocusSubject: Number(subjectWeights[task.subject]) >= 1.1,
      });
    }
  });
  return tasks.filter(task => !scheduledIds.has(task.id));
}
