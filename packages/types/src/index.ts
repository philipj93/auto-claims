/**
 * Shared domain types for the Auto Insurance Claims system.
 * Consumed by both the NestJS API and the Next.js web app.
 */

// ----- Enums -----

export enum ClaimStatus {
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  DENIED = 'DENIED',
  PAID = 'PAID',
  CLOSED = 'CLOSED',
}

export enum ClaimType {
  COLLISION = 'COLLISION',
  COMPREHENSIVE = 'COMPREHENSIVE',
  LIABILITY = 'LIABILITY',
  UNINSURED_MOTORIST = 'UNINSURED_MOTORIST',
  PERSONAL_INJURY = 'PERSONAL_INJURY',
  GLASS = 'GLASS',
  THEFT = 'THEFT',
}

export enum FaultDetermination {
  AT_FAULT = 'AT_FAULT',
  NOT_AT_FAULT = 'NOT_AT_FAULT',
  PARTIAL = 'PARTIAL',
  UNDETERMINED = 'UNDETERMINED',
}

export enum PolicyStatus {
  ACTIVE = 'ACTIVE',
  LAPSED = 'LAPSED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum DocumentType {
  PHOTO = 'PHOTO',
  POLICE_REPORT = 'POLICE_REPORT',
  ESTIMATE = 'ESTIMATE',
  INVOICE = 'INVOICE',
  CORRESPONDENCE = 'CORRESPONDENCE',
  OTHER = 'OTHER',
}

// ----- Entity shapes (serialized / API responses) -----

export interface User {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  vin: string;
  licensePlate: string | null;
  color: string | null;
}

export interface Policy {
  id: string;
  policyNumber: string;
  status: PolicyStatus;
  premium: number;
  deductible: number;
  coverageLimit: number;
  effectiveDate: string;
  expirationDate: string;
}

export interface ClaimDocument {
  id: string;
  type: DocumentType;
  fileName: string;
  url: string;
  createdAt: string;
}

export interface ClaimNote {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface Claim {
  id: string;
  claimNumber: string;
  status: ClaimStatus;
  type: ClaimType;
  faultDetermination: FaultDetermination;
  description: string;
  incidentDate: string;
  reportedDate: string;
  incidentLocation: string | null;
  estimatedAmount: number;
  approvedAmount: number | null;
  deductible: number;
  injuryReported: boolean;
  policeReportNumber: string | null;
  adjusterName: string | null;
  createdAt: string;
  updatedAt: string;
  // relations (present on detail responses)
  user?: User;
  vehicle?: Vehicle;
  policy?: Policy | null;
  documents?: ClaimDocument[];
  notes?: ClaimNote[];
}

// ----- Pagination -----

export interface PaginationMeta {
  /** Current page number (1-based). */
  page: number;
  /** Maximum number of items per page. */
  limit: number;
  /** Total number of items across all pages. */
  total: number;
  /** Total number of pages given `total` and `limit`. */
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

/** A single page of results plus the metadata needed to render page controls. */
export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

// ----- Request payloads -----

export interface CreateClaimInput {
  userId: string;
  vehicleId: string;
  policyId?: string;
  type: ClaimType;
  description: string;
  incidentDate: string;
  incidentLocation?: string;
  estimatedAmount: number;
  deductible?: number;
  injuryReported?: boolean;
  policeReportNumber?: string;
}

export interface UpdateClaimStatusInput {
  status: ClaimStatus;
  approvedAmount?: number;
  adjusterName?: string;
}

// ----- Auth -----

/** Credentials for POST /api/auth/login. */
export interface LoginInput {
  username: string;
  password: string;
}

/** Body for POST /api/auth/register — creates a user and signs them in. */
export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

/** Safe, public view of the authenticated user — never includes the password hash. */
export interface AuthUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
}

/**
 * A short-lived access token paired with the opaque refresh token used to mint
 * new access tokens. Shared by every endpoint that issues credentials, so the
 * "always a fresh pair" invariant lives in one place.
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Response from login/register: a fresh token pair plus the signed-in user. */
export interface AuthResponse extends TokenPair {
  user: AuthUser;
}

/** Body carrying a single refresh token (POST /api/auth/refresh and /logout). */
export interface RefreshTokenBody {
  refreshToken: string;
}

/** Body for POST /api/auth/refresh — exchanges a refresh token for a fresh pair. */
export type RefreshInput = RefreshTokenBody;

/** Body for POST /api/auth/logout — revokes the session behind this refresh token. */
export type LogoutInput = RefreshTokenBody;

/**
 * Response from POST /api/auth/refresh: a new access token plus the **rotated**
 * refresh token. The presented refresh token is invalid after this call.
 */
export type RefreshResponse = TokenPair;

/** Decoded JWT claims. `sub` is the user id. */
export interface JwtPayload {
  sub: string;
  username: string;
}
