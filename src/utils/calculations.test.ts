import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTuitionFees,
  checkAdmissionEligibility,
  checkScholarshipEligibility,
  detectLanguage,
} from './calculations';
import type { FeeStructure, Program, Scholarship } from '../types';

const cseProgram: Program = {
  id: 'prog-cse',
  departmentId: 'dept-cse',
  name: 'B.Sc. in Computer Science and Engineering (CSE)',
  degreeType: 'B.Sc.',
  level: 'undergraduate',
  durationYears: 4,
  totalSemesters: 8,
  totalCredits: 148,
  curriculumSummary: 'Core CS & Software Engineering',
  coreCourses: ['Data Structures', 'Algorithms'],
  minSscGpa: 3.0,
  minHscGpa: 3.0,
  minCombinedGpa: 6.5,
  minBachelorCgpa: null,
  allowedGroups: ['Science', 'Diploma'],
  specialRequirements: 'Mathematics & Physics required in HSC/equivalent.',
  effectiveSemester: 'Spring 2026',
  verificationStatus: 'verified',
  updatedAt: '2026-01-01T00:00:00Z',
};

const cseFee: FeeStructure = {
  id: 'fee-cse-1',
  programId: 'prog-cse',
  effectiveSemester: 'Spring 2026',
  admissionFee: 20000,
  perCreditFee: 5500,
  semesterFee: 12000,
  labAndOtherFee: 15000,
  isCurrent: true,
  verificationStatus: 'verified',
  createdAt: '2026-01-01T00:00:00Z',
};

test('detectLanguage recognizes Bengali and English correctly', () => {
  assert.equal(detectLanguage('ড্যাফোডিল ইউনিভার্সিটিতে সিএসই ভর্তির যোগ্যতা কী?'), 'bn');
  assert.equal(detectLanguage('What is the tuition fee for CSE at DIU?'), 'en');
});

test('checkAdmissionEligibility approves qualified science student and rejects humanities student', () => {
  const passResult = checkAdmissionEligibility(
    {
      level: 'undergraduate',
      sscGpa: 4.5,
      hscGpa: 4.2,
      educationGroup: 'Science',
      passingYear: 2025,
      programId: 'prog-cse',
      currentYear: 2026,
    },
    cseProgram
  );
  assert.equal(passResult.eligible, true);
  assert.equal(passResult.missingRequirements.length, 0);

  const failResult = checkAdmissionEligibility(
    {
      level: 'undergraduate',
      sscGpa: 3.5,
      hscGpa: 3.5,
      educationGroup: 'Humanities',
      passingYear: 2025,
      programId: 'prog-cse',
      currentYear: 2026,
    },
    cseProgram
  );
  assert.equal(failResult.eligible, false);
  assert.ok(failResult.missingRequirements.some((r) => r.includes('Humanities')));
});

test('calculateTuitionFees computes totals and handles missing components without inventing values', () => {
  const full = calculateTuitionFees(cseProgram, cseFee, 25);
  assert.equal(full.hasMissingComponents, false);
  assert.equal(full.baseTuitionFee, 148 * 5500);
  assert.equal(full.scholarshipDeduction, Math.round((148 * 5500 * 25) / 100));
  assert.equal(
    full.estimatedPayable,
    20000 + 148 * 5500 + 8 * 12000 + 15000 - Math.round((148 * 5500 * 25) / 100)
  );

  const partialFee: FeeStructure = { ...cseFee, labAndOtherFee: null };
  const incomplete = calculateTuitionFees(cseProgram, partialFee, 0);
  assert.equal(incomplete.hasMissingComponents, true);
  assert.equal(incomplete.estimatedPayable, null);
  assert.ok(incomplete.missingComponents.includes('Lab & Other Charges'));
});

test('checkScholarshipEligibility evaluates result-based and female waivers', () => {
  const scholarships: Scholarship[] = [
    {
      id: 'sch-1',
      name: 'Golden GPA 5.00 Waiver',
      category: 'Result-Based',
      minSscGpa: 5.0,
      minHscGpa: 5.0,
      minCombinedGpa: 10.0,
      minSemesterGpa: null,
      waiverPercentage: 75,
      waiverLabel: '75% tuition waiver',
      conditions: 'Golden GPA 5.00 in both SSC and HSC',
      renewalRequirements: 'Maintain SGPA 3.50+',
      applicationInstructions: 'Submit transcripts at admission.',
      deadline: 'Before semester registration',
      isActive: true,
      verificationStatus: 'verified',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'sch-2',
      name: 'Female Student Waiver',
      category: 'Female Student Waiver',
      minSscGpa: null,
      minHscGpa: null,
      minCombinedGpa: null,
      minSemesterGpa: null,
      waiverPercentage: 10,
      waiverLabel: '10% tuition waiver',
      conditions: 'Applicable to female students',
      renewalRequirements: 'Maintain good standing',
      applicationInstructions: 'Automatically considered on verification.',
      deadline: 'At admission',
      isActive: true,
      verificationStatus: 'verified',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  const matches = checkScholarshipEligibility(
    {
      sscGpa: 4.8,
      hscGpa: 4.9,
      isFemale: true,
      isFreedomFighterWard: false,
      hasSportsAchievement: false,
      hasTalentHuntAward: false,
      needsFinancialAid: false,
    },
    scholarships
  );

  assert.equal(matches[0].matchStatus, 'not_eligible');
  assert.equal(matches[1].matchStatus, 'potentially_eligible');
});
