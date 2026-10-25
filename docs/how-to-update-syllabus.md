# How to Update Syllabus Data in +1 & +2 Planner

When the Kerala Directorate of General Education (DHSE) or SCERT releases a new circular, rationalization change, or revised Scheme of Work, follow these steps to update the planner:

---

## 1. Primary Source Verification

Before modifying any code, verify the changes against official sources:
1. **Official DHSE Circulars**: [education.kerala.gov.in](https://education.kerala.gov.in/)
2. **SCERT Kerala Textbooks**: [samagra.kite.kerala.gov.in](https://samagra.kite.kerala.gov.in/)
3. **HSSLive Scheme of Work**: [hsslive.in](https://www.hsslive.in/)

Never introduce changes based on unverified rumors or social media claims.

---

## 2. File Locations

- **Plus Two (+2) Syllabus**: [`src/data/syllabus-plus-two.js`](../src/data/syllabus-plus-two.js)
- **Plus One (+1) Improvement Syllabus**: [`src/data/syllabus-plus-one.js`](../src/data/syllabus-plus-one.js)
- **Verified Learning Links**: [`src/data/chapter-resources.js`](../src/data/chapter-resources.js)
- **Schema**: [`src/data/syllabus-schema.json`](../src/data/syllabus-schema.json)

---

## 3. Data Structure Convention

Each chapter entry follows this structure:

```javascript
{
  num: 1,                          // 1-indexed chapter number matching textbook
  name: 'Electric Charges and Fields', // Official chapter title
  term: 1,                         // 1 = Onam (Term 1), 2 = Christmas (Term 2), 3 = Model/Board
  effort: 'HIGH',                  // 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH'
  parts: [
    { title: "Electric Charges, Conductors & Coulomb's Law", minutes: 65 },
    { title: "Electric Field Lines, Dipoles & Gauss's Law Applications", minutes: 75 }
  ]
}
```

### Guidelines for Defining Subtopics & Pacing:
1. **Parts Count**:
   - Short chapters (< 10 pages in textbook): 1 part.
   - Medium chapters: 2 parts.
   - Extensive chapters (Calculus, Optics, Organic Mechanisms): 3 to 4 parts.
2. **Subtopic Titles**: Use concrete concepts (e.g. *"Coulomb's Law, Field Lines & Gauss's Law"*) rather than generic labels like *"Part 1"*.
3. **Minute Estimates**: Based on 45-minute base periods plus numerical/derivation difficulty:
   - Theory: 50–60 minutes.
   - Medium Derivation / Reaction practice: 65–75 minutes.
   - High Complexity (Integrals, Rotational Motion): 75–85 minutes.

---

## 4. Validating and Testing

Run the automated test suite to ensure the planner builds, schedules, and balances the updated syllabus without error:

```bash
npm test
```

Submit your changes as a pull request with a link to the official circular or Scheme of Work document.
