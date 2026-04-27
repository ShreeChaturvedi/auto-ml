/**
 * LoginForm - User login page
 *
 * Features:
 * - Spotlight effect background
 * - Slide-in arrow button with glowing border
 * - Email and password authentication
 * - Remember me checkbox
 * - Google sign-in CTA placeholder at the bottom
 */

import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link, useSearchParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuthStore } from '@/stores/authStore';
import { loginUser } from '@/lib/api/auth';
import { AuthCard, AuthPageWrapper } from './AuthCard';
import { AuthSubmitButton, type AuthButtonState } from './AuthSubmitButton';
import { GoogleAuthButton } from './GoogleAuthButton';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional()
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const setUser = useAuthStore((state) => state.setUser);
  const setTokens = useAuthStore((state) => state.setTokens);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authError = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.setError);
  const [formError, setFormError] = useState<string | null>(null);
  const [buttonState, setButtonState] = useState<AuthButtonState>('idle');
  const [showPassword, setShowPassword] = useState(false);
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';
  const showVerifiedMessage = searchParams.get('verified') === '1';

  const {
    register,
    handleSubmit,
    control,
    formState: { errors }
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { rememberMe: false }
  });

  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(user.email_verified ? '/' : '/verify-email/pending');
    }
  }, [isAuthenticated, user, navigate]);

  const onSubmit = async (data: LoginFormValues) => {
    setFormError(null);
    clearError(null);
    setButtonState('loading');
    try {
      const response = await loginUser(data);
      setUser(response.user);
      setTokens(response.accessToken, response.refreshToken);
      setButtonState('success');
      const dest = response.user.email_verified ? from : '/verify-email/pending';
      setTimeout(() => navigate(dest, { replace: true }), 500);
    } catch {
      setFormError('Invalid email or password');
      setButtonState('idle');
    }
  };

  return (
    <AuthPageWrapper>
      <AuthCard>
        <div className="space-y-6">
          {/* Header */}
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-white font-display">Welcome Back</h1>
            <p className="text-sm text-neutral-400">
              Enter your credentials to access your account
            </p>
          </div>

          {/* Auth-level error (e.g. unverified email redirect) */}
          {authError && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              {authError}
            </div>
          )}

          {showVerifiedMessage && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              Email verified. Sign in to continue.
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-neutral-300">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                className="border-border text-white placeholder:text-neutral-500"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-xs text-red-400">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-neutral-300">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-neutral-400 hover:text-white transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="border-border pr-10 text-white placeholder:text-neutral-500"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-neutral-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:text-white"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-400">{errors.password.message}</p>
              )}
            </div>

            <Controller
              name="rememberMe"
              control={control}
              render={({ field }) => (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="rememberMe"
                    name={field.name}
                    checked={Boolean(field.value)}
                    onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                  />
                  <Label
                    htmlFor="rememberMe"
                    className="text-sm font-normal cursor-pointer text-neutral-400"
                  >
                    Remember me for 30 days
                  </Label>
                </div>
              )}
            />

            {formError && (
              <p className="text-sm text-red-400 text-center">{formError}</p>
            )}

            <AuthSubmitButton
              state={buttonState}
              idleText="Continue"
              loadingText="Signing in..."
              successText="Welcome!"
            />
          </form>

          {/* Google OAuth - at bottom */}
          <GoogleAuthButton
            comingSoon
            mode="login"
          />
          <p className="text-center text-xs text-neutral-500">
            Google sign-in is disabled for the beta. Use email and password for now.
          </p>

          {/* Footer */}
          <p className="text-center text-sm text-neutral-400">
            Don't have an account?{' '}
            <Link to="/signup" className="text-white hover:underline font-medium">
              Sign up
            </Link>
          </p>
        </div>
      </AuthCard>
    </AuthPageWrapper>
  );
}
