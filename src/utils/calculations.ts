import type {
  EligibilityInput,
  EligibilityResult,
  FeeCalculationResult,
  FeeStructure,
  Language,
  Program,
  Scholarship,
  ScholarshipCheckInput,
  ScholarshipMatch,
} from '../types';

export function detectLanguage(text: string): Language {
  const bengaliChars = text.match(/[\u0980-\u09FF]/g);
  if (bengaliChars && bengaliChars.length >= 2) {
    return 'bn';
  }
  return 'en';
}

export function checkAdmissionEligibility(
  input: EligibilityInput,
  program: Program
): EligibilityResult {
  const applicableRequirements: string[] = [];
  const missingRequirements: string[] = [];
  const conditions: string[] = [];
  const referenceYear = input.currentYear ?? 2026;

  if (program.level !== input.level) {
    missingRequirements.push(
      `Selected program (${program.name}) is a ${program.level} program, while your selected admission level is ${input.level}.`
    );
  }

  if (input.level === 'undergraduate') {
    if (program.minSscGpa !== null) {
      applicableRequirements.push(`Minimum SSC/Equivalent GPA: ${program.minSscGpa.toFixed(2)}`);
      if (input.sscGpa < program.minSscGpa) {
        missingRequirements.push(
          `SSC GPA ${input.sscGpa.toFixed(2)} is below the required ${program.minSscGpa.toFixed(2)}.`
        );
      }
    } else {
      conditions.push('Exact minimum SSC GPA is pending verification with DIU Admission Office.');
    }

    if (program.minHscGpa !== null) {
      applicableRequirements.push(`Minimum HSC/Equivalent GPA: ${program.minHscGpa.toFixed(2)}`);
      if (input.hscGpa < program.minHscGpa) {
        missingRequirements.push(
          `HSC GPA ${input.hscGpa.toFixed(2)} is below the required ${program.minHscGpa.toFixed(2)}.`
        );
      }
    } else {
      conditions.push('Exact minimum HSC GPA is pending verification with DIU Admission Office.');
    }

    if (program.minCombinedGpa !== null) {
      const combined = Number((input.sscGpa + input.hscGpa).toFixed(2));
      applicableRequirements.push(`Minimum Combined (SSC + HSC) GPA: ${program.minCombinedGpa.toFixed(2)}`);
      if (combined < program.minCombinedGpa) {
        missingRequirements.push(
          `Combined GPA (${combined.toFixed(2)}) is below the required ${program.minCombinedGpa.toFixed(2)}.`
        );
      }
    }

    const allowed = program.allowedGroups;
    applicableRequirements.push(`Eligible Education Group(s): ${allowed.join(', ')}`);
    if (!allowed.includes('Any') && !allowed.includes(input.educationGroup)) {
      missingRequirements.push(
        `Education group "${input.educationGroup}" does not match allowed groups (${allowed.join(', ')}).`
      );
    }

    if (input.passingYear < referenceYear - 5) {
      conditions.push(
        `HSC passing year ${input.passingYear} may require special permission or study-gap verification from the Admission Committee.`
      );
    }
  } else {
    if (program.minBachelorCgpa !== null) {
      applicableRequirements.push(`Minimum Bachelor's CGPA: ${program.minBachelorCgpa.toFixed(2)} (out of 4.00)`);
      const cgpa = input.bachelorCgpa ?? 0;
      if (cgpa < program.minBachelorCgpa) {
        missingRequirements.push(
          `Bachelor's CGPA ${cgpa.toFixed(2)} is below the required ${program.minBachelorCgpa.toFixed(2)}.`
        );
      }
    } else {
      conditions.push('Postgraduate minimum CGPA requirement is pending verification.');
    }

    if (program.minSscGpa !== null && input.sscGpa < program.minSscGpa) {
      missingRequirements.push(
        `SSC GPA ${input.sscGpa.toFixed(2)} is below the baseline ${program.minSscGpa.toFixed(2)}.`
      );
    }
    if (program.minHscGpa !== null && input.hscGpa < program.minHscGpa) {
      missingRequirements.push(
        `HSC GPA ${input.hscGpa.toFixed(2)} is below the baseline ${program.minHscGpa.toFixed(2)}.`
      );
    }
  }

  if (program.specialRequirements.trim()) {
    conditions.push(program.specialRequirements);
  }
  if (program.verificationStatus === 'pending_verification') {
    conditions.push(
      `Program criteria (${program.effectiveSemester}) are marked as pending verification—confirm with DIU Admission Office before applying.`
    );
  }

  const hasMissing = missingRequirements.length > 0;
  let status: EligibilityResult['status'] = 'eligible';
  if (hasMissing) {
    status = 'not_eligible';
  } else if (program.verificationStatus === 'pending_verification') {
    status = 'verification_required';
  } else if (conditions.length > 0) {
    status = 'conditional';
  }

  return {
    eligible: !hasMissing,
    status,
    programName: program.name,
    applicableRequirements,
    missingRequirements,
    conditions,
    disclaimer:
      'Final admission eligibility is determined exclusively by Daffodil International University (DIU) Admission Office upon verification of original transcripts and documents.',
  };
}

