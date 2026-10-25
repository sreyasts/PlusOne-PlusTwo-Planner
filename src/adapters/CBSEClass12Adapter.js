/**
 * CBSE Class 12 Science Curriculum Adapter
 * Encapsulates rationalized NCERT curriculum for CBSE Class 12 Senior School Certificate Examination.
 * Demonstrates the cross-board extensibility of the +1 & +2 Planner scheduling core.
 */

import { CurriculumAdapter } from './CurriculumAdapter.js';

export class CBSEClass12Adapter extends CurriculumAdapter {
  constructor(options = {}) {
    super('cbse-class12', {
      grade: '12',
      boardName: 'Central Board of Secondary Education (CBSE)',
      stream: options.stream || 'pcm_cs',
      metadata: {
        curriculumAuthority: 'NCERT / CBSE New Delhi',
        rationalizedScheme: true,
        academicSession: '2026-2027',
        ...options.metadata,
      },
    });

    this.selectedSubjects = options.subjects || this._getDefaultSubjects(this.stream);
    this._initializeTasks();
  }

  _getDefaultSubjects(stream) {
    if (stream === 'pcb') {
      return ['Physics', 'Chemistry', 'Biology', 'English Core'];
    }
    if (stream === 'pcmb') {
      return ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English Core'];
    }
    // Default PCM + CS
    return ['Physics', 'Chemistry', 'Mathematics', 'Computer Science', 'English Core'];
  }

  _initializeTasks() {
    const rawCurriculum = this._getCurriculumData();
    const taskList = [];

    rawCurriculum.forEach((subjectEntry) => {
      if (!this.selectedSubjects.includes(subjectEntry.subject)) {
        return;
      }

      subjectEntry.chapters.forEach((chap) => {
        const totalParts = chap.parts.length;
        chap.parts.forEach((p, index) => {
          const partNum = index + 1;
          const taskId = `CBSE_12_${chap.chapId}_P${partNum}`;
          const prereqId = partNum > 1 ? `CBSE_12_${chap.chapId}_P${partNum - 1}` : null;

          const task = {
            id: taskId,
            grade: '12',
            subject: subjectEntry.subject,
            chapNumber: chap.chapNumber,
            chapId: `CBSE_12_${chap.chapId}`,
            chapterName: chap.chapterName,
            part: partNum,
            totalParts,
            topicTitle: p.title,
            term: chap.term || 1,
            estimatedMinutes: p.estimatedMinutes || 60,
            prerequisiteId: prereqId,
          };

          const validation = CurriculumAdapter.validateTask(task);
          if (!validation.valid) {
            throw new Error(`Curriculum validation failed for task ${taskId}: ${validation.errors.join(', ')}`);
          }

          taskList.push(task);
        });
      });
    });

    this.tasks = taskList;
  }

