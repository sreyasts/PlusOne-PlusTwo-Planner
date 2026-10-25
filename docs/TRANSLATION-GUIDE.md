# +1 & +2 Planner — Malayalam Translation & Localization Guide

## 1. Objective

+1 & +2 Planner is designed for students across Kerala. While textbooks for higher secondary Science streams are in English, many students understand scheduling instructions, revision reminders, and conceptual overviews far better in Malayalam.

Our goal is **natural, conversational, and respectful Malayalam** that matches how students and teachers communicate in Kerala schools, avoiding stiff machine-translated jargon.

---

## 2. Localization Architecture

All localized text strings are maintained in `src/i18n/`:

- `src/i18n/en.json` (English source strings)
- `src/i18n/ml.json` (Malayalam translated strings)
- `src/i18n/index.js` (Dictionary lookup and fallback engine)

Strings use dot-notated hierarchical keys:
```json
{
  "onboarding": {
    "welcome_title": "നിങ്ങളുടെ പ്ലസ് ടു പഠനം പ്ലാൻ ചെയ്യാം",
    "welcome_subtitle": "കേരള DHSE സിലബസ് അടിസ്ഥാനമാക്കിയുള്ള ടൈംടേബിൾ ജനറേറ്റർ",
    "choose_stream": "നിങ്ങളുടെ വിഷയം തിരഞ്ഞെടുക്കുക",
    "bio_science": "ബയോളജി സയൻസ് (Bio-Maths)",
    "computer_science": "കമ്പ്യൂട്ടർ സയൻസ് (CS-Maths)"
  }
}
```

---

## 3. Translation Glossary & Conventions

| English Term | Recommended Malayalam Phrasing | Notes / Avoid |
| :--- | :--- | :--- |
| **Study Planner** | പഠന ടൈംടേബിൾ / സ്റ്റഡി പ്ലാനർ | Natural mix accepted; avoid awkward literal coinages |
| **Revision Buffer** | റിവിഷൻ ദിവസങ്ങൾ / അവസാനവട്ട പുനരവലോകനം | Refers to days reserved for mock exams |
| **Plus One Improvement** | പ്ലസ് വൺ ഇംപ്രൂവ്മെന്റ് | Standard board exam terminology |
| **Mock Exam / PYQ** | മുൻവർഷ ചോദ്യപേപ്പറുകൾ (PYQs) | Familiar acronym kept in brackets |
| **Target Deadline** | പരീക്ഷാ തീയതി / അവസാന തീയതി | Clear deadline meaning |
| **Rest Day / Break** | വിശ്രമ ദിനം | Buffer day with 0 minutes scheduled |
| **Completed Task** | പൂർത്തിയാക്കി | Simple and crisp |

---

## 4. How to Propose a Translation Change

1. Locate the key in `src/i18n/ml.json`.
2. Edit or add the missing Malayalam translation.
3. Test locally by switching the language toggle in the application header or running:
   ```javascript
   localStorage.setItem('plustwo_lang', 'ml');
   ```
4. Submit a Pull Request or open an issue using the [Malayalam Translation Template](../.github/ISSUE_TEMPLATE/translation_correction.md).
