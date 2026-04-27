/**
 * VerifyEmailPage - Consumes a verification token from a URL
 *
 * States:
 * - No token: Error with link to resend
 * - Loading: Spinner while verifying
 * - Success: Checkmark + auto-redirect to login
 * - Error: Expired/used token with link to pending page
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { verifyEmail } from '@/lib/api/auth';
import { useAuthStore } from '@/stores/authStore';
import { AuthCard, AuthPageWrapper } from './AuthCard';

type VerifyState = 'loading' | 'success' | 'error';

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const setEmailVerified = useAuthStore((state) => state.setEmailVerified);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  const [state, setState] = useState<VerifyState>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    verifyEmail(token)
      .then(() => {
        if (cancelled) return;
        setEmailVerified(true);
        setState('success');
        setTimeout(() => {
          clearAuth();
          navigate('/login?verified=1', { replace: true });
        }, 2000);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const apiErr = err as { status?: number };
        setState('error');
        setErrorMessage(
          apiErr.status === 400
            ? 'This verification link is invalid or has expired.'
            : 'Something went wrong. Please try again.'
        );
      });

    return () => { cancelled = true; };
  }, [token, navigate, setEmailVerified, clearAuth]);

  // No token in URL
  if (!token) {
    return (
      <AuthPageWrapper>
        <AuthCard>
          <div className="space-y-6 text-center">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
                <AlertCircle className="h-8 w-8 text-red-400" />
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-white font-display">Invalid verification link</h1>
              <p className="text-sm text-neutral-400">
                This link is missing a verification token. Check your email for the correct link.
              </p>
            </div>
            <Button asChild variant="secondary" className="w-full h-11 gap-2 bg-neutral-800 hover:bg-neutral-700 border-neutral-700">
              <Link to="/verify-email/pending">
                <ArrowLeft className="h-4 w-4" />
                Resend verification email
              </Link>
            </Button>
          </div>
        </AuthCard>
      </AuthPageWrapper>
    );
  }

  if (state === 'success') {
    return (
      <AuthPageWrapper>
        <AuthCard>
          <div className="space-y-6 text-center">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-white font-display">Email verified!</h1>
              <p className="text-sm text-neutral-400">
                Your email has been verified. Redirecting to login...
              </p>
            </div>
          </div>
        </AuthCard>
      </AuthPageWrapper>
    );
  }

  if (state === 'error') {
    return (
      <AuthPageWrapper>
        <AuthCard>
          <div className="space-y-6 text-center">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
                <AlertCircle className="h-8 w-8 text-red-400" />
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-white font-display">Verification failed</h1>
              <p className="text-sm text-neutral-400">{errorMessage}</p>
            </div>
            <Button asChild variant="secondary" className="w-full h-11 gap-2 bg-neutral-800 hover:bg-neutral-700 border-neutral-700">
              <Link to="/verify-email/pending">
                <ArrowLeft className="h-4 w-4" />
                Request a new link
              </Link>
            </Button>
          </div>
        </AuthCard>
      </AuthPageWrapper>
    );
  }

  // Loading state
  return (
    <AuthPageWrapper>
      <AuthCard>
        <div className="space-y-6 text-center">
          <div className="flex justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-neutral-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-white font-display">Verifying your email...</h1>
            <p className="text-sm text-neutral-400">This will only take a moment.</p>
          </div>
        </div>
      </AuthCard>
    </AuthPageWrapper>
  );
}
