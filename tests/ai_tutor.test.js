import { describe, it, expect } from 'vitest';
import { generateAiTutorPrompt, DHSE_SUBJECT_EXAM_TIPS } from '../src/utils/ai_tutor.js';

describe('Socratic AI Study Companion & Prompt Generator', () => {
  it('generates a pedagogical Socratic study prompt for Class 12 Physics', () => {
    const task = {
      subject: 'Physics',
      chapterTitle: 'Current Electricity',
      grade: '+2',
      part: 'Part 2 (Kirchhoff Laws & Wheatstone Bridge)'
    };

    const result = generateAiTutorPrompt(task, { language: 'en' });

    expect(result.subject).toBe('Physics');
    expect(result.chapterTitle).toBe('Current Electricity');
    expect(result.promptText).toContain('Kerala DHSE Higher Secondary (+2) academic tutor');
    expect(result.promptText).toContain('Current Electricity');
    expect(result.promptText).toContain('DIAGNOSTIC QUESTION');
    expect(result.promptText).toContain('WAIT FOR MY ANSWER');
    expect(result.promptText).toContain('RUBRIC FEEDBACK');
    expect(result.promptText).toContain('BOARD PYQ CHALLENGE');
    expect(result.promptText).toContain(DHSE_SUBJECT_EXAM_TIPS.Physics);

    expect(result.chatGptUrl).toContain('https://chatgpt.com/?q=');
    expect(decodeURIComponent(result.chatGptUrl)).toContain('Current Electricity');
  });

  it('generates a Malayalam localized prompt when language is ml', () => {
    const task = {
      subject: 'Chemistry',
      chapterTitle: 'Electrochemistry',
      grade: '+2',
      part: 'Part 1 (Nernst Equation)'
    };

    const result = generateAiTutorPrompt(task, { language: 'ml' });

    expect(result.promptText).toContain('കേരള DHSE ഹയർ സെക്കൻഡറി');
    expect(result.promptText).toContain('Electrochemistry');
    expect(result.promptText).toContain('സോക്രട്ടിക് മെത്തേഡ്');
    expect(result.promptText).toContain('മാർക്കിംഗ് സ്കീം അടിസ്ഥാനമാക്കി');
  });

  it('provides sensible examiner tips for all DHSE subjects', () => {
    expect(DHSE_SUBJECT_EXAM_TIPS.Mathematics).toContain('integration constant + C');
    expect(DHSE_SUBJECT_EXAM_TIPS['Computer Science']).toContain('indentation');
    expect(DHSE_SUBJECT_EXAM_TIPS.Accountancy).toContain('double-entry');
  });
});
