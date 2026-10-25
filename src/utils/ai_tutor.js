/**
 * +1 & +2 Planner - Socratic AI Revision Tutor & Prompt Generator
 * Generates pedagogically structured revision prompts designed for LLMs
 * (ChatGPT, OpenAI API, Gemini, Claude) aligned with the Kerala SCERT/DHSE curriculum.
 */

/**
 * Subject-specific exam scoring and derivation tips for Kerala Higher Secondary.
 */
export const DHSE_SUBJECT_EXAM_TIPS = {
  Physics: 'State SI units in all numerical finals, state Gauss/Ampere laws accurately, and draw ray/circuit diagrams with directional arrows.',
  Chemistry: 'Mention standard reagents for named organic reactions, state Le Chatelier/Kohlrausch conditions, and balance redox/stoichiometry equations.',
  Mathematics: 'Show all intermediate algebraic steps, state domain/range constraints, and always include integration constant + C.',
  Biology: 'Include clear labeled biological diagrams (e.g. nephron, transverse sections), precise botanical terminology, and flowcharts for hormone cascades.',
  Botany: 'Focus on cycle diagrams (Calvin/Krebs), genetic crosses with Punnett squares, and taxonomic adaptations.',
  Zoology: 'Highlight human physiology regulatory feedback loops and immunological antibody structure diagrams.',
  'Computer Science': 'Use clean indentation in C++/Python/SQL blocks, state big-O complexities, and double-check SQL syntax clauses (GROUP BY, HAVING).',
  Accountancy: 'Draw clear double-entry debit/credit ledger formats, maintain neat balancing figures, and show journal narrations.',
  'Business Studies': 'Structure answers with headings, explain points with practical business examples, and highlight principles of management.',
  Economics: 'Draw neatly labeled demand/supply and cost-curve diagrams, show national income identity formulas, and state assumptions clearly.'
};

/**
 * Generate a Socratic AI tutoring prompt for a specific study task.
 * @param {Object} task Task object with subject, chapter, grade, etc.
 * @param {Object} [options]
 * @returns {Object} { promptText, chatGptUrl, geminiUrl, subject, chapterTitle, examTip }
 */
export function generateAiTutorPrompt(task, options = {}) {
  const subject = task?.subject || 'Higher Secondary Science';
  const chapter = task?.chapterTitle || task?.chapterName || task?.title || 'Core Syllabus Unit';
  const grade = task?.grade || '+2';
  const part = task?.part || 'Part 1 (Concept & Derivations)';
  const language = options.language || 'en';
  const examTip = DHSE_SUBJECT_EXAM_TIPS[subject] || 'Focus on step-by-step clarity and high-yield scoring keywords.';

  let promptText;

  if (language === 'ml') {
    promptText = [
      `നിങ്ങൾ കേരള DHSE ഹയർ സെക്കൻഡറി (${grade}) ${subject} അധ്യാപകനാണ്.`,
      `ഞാൻ ഇപ്പോൾ പഠിക്കുന്ന പാഠഭാഗം: "${chapter}" (${part}).`,
      '',
      'സോക്രട്ടിക് മെത്തേഡ് (Socratic Method) ഉപയോഗിച്ച് എന്നെ റിവിഷൻ ചെയ്യാൻ സഹായിക്കുക:',
      '1. ഈ പാഠത്തിൽ നിന്ന് DHSE പരീക്ഷയ്ക്ക് വരാൻ സാധ്യതയുള്ള ഒരു പ്രധാന ആശയ ചോദ്യം (Conceptual Question) എന്നോട് ചോദിക്കുക.',
      '2. എൻ്റെ ഉത്തരം ലഭിച്ച ശേഷം, മാർക്കിംഗ് സ്കീം അടിസ്ഥാനമാക്കി വിലയിരുത്തുക (സ്കോർ: /5). എന്തെങ്കിലും കുറവുകളുണ്ടെങ്കിൽ തിരുത്തുക.',
      '3. തുടർന്ന്, ഈ ചാപ്റ്ററിൽ നിന്നുള്ള ഒരു മുൻവർഷ ബോർഡ് പരീക്ഷ ചോദ്യം (Previous Year Question - PYQ) അല്ലെങ്കിൽ പ്രോബ്ലം നൽകുക.',
      '4. പരീക്ഷയ്ക്ക് ഉയർന്ന മാർക്ക് നേടാൻ സഹായിക്കുന്ന പ്രധാന ഫോർമുലകളും കീവേഡുകളും ഓർമ്മിപ്പിക്കുക.',
      '',
      `പരീക്ഷാ ടിപ്പ്: ${examTip}`,
      '',
      'ആദ്യ ചോദ്യത്തോടെ നമുക്ക് റിവിഷൻ ആരംഭിക്കാം! ചോദ്യം എന്താണ്?'
    ].join('\n');
  } else {
    promptText = [
      `You are an expert Kerala DHSE Higher Secondary (${grade}) academic tutor in ${subject}.`,
      `I am preparing for my board examinations and currently studying: "${chapter}" (${part}).`,
      '',
      'Please act as my personal study companion using the Socratic Active Recall method:',
      '1. DIAGNOSTIC QUESTION: Ask me ONE core conceptual question from this chapter that frequently appears in Kerala board exams.',
      '2. WAIT FOR MY ANSWER: Do not answer it yourself. Wait for my response.',
      '3. RUBRIC FEEDBACK: Evaluate my answer against official SCERT Kerala marking scheme keywords, point out any missing derivations or formula notations, and award a score out of 5.',
      '4. BOARD PYQ CHALLENGE: Then, challenge me with ONE high-yield 3-mark or 4-mark Previous Year Question (PYQ) or numerical step-by-step problem from this chapter.',
      '',
      `EXAMINER FOCUS TIP: ${examTip}`,
      '',
      "Let's begin! What is my first diagnostic question?"
    ].join('\n');
  }

  const encodedPrompt = encodeURIComponent(promptText);
  const chatGptUrl = `https://chatgpt.com/?q=${encodedPrompt}`;
  const geminiUrl = `https://gemini.google.com/app`;

  return {
    promptText,
    chatGptUrl,
    geminiUrl,
    subject,
    chapterTitle: chapter,
    grade,
    part,
    examTip
  };
}
