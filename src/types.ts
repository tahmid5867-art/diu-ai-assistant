export type Language = 'en' | 'bn';

export type VerificationStatus = 'verified' | 'pending_verification';

export type AdminRole = 'SUPER_ADMIN' | 'CONTENT_ADMIN' | 'SUPPORT_ADMIN';

export type KnowledgeCategory =
  | 'Admission'
  | 'Eligibility'
  | 'Tuition Fees'
  | 'Scholarships'
  | 'Departments'
  | 'Academic Rules'
  | 'Student Handbook'
  | 'Admission Circulars'
  | 'FAQs'
  | 'Other Information';

export interface StudentUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  preferredLanguage: Language;
  interestedProgram?: string;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  active: boolean;
  createdAt: string;
}

export interface SourceReference {
  docId: string;
  title: string;
  category: string;
  sourceUrl?: string;
  effectiveSemester: string;
  verificationStatus: VerificationStatus;
  score?: number;
}

export interface MessageFeedback {
  helpful: boolean;
  rating?: number;
  comment?: string;
  submittedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  language: Language;
  createdAt: string;
  sources?: SourceReference[];
  isFallback?: boolean;
  feedback?: MessageFeedback;
}

export interface Conversation {
  id: string;
  ownerId: string;
  ownerType: 'student' | 'guest';
  ownerLabel: string;
  title: string;
  language: Language;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessagePreview: string;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  faculty: string;
  description: string;
  careerOpportunities: string[];
  internshipInfo: string;
  sourceUrl?: string;
  verificationStatus: VerificationStatus;
  updatedAt: string;
}

export interface Program {
  id: string;
  departmentId: string;
  name: string;
  degreeType: string;
  level: 'undergraduate' | 'postgraduate';
  durationYears: number;
  totalSemesters: number;
  totalCredits: number;
  curriculumSummary: string;
  coreCourses: string[];
  minSscGpa: number | null;
  minHscGpa: number | null;
  minCombinedGpa: number | null;
  minBachelorCgpa: number | null;
  allowedGroups: ('Science' | 'Business Studies' | 'Humanities' | 'Diploma' | 'Any')[];
  specialRequirements: string;
  effectiveSemester: string;
  verificationStatus: VerificationStatus;
  updatedAt: string;
}

export interface FeeStructure {
  id: string;
  programId: string;
  effectiveSemester: string;
  admissionFee: number | null;
  perCreditFee: number | null;
  semesterFee: number | null;
  labAndOtherFee: number | null;
  isCurrent: boolean;
  verificationStatus: VerificationStatus;
  notes?: string;
  createdAt: string;
}

export type ScholarshipCategory =
  | 'Result-Based'
  | 'Semester GPA-Based'
  | 'Need-Based'
  | 'Female Student Waiver'
  | 'Sports Scholarship'
  | 'Freedom Fighter'
  | 'Talent Hunt'
  | 'Chairman Endowment Fund'
  | 'Other Verified Category';

export interface Scholarship {
  id: string;
  name: string;
  category: ScholarshipCategory;
  minSscGpa: number | null;
  minHscGpa: number | null;
  minCombinedGpa: number | null;
  minSemesterGpa: number | null;
  waiverPercentage: number | null;
  waiverLabel: string;
  conditions: string;
  renewalRequirements: string;
  applicationInstructions: string;
  deadline: string;
  isActive: boolean;
  verificationStatus: VerificationStatus;
  sourceUrl?: string;
  updatedAt: string;
}

export interface FaqItem {
  id: string;
  category: KnowledgeCategory;
  questionEn: string;
  questionBn: string;
  answerEn: string;
  answerBn: string;
  sourceUrl?: string;
  isPublished: boolean;
  verificationStatus: VerificationStatus;
  updatedAt: string;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  category: KnowledgeCategory;
  sourceUrl?: string;
  uploadDate: string;
  updatedDate: string;
  effectiveSemester: string;
  verificationStatus: VerificationStatus;
  status: 'active' | 'expired';
  processingStatus: 'indexed' | 'processing' | 'failed';
  processingError?: string;
  fileName?: string;
  sourceType: 'manual' | 'pdf' | 'url';
  content: string;
  chunkCount: number;
}

export interface UnansweredQuestion {
  id: string;
  question: string;
  conversationId: string;
  contextSnippet: string;
  language: Language;
  status: 'open' | 'resolved';
  resolvedAnswer?: string;
  resolvedSourceUrl?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface AdminNotification {
  id: string;
  type: 'unanswered' | 'feedback' | 'circular' | 'pdf_failure' | 'api_error' | 'deadline';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  adminId: string;
  adminEmail: string;
  role: AdminRole;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string;
}

export interface UniversitySettings {
  universityName: string;
  admissionPhone: string;
  admissionEmail: string;
  address: string;
  websiteUrl: string;
  officialPortalUrl: string;
  officialTrackingApiConfigured: boolean;
  widget: {
    primaryColor: string;
    accentColor: string;
    welcomeMessageEn: string;
    welcomeMessageBn: string;
    defaultLanguage: Language;
    position: 'bottom-right' | 'bottom-left';
    allowedDomains: string[];
  };
}

export interface EligibilityInput {
  level: 'undergraduate' | 'postgraduate';
  sscGpa: number;
  hscGpa: number;
  educationGroup: 'Science' | 'Business Studies' | 'Humanities' | 'Diploma';
  passingYear: number;
  bachelorCgpa?: number;
  programId: string;
  currentYear?: number;
}

export interface EligibilityResult {
  eligible: boolean;
  status: 'eligible' | 'conditional' | 'not_eligible' | 'verification_required';
  programName: string;
  applicableRequirements: string[];
  missingRequirements: string[];
  conditions: string[];
  disclaimer: string;
}

export interface FeeCalculationResult {
  programName: string;
  effectiveSemester: string;
  verificationStatus: VerificationStatus;
  totalCredits: number;
  totalSemesters: number;
  admissionFee: number | null;
  perCreditFee: number | null;
  baseTuitionFee: number | null;
  totalSemesterFees: number | null;
  labAndOtherFee: number | null;
  grossTotal: number | null;
  scholarshipWaiverPct: number;
  scholarshipDeduction: number | null;
  estimatedPayable: number | null;
  hasMissingComponents: boolean;
  missingComponents: string[];
  disclaimer: string;
}

export interface ScholarshipCheckInput {
  sscGpa: number;
  hscGpa: number;
  currentSemesterGpa?: number;
  isFemale: boolean;
  isFreedomFighterWard: boolean;
  hasSportsAchievement: boolean;
  hasTalentHuntAward: boolean;
  needsFinancialAid: boolean;
}

export interface ScholarshipMatch {
  scholarship: Scholarship;
  matchStatus: 'potentially_eligible' | 'not_eligible' | 'manual_review';
  reason: string;
}
