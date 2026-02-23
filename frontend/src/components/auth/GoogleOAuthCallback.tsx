/**
 * GoogleOAuthCallback - Handles the OAuth redirect from Google
 *
 * This component:
 * 1. Extracts the authorization code from the URL
 * 2. Sends it to the backend to exchange for tokens
 * 3. Stores the tokens and redirects to the app
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { googleCallback } from '@/lib/api/auth';
import { AuthCard, AuthPageWrapper } from './AuthCard';

export function GoogleOAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setUser, setTokens } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError('Google authentication was cancelled or failed.');
      return;
    }

    if (!code) {
      setError('No authorization code received from Google.');
      return;
    }

    // Exchange the code for tokens
    const exchangeCode = async () => {
      try {
        const response = await googleCallback(code);
        setUser(response.user);
        setTokens(response.accessToken, response.refreshToken);
        navigate('/', { replace: true });
      } catch (err) {
        console.error('Google OAuth callback error:', err);
        setError('Failed to complete Google authentication. Please try again.');
      }
    };

    exchangeCode();
  }, [searchParams, navigate, setUser, setTokens]);

  if (error) {
    return (
      <AuthPageWrapper>
        <AuthCard>
          <div className="space-y-6 text-center">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">Authentication Failed</h1>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button
              variant="secondary"
              className="w-full h-11"
              onClick={() => navigate('/login')}
            >
              Back to Login
            </Button>
          </div>
        </AuthCard>
      </AuthPageWrapper>
    );
  }

  return (
    <AuthPageWrapper>
      <AuthCard>
        <div className="space-y-6 text-center py-8">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <div className="space-y-2">
            <h1 className="text-xl font-semibold tracking-tight">Completing sign in...</h1>
            <p className="text-sm text-muted-foreground">
              Please wait while we complete your Google authentication.
            </p>
          </div>
        </div>
      </AuthCard>
    </AuthPageWrapper>
  );
}