export function calculateTuitionFees(
  program: Program,
  fee: FeeStructure | null,
  scholarshipWaiverPct: number = 0
): FeeCalculationResult {
  const clampedWaiver = Math.max(0, Math.min(100, scholarshipWaiverPct));

  if (!fee) {
    return {
      programName: program.name,
      effectiveSemester: program.effectiveSemester,
      verificationStatus: 'pending_verification',
      totalCredits: program.totalCredits,
      totalSemesters: program.totalSemesters,
      admissionFee: null,
      perCreditFee: null,
      baseTuitionFee: null,
      totalSemesterFees: null,
      labAndOtherFee: null,
      grossTotal: null,
      scholarshipWaiverPct: clampedWaiver,
      scholarshipDeduction: null,
      estimatedPayable: null,
      hasMissingComponents: true,
      missingComponents: ['No fee record configured for this program.'],
      disclaimer:
        'Fee information is currently unavailable. Please contact DIU Admission Office (+8809617901212) for the official fee schedule.',
    };
  }

  const missingComponents: string[] = [];
  if (fee.admissionFee === null) missingComponents.push('Admission Fee');
  if (fee.perCreditFee === null) missingComponents.push('Per-Credit Tuition Fee');
  if (fee.semesterFee === null) missingComponents.push('Semester Fee');
  if (fee.labAndOtherFee === null) missingComponents.push('Lab & Other Charges');

  const baseTuitionFee =
    fee.perCreditFee !== null ? fee.perCreditFee * program.totalCredits : null;
  const totalSemesterFees =
    fee.semesterFee !== null ? fee.semesterFee * program.totalSemesters : null;

  const scholarshipDeduction =
    baseTuitionFee !== null
      ? Math.round((baseTuitionFee * clampedWaiver) / 100)
      : null;

  let grossTotal: number | null = null;
  let estimatedPayable: number | null = null;

  if (
    fee.admissionFee !== null &&
    baseTuitionFee !== null &&
    totalSemesterFees !== null &&
    fee.labAndOtherFee !== null
  ) {
    grossTotal = fee.admissionFee + baseTuitionFee + totalSemesterFees + fee.labAndOtherFee;
    estimatedPayable = grossTotal - (scholarshipDeduction ?? 0);
  }

  return {
    programName: program.name,
    effectiveSemester: fee.effectiveSemester,
    verificationStatus: fee.verificationStatus,
    totalCredits: program.totalCredits,
    totalSemesters: program.totalSemesters,
    admissionFee: fee.admissionFee,
    perCreditFee: fee.perCreditFee,
    baseTuitionFee,
    totalSemesterFees,
    labAndOtherFee: fee.labAndOtherFee,
    grossTotal,
    scholarshipWaiverPct: clampedWaiver,
    scholarshipDeduction,
    estimatedPayable,
    hasMissingComponents: missingComponents.length > 0,
    missingComponents,
    disclaimer:
      missingComponents.length > 0
        ? `Estimated calculation is incomplete because the following verified fee components are unavailable: ${missingComponents.join(', ')}. Contact +8809617901212 for official payable amounts.`
        : 'These figures are estimated amounts based on DIU fee records. Official payable tuition is finalized by the DIU Accounts & Admission Office at enrollment (waivers typically apply to per-credit tuition fees only).',
  };
}