  _getCurriculumData() {
    return [
      {
        subject: 'Physics',
        chapters: [
          {
            chapNumber: 1,
            chapId: 'PHY_01',
            chapterName: 'Electric Charges and Fields',
            term: 1,
            parts: [
              { title: "Coulomb's Law, Electric Field & Dipole Moments", estimatedMinutes: 60 },
              { title: "Gauss's Law & Continuous Charge Distribution Applications", estimatedMinutes: 60 },
            ],
          },
          {
            chapNumber: 2,
            chapId: 'PHY_02',
            chapterName: 'Electrostatic Potential and Capacitance',
            term: 1,
            parts: [
              { title: 'Electrostatic Potential & Equipotential Surfaces', estimatedMinutes: 55 },
              { title: 'Capacitors, Dielectrics & Energy Stored in Capacitor', estimatedMinutes: 60 },
            ],
          },
          {
            chapNumber: 3,
            chapId: 'PHY_03',
            chapterName: 'Current Electricity',
            term: 1,
            parts: [
              { title: "Ohm's Law, Drift Velocity & Temperature Dependence", estimatedMinutes: 55 },
              { title: "Kirchhoff's Rules & Wheatstone Bridge Principle", estimatedMinutes: 60 },
            ],
          },
          {
            chapNumber: 4,
            chapId: 'PHY_04',
            chapterName: 'Moving Charges and Magnetism',
            term: 1,
            parts: [
              { title: "Biot-Savart Law & Ampere's Circuital Law", estimatedMinutes: 60 },
              { title: 'Magnetic Force on Moving Charges & Galvanometer to Ammeter/Voltmeter', estimatedMinutes: 60 },
            ],
          },
          {
            chapNumber: 5,
            chapId: 'PHY_05',
            chapterName: 'Magnetism and Matter',
            term: 1,
            parts: [
              { title: 'Magnetic Field Lines, Bar Magnet Dipole & Diamagnetism/Paramagnetism', estimatedMinutes: 50 },
            ],
          },
          {
            chapNumber: 6,
            chapId: 'PHY_06',
            chapterName: 'Electromagnetic Induction',
            term: 1,
            parts: [
              { title: "Faraday's Law, Lenz's Law & Eddy Currents", estimatedMinutes: 55 },
              { title: 'Self and Mutual Inductance & AC Generator Principle', estimatedMinutes: 60 },
            ],
          },
          {
            chapNumber: 7,
            chapId: 'PHY_07',
            chapterName: 'Alternating Current',
            term: 1,
            parts: [
              { title: 'LCR Series AC Circuit, Phasors & Resonance Condition', estimatedMinutes: 60 },
              { title: 'Power in AC Circuits, Wattless Current & Transformer Efficiency', estimatedMinutes: 55 },
            ],
          },
          {
            chapNumber: 8,
            chapId: 'PHY_08',
            chapterName: 'Electromagnetic Waves',
            term: 2,
            parts: [
              { title: 'Displacement Current & Characteristics of the Electromagnetic Spectrum', estimatedMinutes: 50 },
            ],
          },
          {
            chapNumber: 9,
            chapId: 'PHY_09',
            chapterName: 'Ray Optics and Optical Instruments',
            term: 2,
            parts: [
              { title: 'Spherical Mirrors, Refraction, TIR & Lens Maker Formula', estimatedMinutes: 65 },
              { title: 'Refraction through Prism, Compound Microscope & Astronomical Telescope', estimatedMinutes: 65 },
            ],
          },
          {
            chapNumber: 10,
            chapId: 'PHY_10',
            chapterName: 'Wave Optics',
            term: 2,
            parts: [
              { title: "Huygens Wavefront Principle & Verification of Reflection/Refraction", estimatedMinutes: 55 },
              { title: "Young's Double Slit Experiment & Single Slit Diffraction Patterns", estimatedMinutes: 60 },
            ],
          },
          {
            chapNumber: 11,
            chapId: 'PHY_11',
            chapterName: 'Dual Nature of Radiation and Matter',
            term: 2,
            parts: [
              { title: "Photoelectric Effect, Einstein's Equation & Work Function", estimatedMinutes: 50 },
              { title: 'de Broglie Wavelength of Matter Waves & Davisson-Germer Significance', estimatedMinutes: 50 },
            ],
          },
          {
            chapNumber: 12,
            chapId: 'PHY_12',
            chapterName: 'Atoms',
            term: 2,
            parts: [
              { title: "Rutherford Model, Bohr Postulates & Hydrogen Emission Spectrum", estimatedMinutes: 55 },
            ],
          },
          {
            chapNumber: 13,
            chapId: 'PHY_13',
            chapterName: 'Nuclei',
            term: 2,
            parts: [
              { title: 'Mass Defect, Binding Energy per Nucleon & Nuclear Fission/Fusion', estimatedMinutes: 50 },
            ],
          },
          {
            chapNumber: 14,
            chapId: 'PHY_14',
            chapterName: 'Semiconductor Electronics',
            term: 2,
            parts: [
              { title: 'Energy Bands, Intrinsic/Extrinsic Semiconductors & p-n Junction', estimatedMinutes: 60 },
              { title: 'Semiconductor Diodes as Half/Full Wave Rectifiers', estimatedMinutes: 55 },
            ],
          },
        ],
      },
      {
        subject: 'Chemistry',
        chapters: [
          {
            chapNumber: 1,
            chapId: 'CHM_01',
            chapterName: 'Solutions',
            term: 1,
            parts: [
              { title: "Raoult's Law, Ideal/Non-ideal Solutions & Henry's Law", estimatedMinutes: 55 },
              { title: "Colligative Properties, Osmotic Pressure & Van't Hoff Factor", estimatedMinutes: 60 },
            ],
          },
          {
            chapNumber: 2,
            chapId: 'CHM_02',
            chapterName: 'Electrochemistry',
            term: 1,
            parts: [
              { title: "Galvanic Cells, Nernst Equation & Gibbs Free Energy", estimatedMinutes: 60 },
              { title: "Electrolytic Conductance, Kohlrausch's Law & Fuel Cells", estimatedMinutes: 60 },
            ],
          },
          {
            chapNumber: 3,
            chapId: 'CHM_03',
            chapterName: 'Chemical Kinetics',
            term: 1,
            parts: [
              { title: 'Reaction Rates, Order, Molecularity & Zero/First Order Integrated Rates', estimatedMinutes: 60 },
              { title: 'Half-Life of Reactions, Arrhenius Equation & Activation Energy', estimatedMinutes: 55 },
            ],
          },
          {
            chapNumber: 4,
            chapId: 'CHM_04',
            chapterName: 'd and f Block Elements',
            term: 1,
            parts: [
              { title: 'Electronic Configurations, Oxidation States & Transition Metal Properties', estimatedMinutes: 55 },
              { title: 'Lanthanoid Contraction, Actinoids & Potassium Permanganate/Dichromate', estimatedMinutes: 55 },
            ],
          },
          {
            chapNumber: 5,
            chapId: 'CHM_05',
            chapterName: 'Coordination Compounds',
            term: 1,
            parts: [
              { title: "Werner's Theory, Ligand Types & IUPAC Nomenclature", estimatedMinutes: 55 },
              { title: 'Valence Bond Theory, Crystal Field Theory & Isomerism', estimatedMinutes: 60 },
            ],
          },
          {
            chapNumber: 6,
            chapId: 'CHM_06',
            chapterName: 'Haloalkanes and Haloarenes',
            term: 2,
            parts: [
              { title: 'Preparation Methods, SN1 & SN2 Nucleophilic Substitution Mechanisms', estimatedMinutes: 60 },
              { title: 'Electrophilic Substitution in Haloarenes & Polyhalogen Compounds', estimatedMinutes: 55 },
            ],
          },
          {
            chapNumber: 7,
            chapId: 'CHM_07',
            chapterName: 'Alcohols, Phenols and Ethers',
            term: 2,
            parts: [
              { title: 'Classification, Preparation of Alcohols & Acidic Nature of Phenols', estimatedMinutes: 60 },
              { title: 'Named Reactions of Phenols & Williamson Ether Synthesis', estimatedMinutes: 55 },
            ],
          },
          {
            chapNumber: 8,
            chapId: 'CHM_08',
            chapterName: 'Aldehydes, Ketones and Carboxylic Acids',
            term: 2,
            parts: [
              { title: 'Nucleophilic Addition to Carbonyls, Aldol & Cannizzaro Reactions', estimatedMinutes: 65 },
              { title: 'Acidity of Carboxylic Acids, Decarboxylation & HVZ Reaction', estimatedMinutes: 60 },
            ],
          },
          {
            chapNumber: 9,
            chapId: 'CHM_09',
            chapterName: 'Amines',
            term: 2,
            parts: [
              { title: 'Preparation of Amines, Basicity Comparisons & Chemical Tests', estimatedMinutes: 55 },
              { title: 'Diazonium Salts, Sandmeyer Reaction & Coupling Reactions', estimatedMinutes: 50 },
            ],
          },
          {
            chapNumber: 10,
            chapId: 'CHM_10',
            chapterName: 'Biomolecules',
            term: 2,
            parts: [
              { title: 'Glucose Structure, Haworth Projections & Polysaccharides', estimatedMinutes: 55 },
              { title: 'Amino Acids, Zwitterion, Protein Structure & Nucleic Acids (DNA/RNA)', estimatedMinutes: 55 },
            ],
          },
        ],
      },
      {
        subject: 'Mathematics',
        chapters: [
          {
            chapNumber: 1,
            chapId: 'MTH_01',
            chapterName: 'Relations and Functions',
            term: 1,
            parts: [
              { title: 'Equivalence Relations, Reflexive/Symmetric/Transitive Proofs', estimatedMinutes: 55 },
              { title: 'One-One, Onto & Bijective Function Determinations', estimatedMinutes: 55 },
            ],
          },
          {
            chapNumber: 2,
            chapId: 'MTH_02',
            chapterName: 'Inverse Trigonometric Functions',
            term: 1,
            parts: [
              { title: 'Principal Value Branches, Domain-Range & Simplifying Expressions', estimatedMinutes: 55 },
            ],
          },
          {
            chapNumber: 3,
            chapId: 'MTH_03',
            chapterName: 'Matrices',
            term: 1,
            parts: [
              { title: 'Matrix Multiplication, Transpose & Symmetric/Skew-Symmetric Properties', estimatedMinutes: 55 },
            ],
          },
          {
            chapNumber: 4,
            chapId: 'MTH_04',
            chapterName: 'Determinants',
            term: 1,
            parts: [
              { title: 'Minors, Cofactors, Adjoint & Invertible Matrix Computations', estimatedMinutes: 60 },
              { title: 'Solving Systems of Linear Equations via Matrix Inversion Method', estimatedMinutes: 60 },
            ],
          },
          {
            chapNumber: 5,
            chapId: 'MTH_05',
            chapterName: 'Continuity and Differentiability',
            term: 1,
            parts: [
              { title: 'Continuity Proofs, Chain Rule & Implicit/Parametric Differentiation', estimatedMinutes: 65 },
              { title: 'Logarithmic Differentiation & Second Order Derivatives', estimatedMinutes: 60 },
            ],
          },
          {
            chapNumber: 6,
            chapId: 'MTH_06',
            chapterName: 'Application of Derivatives',
            term: 1,
            parts: [
              { title: 'Strictly Increasing and Decreasing Function Intervals', estimatedMinutes: 55 },
              { title: 'Local & Absolute Maxima/Minima Applied Optimization Problems', estimatedMinutes: 65 },
            ],
          },
          {
            chapNumber: 7,
            chapId: 'MTH_07',
            chapterName: 'Integrals',
            term: 2,
            parts: [
              { title: 'Integration by Substitution, Trigonometric Identities & Partial Fractions', estimatedMinutes: 65 },
              { title: 'Integration by Parts & Definite Integral King/Queen Properties', estimatedMinutes: 70 },
            ],
          },
          {
            chapNumber: 8,
            chapId: 'MTH_08',
            chapterName: 'Application of Integrals',
            term: 2,
            parts: [
              { title: 'Area Enclosed by Parabolas, Circles, Ellipses & Intersecting Lines', estimatedMinutes: 60 },
            ],
          },
          {
            chapNumber: 9,
            chapId: 'MTH_09',
            chapterName: 'Differential Equations',
            term: 2,
            parts: [
              { title: 'Order, Degree & Variable Separable Differential Solutions', estimatedMinutes: 55 },
              { title: 'Homogeneous Equations & First Order Linear Differential Integrating Factors', estimatedMinutes: 60 },
            ],
          },
          {
            chapNumber: 10,
            chapId: 'MTH_10',
            chapterName: 'Vector Algebra',
            term: 2,
            parts: [
              { title: 'Scalar Dot Product, Vector Cross Product & Projection of Vectors', estimatedMinutes: 55 },
            ],
          },
          {
            chapNumber: 11,
            chapId: 'MTH_11',
            chapterName: 'Three Dimensional Geometry',
            term: 2,
            parts: [
              { title: 'Direction Cosines, Direction Ratios & Vector Equation of a Line', estimatedMinutes: 55 },
              { title: 'Shortest Distance Between Skew Lines in Space', estimatedMinutes: 60 },
            ],
          },
          {
            chapNumber: 12,
            chapId: 'MTH_12',
            chapterName: 'Linear Programming',
            term: 2,
            parts: [
              { title: 'Formulation, Corner Point Method & Bounded Objective Optimization', estimatedMinutes: 50 },
            ],
          },
          {
            chapNumber: 13,
            chapId: 'MTH_13',
            chapterName: 'Probability',
            term: 2,
            parts: [
              { title: 'Conditional Probability, Multiplication Theorem & Independent Events', estimatedMinutes: 55 },
              { title: "Bayes' Theorem & Total Probability Distribution", estimatedMinutes: 60 },
            ],
          },
        ],
      },
      {
        subject: 'Computer Science',
        chapters: [
          {
            chapNumber: 1,
            chapId: 'CS_01',
            chapterName: 'Python Functions and Libraries',
            term: 1,
            parts: [
              { title: 'Functions, Default Parameters, Global/Local Scope & Math/Random Modules', estimatedMinutes: 55 },
            ],
          },
          {
            chapNumber: 2,
            chapId: 'CS_02',
            chapterName: 'File Handling in Python',
            term: 1,
            parts: [
              { title: 'Text Files: read(), readline(), readlines() & write() Methods', estimatedMinutes: 55 },
              { title: 'Binary Files with pickle module (dump/load) & CSV File writer/reader', estimatedMinutes: 60 },
            ],
          },
          {
            chapNumber: 3,
            chapId: 'CS_03',
            chapterName: 'Data Structures: Stack',
            term: 1,
            parts: [
              { title: 'LIFO Principles, Push and Pop Operations in Python List Stacks', estimatedMinutes: 55 },
            ],
          },
          {
            chapNumber: 4,
            chapId: 'CS_04',
            chapterName: 'Computer Networks',
            term: 2,
            parts: [
              { title: 'Network Topologies, Switching Techniques & Transmission Media', estimatedMinutes: 55 },
              { title: 'TCP/IP, HTTP/HTTPS, DNS & Cyber Safety Protocols', estimatedMinutes: 55 },
            ],
          },
          {
            chapNumber: 5,
            chapId: 'CS_05',
            chapterName: 'Database Management & SQL',
            term: 2,
            parts: [
              { title: 'Relational Model, Keys, DDL and DML SQL Queries & Aggregate Functions', estimatedMinutes: 60 },
              { title: 'Table Joins, Group By/Having & Python-MySQL Connector Integration', estimatedMinutes: 60 },
            ],
          },
        ],
      },
      {
        subject: 'English Core',
        chapters: [
          {
            chapNumber: 1,
            chapId: 'ENG_01',
            chapterName: 'Advanced Reading Comprehension',
            term: 1,
            parts: [
              { title: 'Unseen Discursive & Case-based Factual Passages Analysis', estimatedMinutes: 50 },
            ],
          },
          {
            chapNumber: 2,
            chapId: 'ENG_02',
            chapterName: 'Creative Writing Skills',
            term: 1,
            parts: [
              { title: 'Formal Notices, Invitations & Replies Writing Formats', estimatedMinutes: 50 },
              { title: 'Letters of Application for Jobs & Editorials / Article Writing', estimatedMinutes: 55 },
            ],
          },
          {
            chapNumber: 3,
            chapId: 'ENG_03',
            chapterName: 'Flamingo Prose & Poetry',
            term: 2,
            parts: [
              { title: 'The Last Lesson, Lost Spring, Deep Water, The Rattrap (Theme & Character)', estimatedMinutes: 60 },
              { title: 'My Mother at 66, Keeping Quiet, Thing of Beauty & Aunt Jennifer (Poetic Devices)', estimatedMinutes: 55 },
            ],
          },
          {
            chapNumber: 4,
            chapId: 'ENG_04',
            chapterName: 'Vistas Supplementary Literature',
            term: 2,
            parts: [
              { title: 'The Third Level, The Tiger King, Journey to End of Earth & The Enemy', estimatedMinutes: 60 },
            ],
          },
        ],
      },
    ];
  }
}
