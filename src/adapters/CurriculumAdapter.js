/**
 * Base Abstract Curriculum Adapter for HSS Planner Ecosystem.
 * Allows state boards, national boards (CBSE/ICSE), and international curricula
 * to interface seamlessly with the constraint-propagation scheduling engine.
 */

export class CurriculumAdapter {
  /**
   * @param {string} boardId - Unique identifier for the educational board (e.g. 'kerala-dhse', 'cbse-class12')
   * @param {Object} options - Configuration options (grade, stream, metadata)
   */
  constructor(boardId, options = {}) {
    if (!boardId || typeof boardId !== 'string') {
      throw new Error('CurriculumAdapter requires a valid non-empty string boardId.');
    }
    this.boardId = boardId;
    this.grade = options.grade || '12';
    this.stream = options.stream || 'science';
    this.boardName = options.boardName || boardId;
    this.metadata = options.metadata || {};
    this.tasks = [];
  }

  /**
   * Validate that a study unit task object conforms to the scheduler's required schema.
   * @param {Object} task
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validateTask(task) {
    const errors = [];
    if (!task || typeof task !== 'object') {
      return { valid: false, errors: ['Task must be an object.'] };
    }

    if (!task.id || typeof task.id !== 'string') {
      errors.push('Task missing valid string id.');
    }
    if (!task.subject || typeof task.subject !== 'string') {
      errors.push(`Task ${task.id || 'unknown'}: missing subject.`);
    }
    if (!task.chapNumber || typeof task.chapNumber !== 'number' || task.chapNumber < 1) {
      errors.push(`Task ${task.id || 'unknown'}: chapNumber must be positive integer.`);
    }
    if (!task.chapterName || typeof task.chapterName !== 'string') {
      errors.push(`Task ${task.id || 'unknown'}: missing chapterName.`);
    }
    if (!task.part || typeof task.part !== 'number' || task.part < 1) {
      errors.push(`Task ${task.id || 'unknown'}: part must be a positive integer.`);
    }
    if (!task.totalParts || typeof task.totalParts !== 'number' || task.totalParts < task.part) {
      errors.push(`Task ${task.id || 'unknown'}: totalParts must be >= part.`);
    }
    if (!task.topicTitle || typeof task.topicTitle !== 'string') {
      errors.push(`Task ${task.id || 'unknown'}: missing topicTitle.`);
    }
    if (task.estimatedMinutes !== undefined && (typeof task.estimatedMinutes !== 'number' || task.estimatedMinutes <= 0)) {
      errors.push(`Task ${task.id || 'unknown'}: estimatedMinutes must be a positive number if provided.`);
    }
    if (task.part > 1 && task.prerequisiteId === undefined) {
      errors.push(`Task ${task.id || 'unknown'}: Part ${task.part} should define a prerequisiteId.`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Returns list of subjects present in this curriculum adapter.
   * @returns {string[]}
   */
  getSubjects() {
    const subs = new Set(this.tasks.map((t) => t.subject));
    return Array.from(subs);
  }

  /**
   * Returns all validated tasks configured in this adapter.
   * @returns {Object[]}
   */
  getTasks() {
    return [...this.tasks];
  }

  /**
   * Returns tasks filtered by subject.
   * @param {string} subject
   * @returns {Object[]}
   */
  getTasksForSubject(subject) {
    return this.tasks.filter((t) => t.subject === subject);
  }

  /**
   * Returns structured chapter hierarchy for a subject.
   * @param {string} subject
   * @returns {Array<{ chapNumber: number, chapId: string, chapterName: string, totalParts: number, parts: Object[] }>}
   */
  getSubjectChapters(subject) {
    const subjectTasks = this.getTasksForSubject(subject);
    const chapterMap = new Map();

    subjectTasks.forEach((task) => {
      const cId = task.chapId || `${task.subject}_${task.chapNumber}`;
      if (!chapterMap.has(cId)) {
        chapterMap.set(cId, {
          chapNumber: task.chapNumber,
          chapId: cId,
          chapterName: task.chapterName,
          totalParts: task.totalParts,
          parts: [],
        });
      }
      chapterMap.get(cId).parts.push(task);
    });

    const chapters = Array.from(chapterMap.values());
    chapters.sort((a, b) => a.chapNumber - b.chapNumber);
    chapters.forEach((c) => c.parts.sort((p1, p2) => p1.part - p2.part));
    return chapters;
  }

  /**
   * Returns total learning volume in estimated minutes.
   * @returns {number}
   */
  getTotalEstimatedMinutes() {
    return this.tasks.reduce((sum, t) => sum + (t.estimatedMinutes || 60), 0);
  }

  /**
   * Helper that converts this adapter instance into an options payload for buildIntelligentPlan.
   * @param {Object} overrideOptions
   * @returns {Object}
   */
  toPlanningOptions(overrideOptions = {}) {
    return {
      stream: 'custom',
      tasks: this.getTasks(),
      ...overrideOptions,
    };
  }
}
