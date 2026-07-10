import { describe, expect, it } from 'vitest';
import {
  canTransitionFeatureRequestStatus,
  canTransitionSupportStatus,
  isValidFeatureRequestStatus,
  isValidSupportStatus,
} from './status-flow';

describe('status-flow', () => {
  it('validates support statuses correctly', () => {
    expect(isValidSupportStatus('open')).toBe(true);
    expect(isValidSupportStatus('resolved')).toBe(true);
    expect(isValidSupportStatus('random')).toBe(false);
  });

  it('allows only forward support transitions', () => {
    expect(canTransitionSupportStatus('open', 'assigned')).toBe(true);
    expect(canTransitionSupportStatus('assigned', 'resolved')).toBe(false);
    expect(canTransitionSupportStatus('resolved', 'closed')).toBe(false);
  });

  it('validates feature request statuses correctly', () => {
    expect(isValidFeatureRequestStatus('reviewing')).toBe(true);
    expect(isValidFeatureRequestStatus('done')).toBe(true);
    expect(isValidFeatureRequestStatus('shipped')).toBe(false);
  });

  it('allows only configured feature-request transitions', () => {
    expect(canTransitionFeatureRequestStatus('reviewing', 'approved')).toBe(true);
    expect(canTransitionFeatureRequestStatus('approved', 'testing')).toBe(false);
    expect(canTransitionFeatureRequestStatus('testing', 'done')).toBe(true);
  });
});