export function checkScholarshipEligibility(
  input: ScholarshipCheckInput,
  scholarships: Scholarship[]
): ScholarshipMatch[] {
  const combined = Number((input.sscGpa + input.hscGpa).toFixed(2));

  return scholarships
    .filter((s) => s.isActive)
    .map((s): ScholarshipMatch => {
      if (s.category === 'Female Student Waiver') {
        if (input.isFemale) {
          return {
            scholarship: s,
            matchStatus: 'potentially_eligible',
            reason: 'Matches female student eligibility criteria (subject to verified program rules).',
          };
        }
        return {
          scholarship: s,
          matchStatus: 'not_eligible',
          reason: 'Applicable to female applicants only.',
        };
      }

      if (s.category === 'Freedom Fighter') {
        if (input.isFreedomFighterWard) {
          return {
            scholarship: s,
            matchStatus: 'manual_review',
            reason: 'Requires official Freedom Fighter Gazette / Ministry certificate verification.',
          };
        }
        return {
          scholarship: s,
          matchStatus: 'not_eligible',
          reason: 'Requires Freedom Fighter ward status with valid government certification.',
        };
      }

      if (s.category === 'Sports Scholarship') {
        if (input.hasSportsAchievement) {
          return {
            scholarship: s,
            matchStatus: 'manual_review',
            reason: 'Requires verified national/university sports achievement certificates and trial review.',
          };
        }
        return {
          scholarship: s,
          matchStatus: 'not_eligible',
          reason: 'Requires recognized sports achievements.',
        };
      }

      if (s.category === 'Talent Hunt') {
        if (input.hasTalentHuntAward) {
          return {
            scholarship: s,
            matchStatus: 'manual_review',
            reason: 'Requires verification of DIU Talent Hunt award documentation.',
          };
        }
        return {
          scholarship: s,
          matchStatus: 'not_eligible',
          reason: 'Requires selection through DIU Talent Hunt competition.',
        };
      }

      if (s.category === 'Need-Based' || s.category === 'Chairman Endowment Fund') {
        if (input.needsFinancialAid) {
          return {
            scholarship: s,
            matchStatus: 'manual_review',
            reason: 'Subject to financial need assessment, committee interview, and supporting income documents.',
          };
        }
        return {
          scholarship: s,
          matchStatus: 'not_eligible',
          reason: 'Intended for students demonstrating documented financial need.',
        };
      }

      if (s.category === 'Semester GPA-Based') {
        const sgpa = input.currentSemesterGpa ?? 0;
        if (s.minSemesterGpa !== null && sgpa >= s.minSemesterGpa) {
          return {
            scholarship: s,
            matchStatus: 'potentially_eligible',
            reason: `Current/expected SGPA (${sgpa.toFixed(2)}) meets the threshold of ${s.minSemesterGpa.toFixed(2)}.`,
          };
        }
        return {
          scholarship: s,
          matchStatus: 'not_eligible',
          reason:
            s.minSemesterGpa !== null
              ? `Requires semester SGPA of at least ${s.minSemesterGpa.toFixed(2)} after enrollment.`
              : 'Requires verified semester GPA criteria.',
        };
      }

      // Result-Based or Other Verified Category
      const meetsSsc = s.minSscGpa === null || input.sscGpa >= s.minSscGpa;
      const meetsHsc = s.minHscGpa === null || input.hscGpa >= s.minHscGpa;
      const meetsCombined = s.minCombinedGpa === null || combined >= s.minCombinedGpa;

      if (meetsSsc && meetsHsc && meetsCombined) {
        return {
          scholarship: s,
          matchStatus:
            s.verificationStatus === 'pending_verification'
              ? 'manual_review'
              : 'potentially_eligible',
          reason: `SSC (${input.sscGpa.toFixed(2)}) and HSC (${input.hscGpa.toFixed(2)}) meet academic thresholds (Combined: ${combined.toFixed(2)}).`,
        };
      }

      return {
        scholarship: s,
        matchStatus: 'not_eligible',
        reason: 'Academic GPA does not meet the minimum threshold for this tier.',
      };
    });
}
