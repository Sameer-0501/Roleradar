/**
 * RoleRadar API Client & Service Type Definitions.
 */

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  /** Optional request body (objects are automatically JSON-serialized) */
  body?: unknown;
  /** Optional URL query parameters serialized into the request URL */
  params?: Record<string, string | number | boolean | undefined | null>;
  /** Timeout in milliseconds before aborting the request (default: 15,000ms) */
  timeoutMs?: number;
  /** If true, the Authorization header is omitted even if a token is present */
  skipAuth?: boolean;
}

/**
 * Normalized API Error with sanitized user-facing messages.
 * Guarantees zero leakage of authorization tokens or private system details.
 */
export class ApiError extends Error {
  public override readonly name = 'ApiError';
  public readonly status: number;
  public readonly statusText: string;
  public readonly data?: unknown;
  public readonly details: string[];
  public readonly isUnauthorized: boolean;
  public readonly isForbidden: boolean;
  public readonly isNotFound: boolean;
  public readonly isTimeout: boolean;
  public readonly isNetworkError: boolean;
  public readonly userMessage: string;

  constructor(params: {
    message: string;
    status: number;
    statusText?: string;
    data?: unknown;
    details?: string[];
    isTimeout?: boolean;
    isNetworkError?: boolean;
  }) {
    super(params.message);
    this.status = params.status;
    this.statusText = params.statusText || '';
    this.data = params.data;
    this.details = Array.isArray(params.details) ? params.details : [];
    this.isUnauthorized = params.status === 401;
    this.isForbidden = params.status === 403;
    this.isNotFound = params.status === 404;
    this.isTimeout = !!params.isTimeout;
    this.isNetworkError = !!params.isNetworkError;

    // Build a sanitized, friendly message suitable for UI display
    if (this.isTimeout) {
      this.userMessage = 'The request timed out. Please check your network and try again.';
    } else if (this.isNetworkError) {
      this.userMessage = 'Unable to connect to the server. Please check your internet connection.';
    } else if (this.isUnauthorized) {
      this.userMessage = 'Your session has expired. Please sign in again.';
    } else if (this.isForbidden) {
      this.userMessage = 'You do not have permission to perform this action.';
    } else if (this.details.length > 0) {
      this.userMessage = this.details.join(', ');
    } else if (params.message && !params.message.toLowerCase().includes('sql') && !params.message.includes('password')) {
      this.userMessage = params.message;
    } else {
      this.userMessage = 'An unexpected error occurred. Please try again.';
    }

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

// ── Entity & Response Interfaces ─────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name?: string | null;
  isAdmin: boolean;
  isBetaUser: boolean;
  emailVerified: boolean;
  tokenVersion?: number;
}

export interface AuthResponse {
  token: string;
  user: User;
  message?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  name?: string;
}

export interface VerifyEmailResponse {
  success: boolean;
  message: string;
  email?: string;
}

export interface ResendVerificationResponse {
  success: boolean;
  message: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
}

export interface Job {
  id: string;
  companyId: string;
  companyName?: string;
  title: string;
  location?: string | null;
  workplaceType?: string | null;
  employmentType?: string | null;
  officialUrl: string;
  applyUrl?: string | null;
  officialPostedAt?: string | null;
  firstSeenAt: string;
  lastVerifiedAt?: string | null;
  status: string;
  verificationStatus: string;
  description?: string | null;
  requirements?: string | null;
  fitScore?: number;
  matchReasons?: string[];
  externalJobId?: string | null;
  externalId?: string | null;
  sourceSystem?: string | null;
  atsType?: string | null;
  company?: string | null;
  detectedAt?: string | null;
  postedAt?: string | null;
  createdAt?: string | null;
  initialVerifiedAt?: string | null;
  experienceClassification?: string | null;
  freshnessState?: string | null;
  freshnessReason?: string | null;
  relevanceScore?: number | null;
  isSaved?: boolean;
  isApplied?: boolean;
  isDismissed?: boolean;
  notes?: string | null;
  savedAt?: string | null;
  appliedAt?: string | null;
  matchExplanations?: string[];
  matchSummary?: string | null;
  interaction?: (JobInteraction & { viewedAt?: string }) | null;
}

export interface MatchedJobsOptions {
  page?: number;
  limit?: number;
  sort?: string;
  roleFilter?: string;
  q?: string;
  workplace?: string;
  freshness?: string;
  country?: string;
  location?: string;
  experience?: string;
  companyId?: string;
  isToday?: boolean;
}

export interface SearchIntentInterpretation {
  isNaturalLanguage?: boolean;
  rawQuery?: string;
  experienceLevel?: string;
  roles?: string[];
  skills?: string[];
  locations?: string[];
  country?: string;
  workplaceTypes?: string[];
}

export interface SearchSuggestionItem {
  text: string;
  category?: string;
  badge?: string;
}

export interface MatchedJobsResponse {
  jobs: Job[];
  pagination: Pagination;
  totalMatches?: number;
  searchIntent?: SearchIntentInterpretation;
}

export interface VerifiedJobsResponse {
  jobs: Job[];
  pagination: Pagination;
}

export interface JobDetailsResponse {
  job: Job;
  verifications?: Array<Record<string, unknown>>;
}

export interface JobInteraction {
  id: string;
  userId: string;
  jobId: string;
  isSaved?: boolean;
  isApplied?: boolean;
  isDismissed?: boolean;
  notes?: string | null;
  savedAt?: string | null;
  appliedAt?: string | null;
  dismissedAt?: string | null;
  lastViewedAt?: string | null;
}

export interface WorkspaceStatsResponse {
  savedCount: number;
  appliedCount: number;
  dismissedCount: number;
  recentlyViewedCount?: number;
}

export interface RecentlyViewedResponse {
  items: Job[];
  total: number;
}

export interface WorkspaceListOptions {
  page?: number;
  limit?: number;
  status?: string;
  applied?: string;
  q?: string;
}

export interface WorkspaceListResponse {
  items?: Array<Job & { interaction?: JobInteraction }>;
  jobs?: Array<Job & { interaction?: JobInteraction }>;
  total?: number;
  totalPages?: number;
  page?: number;
  limit?: number;
  pagination?: Pagination;
}

// ── Preferences & Taxonomy Interfaces ────────────────────────────────────────

export interface UserPreferences {
  id?: string;
  userId?: string;
  roles: string[];
  canonicalRoles?: string[];
  locations: string[];
  workplaceTypes: string[];
  experienceLevel: 'FRESHER' | 'EXPERIENCED' | string;
  companyIds: string[];
  companyScope?: string;
  keywords?: string[];
  roleKeywords?: string[];
  emailAlertsEnabled?: boolean;
  instantNotifications?: boolean;
  dailyDigest?: boolean;
  timezone?: string;
  onboardingCompleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Company {
  id: string;
  name: string;
  atsType?: string;
  isActive?: boolean;
  careersUrl?: string;
}

export interface CanonicalRole {
  id: string;
  displayName: string;
  domainId: string;
  domainName?: string;
  isSelectable?: boolean;
}

export interface CanonicalDomain {
  id: string;
  displayName: string;
  roles: CanonicalRole[];
}

export interface CanonicalTaxonomyResponse {
  domains: CanonicalDomain[];
}

export interface MigrationPreviewRole {
  legacyValue: string;
  canonicalRoleId: string | null;
  confidence: number;
}

export interface MigrationPreviewResponse {
  roles: MigrationPreviewRole[];
}

// ── Notifications & Alerts Interfaces ────────────────────────────────────────

export interface AlertNotificationJob {
  id: string;
  title: string;
  location: string | null;
  externalJobId: string;
  officialUrl: string;
  sourceSystem: string;
  companyName: string;
}

export interface AlertNotification {
  id: string;
  notificationType: 'INSTANT_JOB' | 'DAILY_DIGEST' | 'WINDOWED_DIGEST' | string;
  deliveryStatus: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'FAILED_PERMANENT' | string;
  sentAt: string | null;
  createdAt: string;
  isRead: boolean;
  readAt: string | null;
  failureReason: string | null;
  attemptCount: number;
  job: AlertNotificationJob | null;
}

export interface NotificationsResponse {
  notifications: AlertNotification[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UnreadCountResponse {
  unreadCount: number;
}

// ── Candidate Profile & Resume Intelligence Interfaces ───────────────────────

export interface CandidateProfileSkill {
  id?: string;
  name?: string;
  canonicalName: string;
  category?: string;
  proficiencyLevel?: string;
}

export interface CandidateProfileEducation {
  id?: string;
  degree: string;
  fieldOfStudy?: string | null;
  institution: string;
  startYear?: string | number | null;
  endYear?: string | number | null;
}

export interface CandidateProfileExperience {
  id?: string;
  title: string;
  companyName: string;
  isInternship?: boolean;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface CandidateProfileProject {
  id?: string;
  title: string;
  description?: string | null;
  technologies?: string[];
  url?: string | null;
}

export interface CandidateProfile {
  id?: string;
  userId?: string;
  fullName?: string | null;
  headline?: string | null;
  summary?: string | null;
  primaryRole?: string | null;
  targetRoles?: string[];
  experienceLevel?: string;
  totalExperienceMonths?: number;
  completenessScore?: number;
  skills?: CandidateProfileSkill[];
  educations?: CandidateProfileEducation[];
  experiences?: CandidateProfileExperience[];
  projects?: CandidateProfileProject[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Resume {
  id: string;
  userId?: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  isActive: boolean;
  createdAt: string;
}

export interface ProfileCompleteness {
  score: number;
  breakdown?: Record<string, number>;
  actionableTips?: string[];
}

export interface ResumeUploadPayload {
  filename: string;
  content?: string;
  base64?: string;
  mimeType?: string;
}

