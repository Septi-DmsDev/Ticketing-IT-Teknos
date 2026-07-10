export type SupportStatus = 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed';
export type FeatureRequestStatus = 'draft' | 'reviewing' | 'approved' | 'rejected' | 'in_progress' | 'testing' | 'done';

const SUPPORT_STATUS_TRANSITIONS: Record<SupportStatus, SupportStatus[]> = {
  open: ['assigned'],
  assigned: ['in_progress'],
  in_progress: ['resolved'],
  resolved: [],
  closed: [],
};

const FEATURE_REQUEST_TRANSITIONS: Record<FeatureRequestStatus, FeatureRequestStatus[]> = {
  draft: ['reviewing'],
  reviewing: ['approved', 'rejected'],
  approved: ['in_progress'],
  rejected: [],
  in_progress: ['testing'],
  testing: ['done'],
  done: [],
};

export function isValidSupportStatus(value: string): value is SupportStatus {
  return value in SUPPORT_STATUS_TRANSITIONS;
}

export function isValidFeatureRequestStatus(value: string): value is FeatureRequestStatus {
  return value in FEATURE_REQUEST_TRANSITIONS;
}

export function canTransitionSupportStatus(current: SupportStatus, next: SupportStatus): boolean {
  return SUPPORT_STATUS_TRANSITIONS[current].includes(next);
}

export function canTransitionFeatureRequestStatus(current: FeatureRequestStatus, next: FeatureRequestStatus): boolean {
  return FEATURE_REQUEST_TRANSITIONS[current].includes(next);
}
