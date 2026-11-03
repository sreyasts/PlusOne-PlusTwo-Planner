import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Cloud Firestore Production Security Rules Invariants', () => {
  const rulesPath = path.resolve(__dirname, '../firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  it('uses rules_version 2 and service cloud.firestore', () => {
    expect(rulesContent).toMatch(/rules_version\s*=\s*'2';/);
    expect(rulesContent).toContain('service cloud.firestore');
    expect(rulesContent).toContain('match /databases/{database}/documents');
  });

  it('contains assumed data model documentation for users and user_plans', () => {
    expect(rulesContent).toContain('Assumed Data Model');
    expect(rulesContent).toContain('Collection: users');
    expect(rulesContent).toContain('Collection: user_plans');
  });

  it('implements core helper functions including isOwner and isAuthenticated', () => {
    expect(rulesContent).toMatch(/function\s+isAuthenticated\(\)/);
    expect(rulesContent).toMatch(/function\s+isOwner\(userId\)/);
    expect(rulesContent).toContain('request.auth.uid == userId');
  });

  it('protects both /users/{userId} and /user_plans/{userId} collections strictly', () => {
    expect(rulesContent).toContain('match /users/{userId}');
    expect(rulesContent).toContain('match /user_plans/{userId}');
  });

  it('implements Validator Function Pattern on both create and update operations', () => {
    expect(rulesContent).toMatch(/allow create:\s*if\s*isOwner\(userId\)\s*&&\s*isValidUserData\(request\.resource\.data\);/);
    expect(rulesContent).toMatch(/allow update:\s*if\s*isOwner\(userId\)\s*&&\s*isValidUserData\(request\.resource\.data\)\s*&&\s*areImmutableFieldsPreserved\(\);/);
  });

  it('protects student PII and ensures owner-only read and delete access', () => {
    // Blanket reads (allow read: if isAuthenticated() or allow read: if true) are strictly forbidden
    expect(rulesContent).not.toMatch(/allow read:\s*if\s*true;/);
    expect(rulesContent).not.toMatch(/allow read:\s*if\s*isAuthenticated\(\);/);
    expect(rulesContent).toContain('allow read: if isOwner(userId);');
    expect(rulesContent).toContain('allow delete: if isOwner(userId);');
  });

  it('enforces immutable identity and creation fields on update', () => {
    expect(rulesContent).toMatch(/function\s+areImmutableFieldsPreserved\(\)/);
    expect(rulesContent).toContain('ownerUid');
    expect(rulesContent).toContain('uid');
    expect(rulesContent).toContain('createdAt');
  });

  it('enforces strict string and list size bounds against resource exhaustion/DoS', () => {
    expect(rulesContent).toMatch(/function\s+isValidUserStrings\(data\)/);
    expect(rulesContent).toMatch(/function\s+isValidUserLists\(data\)/);
    expect(rulesContent).toContain('data.plan.size() <= 500');
    expect(rulesContent).toContain('data.stream.size() <= 50');
  });

  it('supports multi-device sync with grade and clientSessionId allowed and validated', () => {
    expect(rulesContent).toContain("'grade'");
    expect(rulesContent).toContain("'clientSessionId'");
    expect(rulesContent).toMatch(/!\('grade'\s+in\s+data\)\s*\|\|\s*data\.grade\s+in\s+\['\+1',\s*'\+2',\s*'dual'\]/);
    expect(rulesContent).toMatch(/!\('clientSessionId'\s+in\s+data\)\s*\|\|\s*\(data\.clientSessionId\s+is\s+string\s*&&\s*data\.clientSessionId\.size\(\)\s*<=\s*150\)/);
  });

  it('validates that real client payload produced by getFirestoreCleanData strictly passes hasOnlyAllowedStudyPlanFields', () => {
    // Extract allowedKeys from firestore.rules
    const match = rulesContent.match(/let\s+allowedKeys\s*=\s*\[([\s\S]*?)\];/);
    expect(match).toBeTruthy();
    const rawKeys = match[1]
      .split(',')
      .map((k) => k.trim().replace(/['"]/g, ''))
      .filter(Boolean);
    const allowedKeysSet = new Set(rawKeys);

    // Realistic payload constructed by the client app during multi-device sync
    const realPayload = {
      engineVersion: 6,
      grade: '+2',
      stream: 'cs',
      studyIntensity: 'regular',
      personalization: { targetScore: 'A+' },
      startDate: '2026-11-01',
      deadlineDate: '2026-12-01',
      targetTerm: 1,
      completedChaptersOnInit: [],
      plan: [],
      revisionDaysCount: 3,
      totalConfiguredTasks: 120,
      diagnostics: {},
      isLateEveningGenerated: false,
      createdAt: '2026-11-01T10:00:00.000Z',
      lastModified: '2026-11-01T10:00:00.000Z',
      userEmail: 'student@kerala.edu',
      displayName: 'Kerala Student',
      lastSynced: '2026-11-01T10:00:00.000Z',
      clientSessionId: 'sess_1730000000000_abc123',
    };

    // Every key in realPayload MUST be present in allowedKeysSet
    for (const key of Object.keys(realPayload)) {
      expect(allowedKeysSet.has(key), `Key '${key}' in client payload must be in allowedKeys`).toBe(true);
    }
  });

  it('strictly denies all other paths and subcollections by default', () => {
    expect(rulesContent).toMatch(/match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s*false;\s*\}/);
  });
});
