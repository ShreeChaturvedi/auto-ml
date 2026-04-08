import { describe, it, expect } from 'vitest';
import {
  statusLabel,
  statusDotColor,
  statusBadgeVariant,
  PULSE_STATUSES,
} from '../statusHelpers';
import type { DeploymentStatus } from '@/types/deployment';

describe('statusHelpers', () => {
  describe('statusLabel', () => {
    it('capitalizes status strings', () => {
      expect(statusLabel('healthy')).toBe('Healthy');
      expect(statusLabel('creating')).toBe('Creating');
      expect(statusLabel('unhealthy')).toBe('Unhealthy');
    });
  });

  describe('statusDotColor', () => {
    it('returns green for healthy', () => {
      expect(statusDotColor('healthy')).toBe('bg-green-500');
    });

    it('returns amber for transitional states', () => {
      expect(statusDotColor('starting')).toBe('bg-amber-500');
      expect(statusDotColor('creating')).toBe('bg-amber-500');
      expect(statusDotColor('stopping')).toBe('bg-amber-500');
    });

    it('returns red for unhealthy (not amber)', () => {
      expect(statusDotColor('unhealthy')).toBe('bg-red-500');
    });

    it('returns red for failed', () => {
      expect(statusDotColor('failed')).toBe('bg-red-500');
    });

    it('returns muted for stopped', () => {
      expect(statusDotColor('stopped')).toBe('bg-muted-foreground');
    });
  });

  describe('statusBadgeVariant', () => {
    it('returns destructive for unhealthy', () => {
      expect(statusBadgeVariant('unhealthy')).toBe('destructive');
    });

    it('returns destructive for failed', () => {
      expect(statusBadgeVariant('failed')).toBe('destructive');
    });

    it('returns secondary for stopped (not destructive)', () => {
      expect(statusBadgeVariant('stopped')).toBe('secondary');
    });

    it('returns default for healthy', () => {
      expect(statusBadgeVariant('healthy')).toBe('default');
    });

    it('returns secondary for transitional states', () => {
      expect(statusBadgeVariant('starting')).toBe('secondary');
      expect(statusBadgeVariant('creating')).toBe('secondary');
      expect(statusBadgeVariant('stopping')).toBe('secondary');
    });
  });

  describe('PULSE_STATUSES', () => {
    it('includes only transitional states', () => {
      expect(PULSE_STATUSES.has('starting')).toBe(true);
      expect(PULSE_STATUSES.has('creating')).toBe(true);
    });

    it('does NOT include healthy (stable state)', () => {
      expect(PULSE_STATUSES.has('healthy')).toBe(false);
    });

    it('does NOT include other non-transitional states', () => {
      const nonPulse: DeploymentStatus[] = ['unhealthy', 'stopped', 'failed', 'stopping'];
      for (const status of nonPulse) {
        expect(PULSE_STATUSES.has(status)).toBe(false);
      }
    });
  });
});
