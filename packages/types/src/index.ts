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
