import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  ArrowLeft,
  Calculator,
  Award,
  Building2,
  ClipboardCheck,
  FileSearch,
  Send,
} from 'lucide-react';
import type {
  Department,
  FeeStructure,
  Language,
  Program,
  Scholarship,
  UniversitySettings,
} from '../types';
import {
  calculateTuitionFees,
  checkAdmissionEligibility,
  checkScholarshipEligibility,
} from '../utils/calculations';
import { DIU_CAMPUS_URL } from './BrandMark';

export type StudentToolTab =
  | 'chat'
  | 'eligibility'
  | 'departments'
  | 'fees'
  | 'scholarships'
  | 'tracking';

interface StudentToolsPanelProps {
  activeTool: Exclude<StudentToolTab, 'chat'>;
  language: Language;
  departments: Department[];
  programs: Program[];
  feeStructures: FeeStructure[];
  scholarships: Scholarship[];
  settings: UniversitySettings | null;
  onBackToChat: () => void;
  onAskAi: (question: string) => void;
}

function formatBdt(amount: number | null): string {
  if (amount === null) return 'Information not available';
  return `${amount.toLocaleString('en-US')} BDT`;
}

export function StudentToolsPanel({
  activeTool,
  language,
  departments,
  programs,
  feeStructures,
  scholarships,
  settings,
  onBackToChat,
  onAskAi,
}: StudentToolsPanelProps) {
  // Eligibility Checker State
  const [eligLevel, setEligLevel] = useState<'undergraduate' | 'postgraduate'>('undergraduate');
  const [sscGpa, setSscGpa] = useState('4.50');
  const [hscGpa, setHscGpa] = useState('4.25');
  const [eduGroup, setEduGroup] = useState<'Science' | 'Business Studies' | 'Humanities' | 'Diploma'>('Science');
  const [passingYear, setPassingYear] = useState('2025');
  const [bachelorCgpa, setBachelorCgpa] = useState('3.20');
  const [eligProgramId, setEligProgramId] = useState<string>(programs[0]?.id ?? '');
  const [eligSubmitted, setEligSubmitted] = useState(false);

  const filteredEligPrograms = useMemo(
    () => programs.filter((p) => p.level === eligLevel),
    [programs, eligLevel]
  );

  const selectedEligProgram = useMemo(
    () =>
      filteredEligPrograms.find((p) => p.id === eligProgramId) ??
      filteredEligPrograms[0] ??
      programs[0],
    [filteredEligPrograms, eligProgramId, programs]
  );

  const eligibilityResult = useMemo(() => {
    if (!eligSubmitted || !selectedEligProgram) return null;
    return checkAdmissionEligibility(
      {
        level: eligLevel,
        sscGpa: parseFloat(sscGpa) || 0,
        hscGpa: parseFloat(hscGpa) || 0,
        educationGroup: eduGroup,
        passingYear: parseInt(passingYear, 10) || 2025,
        bachelorCgpa: eligLevel === 'postgraduate' ? parseFloat(bachelorCgpa) || 0 : undefined,
        programId: selectedEligProgram.id,
        currentYear: 2026,
      },
      selectedEligProgram
    );
  }, [eligSubmitted, selectedEligProgram, eligLevel, sscGpa, hscGpa, eduGroup, passingYear, bachelorCgpa]);

  // Departments & Comparison State
  const [selectedDeptId, setSelectedDeptId] = useState<string>(departments[0]?.id ?? '');
  const [compareIds, setCompareIds] = useState<string[]>(
    programs.slice(0, 2).map((p) => p.id)
  );
  const [campusImgErr, setCampusImgErr] = useState(false);

  const toggleCompare = (progId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(progId)) return prev.filter((id) => id !== progId);
      if (prev.length >= 3) return [...prev.slice(1), progId];
      return [...prev, progId];
    });
  };

  // Tuition Fee Calculator State
  const [feeProgramId, setFeeProgramId] = useState<string>(programs[0]?.id ?? '');
  const [waiverPct, setWaiverPct] = useState<string>('0');

  const feeProgram = useMemo(
    () => programs.find((p) => p.id === feeProgramId) ?? programs[0],
    [programs, feeProgramId]
  );
  const currentFeeRecord = useMemo(
    () => feeStructures.find((f) => f.programId === feeProgram?.id && f.isCurrent) ?? null,
    [feeStructures, feeProgram]
  );
  const historicalFees = useMemo(
    () => feeStructures.filter((f) => f.programId === feeProgram?.id && !f.isCurrent),
    [feeStructures, feeProgram]
  );
  const feeCalculation = useMemo(() => {
    if (!feeProgram) return null;
    return calculateTuitionFees(feeProgram, currentFeeRecord, Number(waiverPct) || 0);
  }, [feeProgram, currentFeeRecord, waiverPct]);

  // Scholarship Checker State
  const [schSsc, setSchSsc] = useState('4.80');
  const [schHsc, setSchHsc] = useState('4.90');
  const [schSgpa, setSchSgpa] = useState('3.85');
  const [isFemale, setIsFemale] = useState(false);
  const [isFfWard, setIsFfWard] = useState(false);
  const [hasSports, setHasSports] = useState(false);
  const [hasTalent, setHasTalent] = useState(false);
  const [needsAid, setNeedsAid] = useState(false);
  const [schChecked, setSchChecked] = useState(false);

  const scholarshipMatches = useMemo(() => {
    if (!schChecked) return [];
    return checkScholarshipEligibility(
      {
        sscGpa: parseFloat(schSsc) || 0,
        hscGpa: parseFloat(schHsc) || 0,
        currentSemesterGpa: parseFloat(schSgpa) || undefined,
        isFemale,
        isFreedomFighterWard: isFfWard,
        hasSportsAchievement: hasSports,
        hasTalentHuntAward: hasTalent,
        needsFinancialAid: needsAid,
      },
      scholarships
    );
  }, [schChecked, schSsc, schHsc, schSgpa, isFemale, isFfWard, hasSports, hasTalent, needsAid, scholarships]);

  const titleMap: Record<Exclude<StudentToolTab, 'chat'>, { en: string; bn: string; icon: React.ReactNode }> = {
    eligibility: {
      en: 'Admission Eligibility Checker',
      bn: 'ভর্তি যোগ্যতা যাচাইকারী',
      icon: <ClipboardCheck className="h-4 w-4 text-[#065F46]" />,
    },
    departments: {
      en: 'Explore & Compare Departments',
      bn: 'বিভাগ ও প্রোগ্রাম তুলনা',
      icon: <Building2 className="h-4 w-4 text-[#065F46]" />,
    },
    fees: {
      en: 'Tuition Fee Calculator',
      bn: 'টিউশন ফি ক্যালকুলেটর',
      icon: <Calculator className="h-4 w-4 text-[#065F46]" />,
    },
    scholarships: {
      en: 'Scholarship & Waiver Checker',
      bn: 'স্কলারশিপ ও ওয়েভার যাচাই',
      icon: <Award className="h-4 w-4 text-[#065F46]" />,
    },
    tracking: {
      en: 'Application Tracking',
      bn: 'আবেদন ট্র্যাকিং',
      icon: <FileSearch className="h-4 w-4 text-[#065F46]" />,
    },
  };

  const currentMeta = titleMap[activeTool];

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4EAE6] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#064E3B]/8 border border-[#E4EAE6]">
              {currentMeta.icon}
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-[#111827]">
                {language === 'bn' ? currentMeta.bn : currentMeta.en}
              </h2>
              <p className="text-xs text-[#6B7280]">
                Daffodil International University · Verified & Admin-Managed Records
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onBackToChat}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#D1D5DB] bg-white px-3.5 py-2 text-xs font-medium text-[#374151] hover:bg-[#F3F6F4] whitespace-nowrap"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {language === 'bn' ? 'চ্যাটে ফিরুন' : 'Back to AI Chat'}
          </button>
        </div>

        {/* ================================================================ */}
        {/* 1. ADMISSION ELIGIBILITY CHECKER */}
        {/* ================================================================ */}
        {activeTool === 'eligibility' && (
          <div className="grid gap-6 lg:grid-cols-12">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setEligSubmitted(true);
              }}
              className="lg:col-span-5 space-y-4 rounded-2xl border border-[#E4EAE6] bg-white p-5"
            >
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1.5">
                  Admission Level
                </label>
                <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#F3F6F4] p-1">
                  {(['undergraduate', 'postgraduate'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => {
                        setEligLevel(lvl);
                        const first = programs.find((p) => p.level === lvl);
                        if (first) setEligProgramId(first.id);
                        setEligSubmitted(false);
                      }}
                      className={`rounded-lg py-2 text-xs font-medium capitalize transition-colors ${
                        eligLevel === lvl
                          ? 'bg-white text-[#111827] shadow-xs'
                          : 'text-[#6B7280] hover:text-[#111827]'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="elig-program" className="block text-xs font-semibold text-[#374151] mb-1">
                  Preferred Program
                </label>
                <select
                  id="elig-program"
                  value={selectedEligProgram?.id ?? ''}
                  onChange={(e) => {
                    setEligProgramId(e.target.value);
                    setEligSubmitted(false);
                  }}
                  className="w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                >
                  {filteredEligPrograms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="elig-ssc" className="block text-xs font-semibold text-[#374151] mb-1">
                    SSC / O-Level GPA
                  </label>
                  <input
                    id="elig-ssc"
                    type="number"
                    step="0.01"
                    min="0"
                    max="5"
                    value={sscGpa}
                    onChange={(e) => setSscGpa(e.target.value)}
                    className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm tabular-nums focus:border-[#065F46] focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="elig-hsc" className="block text-xs font-semibold text-[#374151] mb-1">
                    HSC / A-Level GPA
                  </label>
                  <input
                    id="elig-hsc"
                    type="number"
                    step="0.01"
                    min="0"
                    max="5"
                    value={hscGpa}
                    onChange={(e) => setHscGpa(e.target.value)}
                    className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm tabular-nums focus:border-[#065F46] focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="elig-group" className="block text-xs font-semibold text-[#374151] mb-1">
                    Education Group
                  </label>
                  <select
                    id="elig-group"
                    value={eduGroup}
                    onChange={(e) =>
                      setEduGroup(
                        e.target.value as 'Science' | 'Business Studies' | 'Humanities' | 'Diploma'
                      )
                    }
                    className="w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                  >
                    <option value="Science">Science</option>
                    <option value="Business Studies">Business Studies</option>
                    <option value="Humanities">Humanities</option>
                    <option value="Diploma">Diploma</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="elig-year" className="block text-xs font-semibold text-[#374151] mb-1">
                    Passing Year
                  </label>
                  <input
                    id="elig-year"
                    type="number"
                    min="2010"
                    max="2027"
                    value={passingYear}
                    onChange={(e) => setPassingYear(e.target.value)}
                    className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm tabular-nums focus:border-[#065F46] focus:outline-none"
                    required
                  />
                </div>
              </div>

              {eligLevel === 'postgraduate' && (
                <div>
                  <label htmlFor="elig-cgpa" className="block text-xs font-semibold text-[#374151] mb-1">
                    Bachelor&apos;s CGPA (out of 4.00)
                  </label>
                  <input
                    id="elig-cgpa"
                    type="number"
                    step="0.01"
                    min="0"
                    max="4"
                    value={bachelorCgpa}
                    onChange={(e) => setBachelorCgpa(e.target.value)}
                    className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm tabular-nums focus:border-[#065F46] focus:outline-none"
                    required
                  />
                </div>
              )}

              <button
                type="submit"
                className="w-full rounded-xl bg-[#064E3B] py-2.5 text-sm font-semibold text-white hover:bg-[#065F46] transition-colors"
              >
                Check Eligibility
              </button>
            </form>

            <div className="lg:col-span-7 rounded-2xl border border-[#E4EAE6] bg-white p-5 flex flex-col justify-between">
              {!eligibilityResult ? (
                <div className="flex flex-1 flex-col items-center justify-center text-center py-12 px-4">
                  <ClipboardCheck className="h-10 w-10 text-[#065F46]/40 mb-3" />
                  <h3 className="font-display text-base font-semibold text-[#111827]">
                    Program-Specific Eligibility Evaluation
                  </h3>
                  <p className="mt-1.5 max-w-sm text-sm text-[#6B7280]">
                    Enter your SSC, HSC, or Bachelor&apos;s academic records and click Check Eligibility to evaluate against verified DIU program criteria.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div
                    className={`flex items-start gap-3 rounded-xl border p-4 ${
                      eligibilityResult.eligible
                        ? 'border-[#059669]/30 bg-[#059669]/8'
                        : 'border-red-200 bg-red-50'
                    }`}
                  >
                    {eligibilityResult.eligible ? (
                      <CheckCircle2 className="h-5 w-5 text-[#065F46] shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-display text-sm font-bold text-[#111827]">
                        {eligibilityResult.eligible
                          ? eligibilityResult.status === 'verification_required'
                            ? 'Potentially Eligible (Semester Criteria Pending Verification)'
                            : 'Meets Program Baseline Eligibility'
                          : 'Does Not Meet Program Requirements'}
                      </p>
                      <p className="text-xs text-[#4B5563] mt-0.5">
                        {eligibilityResult.programName}
                      </p>
                    </div>
                  </div>

                  {eligibilityResult.missingRequirements.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-red-700 mb-1.5">
                        Missing Requirements
                      </h4>
                      <ul className="space-y-1 text-sm text-[#374151] list-disc pl-5">
                        {eligibilityResult.missingRequirements.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <h4 className="text-xs font-semibold text-[#374151] mb-1.5">
                      Applicable Program Requirements
                    </h4>
                    <ul className="space-y-1 text-sm text-[#374151] list-disc pl-5">
                      {eligibilityResult.applicableRequirements.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  {eligibilityResult.conditions.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-[#064E3B] mb-1.5">
                        Important Conditions
                      </h4>
                      <ul className="space-y-1 text-sm text-[#4B5563] list-disc pl-5">
                        {eligibilityResult.conditions.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="border-t border-[#E4EAE6] pt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-[#6B7280] flex-1">
                      {eligibilityResult.disclaimer}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        onAskAi(
                          `I checked eligibility for ${eligibilityResult.programName} with SSC GPA ${sscGpa}, HSC GPA ${hscGpa} (${eduGroup}). What are the next admission steps and required documents?`
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#064E3B] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#065F46] whitespace-nowrap"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Ask AI Next Steps
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* 2. DEPARTMENTS & COMPARISON */}
        {/* ================================================================ */}
        {activeTool === 'departments' && (
          <div className="space-y-6">
            <div className="overflow-hidden rounded-2xl border border-[#E4EAE6] bg-white">
              <div className="grid md:grid-cols-12">
                <div className="md:col-span-5 relative min-h-[180px] bg-[#064E3B]">
                  {!campusImgErr ? (
                    <img
                      src={DIU_CAMPUS_URL}
                      alt="Daffodil Smart City Campus Courtyard"
                      referrerPolicy="no-referrer"
                      onError={() => setCampusImgErr(true)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center p-6 text-white font-display font-semibold">
                      Daffodil Smart City, Birulia, Savar
                    </div>
                  )}
                </div>
                <div className="md:col-span-7 p-5 flex flex-col justify-between">
                  <div>
                    <p className="text-xs font-medium text-[#065F46]">
                      DIU Academic Directory · {departments.length} Departments · {programs.length} Programs
                    </p>
                    <h3 className="mt-1 font-display text-lg font-bold text-[#111827]">
                      Explore Departments & Compare Programs
                    </h3>
                    <p className="mt-1.5 text-sm text-[#4B5563]">
                      Inspect verified credit hours, duration, core courses, internship tracks, and career pathways—or compare up to 3 programs side by side.
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {departments.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setSelectedDeptId(d.id)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                          selectedDeptId === d.id
                            ? 'bg-[#064E3B] text-white'
                            : 'bg-[#F3F6F4] text-[#374151] hover:bg-[#E4EAE6]'
                        }`}
                      >
                        {d.code}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {(() => {
              const dept = departments.find((d) => d.id === selectedDeptId) ?? departments[0];
              if (!dept) return null;
              const deptProgs = programs.filter((p) => p.departmentId === dept.id);
              return (
                <div className="rounded-2xl border border-[#E4EAE6] bg-white p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E4EAE6] pb-4">
                    <div>
                      <p className="text-xs text-[#6B7280]">
                        {dept.faculty} · {dept.verificationStatus === 'verified' ? 'Verified' : 'Pending Verification'}
                      </p>
                      <h3 className="mt-0.5 font-display text-lg font-bold text-[#111827]">
                        {dept.name}
                      </h3>
                    </div>
                    {dept.sourceUrl && (
                      <a
                        href={dept.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#065F46] hover:underline"
                      >
                        Official Page
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>

                  <p className="text-sm text-[#374151] leading-relaxed">{dept.description}</p>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <h4 className="text-xs font-semibold text-[#111827] mb-1">
                        Career Opportunities
                      </h4>
                      <p className="text-sm text-[#4B5563]">
                        {dept.careerOpportunities.join(' · ') || 'Information not available'}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-[#111827] mb-1">
                        Internship & Industry Exposure
                      </h4>
                      <p className="text-sm text-[#4B5563]">
                        {dept.internshipInfo || 'Information not available'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <h4 className="text-xs font-semibold text-[#374151]">
                      Available Programs ({deptProgs.length})
                    </h4>
                    <div className="grid gap-3 md:grid-cols-2">
                      {deptProgs.map((p) => {
                        const isCompared = compareIds.includes(p.id);
                        return (
                          <div
                            key={p.id}
                            className="rounded-xl border border-[#E4EAE6] bg-[#F8FAF9] p-4 space-y-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-display text-sm font-bold text-[#111827]">
                                  {p.name}
                                </p>
                                <p className="text-xs text-[#6B7280] tabular-nums">
                                  {p.degreeType} · {p.durationYears} Years · {p.totalCredits} Credits · {p.effectiveSemester}
                                </p>
                              </div>
                            </div>
                            <p className="text-xs text-[#4B5563] leading-relaxed">
                              {p.curriculumSummary}
                            </p>
                            <p className="text-xs text-[#374151]">
                              <strong>Core Courses:</strong> {p.coreCourses.join(', ')}
                            </p>
                            <div className="flex items-center justify-between pt-1">
                              <button
                                type="button"
                                onClick={() => toggleCompare(p.id)}
                                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                  isCompared
                                    ? 'bg-[#064E3B] text-white'
                                    : 'border border-[#D1D5DB] bg-white text-[#374151] hover:bg-[#F3F6F4]'
                                }`}
                              >
                                {isCompared ? 'Added to Compare' : 'Compare Program'}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  onAskAi(`Tell me more about ${p.name} admission requirements, curriculum, and career prospects at DIU.`)
                                }
                                className="text-xs font-medium text-[#065F46] hover:underline"
                              >
                                Ask AI about this
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Side-by-side comparison matrix */}
            <div className="rounded-2xl border border-[#E4EAE6] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="font-display text-base font-bold text-[#111827]">
                    Side-by-Side Program Comparison
                  </h3>
                  <p className="text-xs text-[#6B7280]">
                    Select 2 or 3 programs above to compare verified specifications.
                  </p>
                </div>
              </div>
              {compareIds.length === 0 ? (
                <p className="text-sm text-[#6B7280]">
                  Click &ldquo;Compare Program&rdquo; on any program card to compare.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[#E4EAE6] text-[#6B7280]">
                        <th className="py-2.5 pr-4 font-semibold">Metric</th>
                        {compareIds.map((id) => {
                          const p = programs.find((pr) => pr.id === id);
                          return (
                            <th key={id} className="py-2.5 px-3 font-semibold text-[#111827]">
                              {p?.name ?? id}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E4EAE6] text-[#374151]">
                      <tr>
                        <td className="py-2.5 pr-4 font-medium text-[#6B7280]">Level / Degree</td>
                        {compareIds.map((id) => {
                          const p = programs.find((pr) => pr.id === id);
                          return (
                            <td key={id} className="py-2.5 px-3 capitalize">
                              {p ? `${p.degreeType} (${p.level})` : '—'}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-4 font-medium text-[#6B7280]">Duration</td>
                        {compareIds.map((id) => {
                          const p = programs.find((pr) => pr.id === id);
                          return (
                            <td key={id} className="py-2.5 px-3 tabular-nums">
                              {p ? `${p.durationYears} Years (${p.totalSemesters} Semesters)` : '—'}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-4 font-medium text-[#6B7280]">Total Credits</td>
                        {compareIds.map((id) => {
                          const p = programs.find((pr) => pr.id === id);
                          return (
                            <td key={id} className="py-2.5 px-3 font-mono-num">
                              {p ? `${p.totalCredits} Credits` : '—'}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-4 font-medium text-[#6B7280]">Min GPA Criteria</td>
                        {compareIds.map((id) => {
                          const p = programs.find((pr) => pr.id === id);
                          return (
                            <td key={id} className="py-2.5 px-3 tabular-nums">
                              {p
                                ? p.level === 'undergraduate'
                                  ? `SSC ${p.minSscGpa ?? 'N/A'} · HSC ${p.minHscGpa ?? 'N/A'} · Combined ${p.minCombinedGpa ?? 'N/A'}`
                                  : `Bachelor CGPA ${p.minBachelorCgpa ?? 'Pending'}`
                                : '—'}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-4 font-medium text-[#6B7280]">Per-Credit Fee</td>
                        {compareIds.map((id) => {
                          const f = feeStructures.find((fs) => fs.programId === id && fs.isCurrent);
                          return (
                            <td key={id} className="py-2.5 px-3 font-mono-num">
                              {formatBdt(f?.perCreditFee ?? null)}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-4 font-medium text-[#6B7280]">Verification Status</td>
                        {compareIds.map((id) => {
                          const p = programs.find((pr) => pr.id === id);
                          return (
                            <td key={id} className="py-2.5 px-3">
                              {p?.verificationStatus === 'verified' ? 'Verified' : 'Pending Verification'}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* 3. TUITION FEE CALCULATOR */}
        {/* ================================================================ */}
        {activeTool === 'fees' && feeCalculation && (
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-5 space-y-4 rounded-2xl border border-[#E4EAE6] bg-white p-5">
              <div>
                <label htmlFor="fee-program" className="block text-xs font-semibold text-[#374151] mb-1">
                  Select DIU Program
                </label>
                <select
                  id="fee-program"
                  value={feeProgram?.id ?? ''}
                  onChange={(e) => setFeeProgramId(e.target.value)}
                  className="w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                >
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="fee-waiver" className="block text-xs font-semibold text-[#374151] mb-1">
                  Estimated Scholarship / Tuition Waiver (%)
                </label>
                <select
                  id="fee-waiver"
                  value={waiverPct}
                  onChange={(e) => setWaiverPct(e.target.value)}
                  className="w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-sm focus:border-[#065F46] focus:outline-none"
                >
                  <option value="0">0% (No Waiver)</option>
                  <option value="10">10% (e.g., Female Student Waiver)</option>
                  <option value="25">25% (Merit Tier)</option>
                  <option value="50">50% (GPA 5.00 Tier)</option>
                  <option value="75">75% (Golden GPA 5.00 Tier)</option>
                  <option value="100">100% (Full Tuition Waiver)</option>
                </select>
              </div>

              <div className="rounded-xl border border-[#E4EAE6] bg-[#F8FAF9] p-3.5 text-xs text-[#4B5563] space-y-1">
                <p className="font-semibold text-[#111827]">
                  Schedule Metadata
                </p>
                <p>Effective Semester: {feeCalculation.effectiveSemester}</p>
                <p>
                  Record Status:{' '}
                  {feeCalculation.verificationStatus === 'verified'
                    ? 'Verified Official Schedule'
                    : 'Pending Semester Verification (Estimate)'}
                </p>
                <p className="tabular-nums">
                  Credits: {feeCalculation.totalCredits} · Semesters: {feeCalculation.totalSemesters}
                </p>
              </div>

              {historicalFees.length > 0 && (
                <div className="border-t border-[#E4EAE6] pt-3">
                  <h4 className="text-xs font-semibold text-[#374151] mb-2">
                    Historical Fee Archive
                  </h4>
                  <div className="space-y-2">
                    {historicalFees.map((hf) => (
                      <div
                        key={hf.id}
                        className="rounded-xl border border-[#E4EAE6] px-3 py-2 text-xs text-[#4B5563]"
                      >
                        <p className="font-medium text-[#111827]">
                          {hf.effectiveSemester} · {hf.verificationStatus === 'verified' ? 'Verified' : 'Archived'}
                        </p>
                        <p className="font-mono-num">
                          Per-Credit: {formatBdt(hf.perCreditFee)} · Admission: {formatBdt(hf.admissionFee)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-7 rounded-2xl border border-[#E4EAE6] bg-white p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#E4EAE6] pb-3">
                <div>
                  <h3 className="font-display text-base font-bold text-[#111827]">
                    Estimated Fee Breakdown
                  </h3>
                  <p className="text-xs text-[#6B7280]">{feeCalculation.programName}</p>
                </div>
                <span className="text-xs font-medium text-[#065F46]">
                  {feeCalculation.verificationStatus === 'verified'
                    ? 'Verified Record'
                    : 'Estimated Schedule'}
                </span>
              </div>

              <div className="divide-y divide-[#E4EAE6] text-sm">
                <div className="flex justify-between py-2.5">
                  <span className="text-[#4B5563]">Admission Fee (One-time)</span>
                  <span className="font-mono-num font-medium text-[#111827]">
                    {formatBdt(feeCalculation.admissionFee)}
                  </span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-[#4B5563]">Per-Credit Tuition Fee</span>
                  <span className="font-mono-num font-medium text-[#111827]">
                    {formatBdt(feeCalculation.perCreditFee)}
                  </span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-[#4B5563]">
                    Total Credit Tuition ({feeCalculation.totalCredits} credits)
                  </span>
                  <span className="font-mono-num font-medium text-[#111827]">
                    {formatBdt(feeCalculation.baseTuitionFee)}
                  </span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-[#4B5563]">
                    Semester Fees ({feeCalculation.totalSemesters} semesters)
                  </span>
                  <span className="font-mono-num font-medium text-[#111827]">
                    {formatBdt(feeCalculation.totalSemesterFees)}
                  </span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-[#4B5563]">Lab & Other Charges</span>
                  <span className="font-mono-num font-medium text-[#111827]">
                    {formatBdt(feeCalculation.labAndOtherFee)}
                  </span>
                </div>
                <div className="flex justify-between py-2.5 text-[#065F46]">
                  <span>
                    Estimated Scholarship Deduction ({feeCalculation.scholarshipWaiverPct}% on tuition)
                  </span>
                  <span className="font-mono-num font-semibold">
                    {feeCalculation.scholarshipDeduction !== null
                      ? `-${feeCalculation.scholarshipDeduction.toLocaleString('en-US')} BDT`
                      : 'Information not available'}
                  </span>
                </div>
                <div className="flex justify-between py-3 text-base font-bold text-[#111827]">
                  <span>Estimated Total Payable</span>
                  <span className="font-mono-num text-[#064E3B]">
                    {formatBdt(feeCalculation.estimatedPayable)}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 flex items-start gap-2.5 text-xs text-amber-900">
                <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                <p>{feeCalculation.disclaimer}</p>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* 4. SCHOLARSHIP ELIGIBILITY CHECKER */}
        {/* ================================================================ */}
        {activeTool === 'scholarships' && (
          <div className="grid gap-6 lg:grid-cols-12">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSchChecked(true);
              }}
              className="lg:col-span-5 space-y-4 rounded-2xl border border-[#E4EAE6] bg-white p-5"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sch-ssc" className="block text-xs font-semibold text-[#374151] mb-1">
                    SSC GPA
                  </label>
                  <input
                    id="sch-ssc"
                    type="number"
                    step="0.01"
                    min="0"
                    max="5"
                    value={schSsc}
                    onChange={(e) => setSchSsc(e.target.value)}
                    className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm tabular-nums focus:border-[#065F46] focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="sch-hsc" className="block text-xs font-semibold text-[#374151] mb-1">
                    HSC GPA
                  </label>
                  <input
                    id="sch-hsc"
                    type="number"
                    step="0.01"
                    min="0"
                    max="5"
                    value={schHsc}
                    onChange={(e) => setSchHsc(e.target.value)}
                    className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm tabular-nums focus:border-[#065F46] focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="sch-sgpa" className="block text-xs font-semibold text-[#374151] mb-1">
                  Current / Expected Semester GPA (For continuing waivers)
                </label>
                <input
                  id="sch-sgpa"
                  type="number"
                  step="0.01"
                  min="0"
                  max="4"
                  value={schSgpa}
                  onChange={(e) => setSchSgpa(e.target.value)}
                  className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm tabular-nums focus:border-[#065F46] focus:outline-none"
                />
              </div>

              <div className="space-y-2 pt-1">
                <p className="text-xs font-semibold text-[#374151]">
                  Applicable Special Categories
                </p>
                {[
                  { label: 'Female Student Applicant', val: isFemale, set: setIsFemale },
                  { label: 'Ward of Freedom Fighter', val: isFfWard, set: setIsFfWard },
                  { label: 'National / University Sports Achievement', val: hasSports, set: setHasSports },
                  { label: 'DIU Talent Hunt Winner / Awardee', val: hasTalent, set: setHasTalent },
                  { label: 'Applying for Need-Based / Endowment Aid', val: needsAid, set: setNeedsAid },
                ].map((opt) => (
                  <label
                    key={opt.label}
                    className="flex items-center gap-2.5 text-xs text-[#374151] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={opt.val}
                      onChange={(e) => opt.set(e.target.checked)}
                      className="h-4 w-4 rounded border-[#D1D5DB] text-[#064E3B] focus:ring-[#065F46]"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-[#064E3B] py-2.5 text-sm font-semibold text-white hover:bg-[#065F46]"
              >
                Evaluate Scholarship Categories
              </button>

              <p className="text-[11px] text-[#6B7280] leading-relaxed">
                Note: Scholarship evaluation indicates potential eligibility only and does not guarantee waiver approval. Final awards are decided by the DIU Scholarship Committee.
              </p>
            </form>

            <div className="lg:col-span-7 space-y-3">
              {!schChecked ? (
                <div className="rounded-2xl border border-[#E4EAE6] bg-white p-8 text-center">
                  <Award className="mx-auto h-10 w-10 text-[#065F46]/40 mb-3" />
                  <h3 className="font-display text-base font-semibold text-[#111827]">
                    Explore All DIU Scholarship & Waiver Policies
                  </h3>
                  <p className="mt-1.5 text-sm text-[#6B7280]">
                    Submit your academic results on the left to match against Result-Based, Semester GPA, Female Waiver, Freedom Fighter, Sports, Talent Hunt, and Endowment categories.
                  </p>
                </div>
              ) : (
                scholarshipMatches.map(({ scholarship, matchStatus, reason }) => (
                  <div
                    key={scholarship.id}
                    className="rounded-2xl border border-[#E4EAE6] bg-white p-4 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs text-[#6B7280]">
                          {scholarship.category} · {scholarship.verificationStatus === 'verified' ? 'Verified Policy' : 'Pending Verification'}
                        </p>
                        <h4 className="font-display text-sm font-bold text-[#111827]">
                          {scholarship.name}
                        </h4>
                      </div>
                      <span
                        className={`text-xs font-semibold ${
                          matchStatus === 'potentially_eligible'
                            ? 'text-[#065F46]'
                            : matchStatus === 'manual_review'
                              ? 'text-amber-700'
                              : 'text-[#6B7280]'
                        }`}
                      >
                        {matchStatus === 'potentially_eligible'
                          ? 'Potentially Eligible'
                          : matchStatus === 'manual_review'
                            ? 'Committee Verification Required'
                            : 'Not Matched'}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-[#064E3B]">{scholarship.waiverLabel}</p>
                    <p className="text-xs text-[#4B5563]">{reason}</p>
                    <div className="text-xs text-[#6B7280] space-y-0.5 border-t border-[#E4EAE6] pt-2">
                      <p>
                        <strong>Conditions:</strong> {scholarship.conditions}
                      </p>
                      <p>
                        <strong>Renewal:</strong> {scholarship.renewalRequirements}
                      </p>
                      <p>
                        <strong>How to Apply:</strong> {scholarship.applicationInstructions} (Deadline: {scholarship.deadline})
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* 5. APPLICATION TRACKING */}
        {/* ================================================================ */}
        {activeTool === 'tracking' && (
          <div className="rounded-2xl border border-[#E4EAE6] bg-white p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 border border-amber-200 shrink-0">
                <FileSearch className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <h3 className="font-display text-base font-bold text-[#111827]">
                  Official DIU Application Status Portal
                </h3>
                <p className="mt-1 text-sm text-[#4B5563] leading-relaxed">
                  {settings?.officialTrackingApiConfigured
                    ? 'Connected to the official DIU application status gateway.'
                    : 'Live application status lookup is not yet connected to the official DIU Admission ERP API. To avoid displaying inaccurate status updates, please check your application directly on the official DIU Admission Portal or contact the Admission Office.'}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 border-t border-[#E4EAE6] pt-4 text-sm">
              <div className="rounded-xl border border-[#E4EAE6] bg-[#F8FAF9] p-4 space-y-1.5">
                <p className="text-xs font-semibold text-[#374151]">Official Admission Portal</p>
                <a
                  href={settings?.officialPortalUrl ?? 'https://admission.daffodilvarsity.edu.bd/'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-[#065F46] hover:underline"
                >
                  {settings?.officialPortalUrl ?? 'https://admission.daffodilvarsity.edu.bd/'}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <div className="rounded-xl border border-[#E4EAE6] bg-[#F8FAF9] p-4 space-y-1">
                <p className="text-xs font-semibold text-[#374151]">DIU Admission Office</p>
                <p className="font-mono-num text-[#111827]">
                  {settings?.admissionPhone ?? '+8809617901212'}
                </p>
                <p className="text-xs text-[#4B5563]">
                  {settings?.admissionEmail ?? 'admission@daffodilvarsity.edu.bd'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
