/**
 * VerifyEmailPendingPage - Post-signup gate shown until the user verifies
 *
 * Features:
 * - Resend button with 60s cooldown countdown
 * - Email correction inline form
 * - Background polling (5s) for verification status
 * - Pauses polling when tab is hidden
 * - Logout link
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/client';
import { useAuthStore } from '@/stores/authStore';
import { resendVerification, getVerificationStatus } from '@/lib/api/auth';
import { AuthCard, AuthPageWrapper } from './AuthCard';
import { AuthSubmitButton, type AuthButtonState } from './AuthSubmitButton';

const emailSchema = z.string().email();

const COOLDOWN_SECONDS = 60;
const POLL_INTERVAL_MS = 5_000;

export function VerifyEmailPendingPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const setEmailVerified = useAuthStore((state) => state.setEmailVerified);

  const [cooldown, setCooldown] = useState(0);
  const [resendState, setResendState] = useState<AuthButtonState>('idle');
  const [showEmailEdit, setShowEmailEdit] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSaving, setEmailSaving] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Already verified — redirect to dashboard
  useEffect(() => {
    if (user?.email_verified) {
      navigate('/', { replace: true });
    }
  }, [user?.email_verified, navigate]);

  // Cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1_000);
    return () => clearInterval(id);
  }, [cooldown]);

  // Polling for verification status
  const pollStatus = useCallback(async () => {
    try {
      const { emailVerified } = await getVerificationStatus();
      if (emailVerified) {
        setEmailVerified(true);
        toast.success('Email verified!');
        setTimeout(() => {
          clearAuth();
          navigate('/login?verified=1', { replace: true });
        }, 600);
      }
    } catch {
      // Silently ignore polling errors
    }
  }, [navigate, setEmailVerified, clearAuth]);

  useEffect(() => {
    pollRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);

    const handleVisibility = () => {
      // Always clear the existing interval before starting a new one to prevent leaks
      if (pollRef.current) clearInterval(pollRef.current);
      if (!document.hidden) {
        void pollStatus();
        pollRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [pollStatus]);

  const handleResend = async () => {
    setResendState('loading');
    try {
      await resendVerification();
      setResendState('success');
      setCooldown(COOLDOWN_SECONDS);
      setTimeout(() => setResendState('idle'), 2000);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 429) {
        const retryAfter = (err.payload as { retryAfter?: number })?.retryAfter ?? COOLDOWN_SECONDS;
        setCooldown(retryAfter);
      }
      setResendState('idle');
    }
  };

  const handleEmailCorrection = async () => {
    setEmailError(null);
    const trimmed = newEmail.trim().toLowerCase();
    if (!emailSchema.safeParse(trimmed).success) {
      setEmailError('Enter a valid email address');
      return;
    }
    setEmailSaving(true);
    try {
      await resendVerification(trimmed);
      setCooldown(COOLDOWN_SECONDS);
      setShowEmailEdit(false);
      setNewEmail('');
      if (user) setUser({ ...user, email: trimmed });
      toast.success('Verification email sent to new address');
    } catch {
      setEmailError('Failed to update email. Please try again.');
    } finally {
      setEmailSaving(false);
    }
  };

  const handleLogout = () => {
    clearAuth();
    navigate('/login', { replace: true });
  };

  const displayEmail = user?.email ?? 'your email';

  return (
    <AuthPageWrapper>
      <AuthCard>
        <div className="space-y-6">
          {/* Header */}
          <div className="space-y-4 text-center">
            <div className="flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-800">
                <Mail className="h-7 w-7 text-neutral-300" />
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-white font-display">Check your email</h1>
              <p className="text-sm text-neutral-400">
                We sent a verification link to{' '}
                <span className="font-medium text-white">{displayEmail}</span>.
              </p>
            </div>
          </div>

          {/* Resend */}
          <div>
            {cooldown > 0 ? (
              <Button
                disabled
                variant="secondary"
                className="w-full h-11 text-sm bg-neutral-800 border-neutral-700 text-neutral-500"
              >
                Resend in {cooldown}s
              </Button>
            ) : (
              <AuthSubmitButton
                state={resendState}
                type="button"
                onClick={handleResend}
                idleText="Resend verification email"
                loadingText="Sending..."
                successText="Email sent!"
              />
            )}
          </div>

          {/* Email correction */}
          {!showEmailEdit ? (
            <p className="text-center text-sm text-neutral-500">
              Wrong email?{' '}
              <button
                type="button"
                onClick={() => setShowEmailEdit(true)}
                className="text-white hover:underline font-medium"
              >
                Update it
              </button>
            </p>
          ) : (
            <div className="space-y-3">
              <Input
                type="email"
                placeholder="new@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEmailCorrection()}
                className="border-border text-white placeholder:text-neutral-500"
                aria-label="New email address"
              />
              {emailError && <p className="text-xs text-red-400">{emailError}</p>}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1 h-10 bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-sm"
                  onClick={() => { setShowEmailEdit(false); setEmailError(null); }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1 h-10 bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-sm"
                  disabled={emailSaving}
                  onClick={handleEmailCorrection}
                >
                  {emailSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update & resend'}
                </Button>
              </div>
            </div>
          )}

          {/* Logout */}
          <p className="text-center">
            <button
              type="button"
              onClick={handleLogout}
              className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              Sign out
            </button>
          </p>
        </div>
      </AuthCard>
    </AuthPageWrapper>
  );
}
