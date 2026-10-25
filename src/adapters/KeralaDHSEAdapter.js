/**
 * Kerala DHSE Curriculum Adapter
 * Encapsulates SCERT Plus Two and Plus One syllabi for Science, Commerce, and Humanities.
 */

import { CurriculumAdapter } from './CurriculumAdapter.js';
import { PLUS_TWO_SYLLABUS } from '../data/syllabus-plus-two.js';
import { PLUS_ONE_SYLLABUS } from '../data/syllabus-plus-one.js';
import { getCanonicalTasks } from '../engine/planner.js';

export class KeralaDHSEAdapter extends CurriculumAdapter {
  constructor(options = {}) {
    const grade = options.grade || '+2';
    super('kerala-dhse', {
      grade: grade,
      boardName: 'Kerala Higher Secondary Directorate (DHSE)',
      stream: options.stream || 'cs',
      metadata: {
        curriculumAuthority: 'SCERT Kerala',
        rationalizedYear: 2026,
        ...options.metadata,
      },
    });

    this.grade = grade;
    this.termScope = options.termScope || 3;
    this.includePlusOne = Boolean(options.includePlusOne);
    this.plusOneSubjects = options.plusOneSubjects || [];
    this.improvementOnly = Boolean(options.improvementOnly || this.stream === 'imp_only');

    this._initializeTasks();
  }

  _initializeTasks() {
    this.tasks = getCanonicalTasks({
      grade: this.grade,
      stream: this.stream,
      termScope: this.termScope,
      includePlusOne: this.includePlusOne,
      plusOneSubjects: this.plusOneSubjects,
      improvementOnly: this.improvementOnly,
    });
  }

  /**
   * Set or update stream and recompute active tasks.
   * @param {'cs' | 'bio' | 'commerce' | 'humanities' | 'imp_only'} stream
   */
  setStream(stream) {
    this.stream = stream;
    this.improvementOnly = stream === 'imp_only';
    this._initializeTasks();
  }

  /**
   * Set academic term scope (1 = Onam/Term 1, 2 = Christmas/Term 2, 3 = Full Board).
   * @param {number} termScope
   */
  setTermScope(termScope) {
    this.termScope = termScope;
    this._initializeTasks();
  }

  /**
   * Expose raw Kerala SCERT plus two syllabus array.
   */
  static getRawPlusTwoSyllabus() {
    return PLUS_TWO_SYLLABUS;
  }

  /**
   * Expose raw Kerala SCERT plus one syllabus array.
   */
  static getRawPlusOneSyllabus() {
    return PLUS_ONE_SYLLABUS;
  }
}
