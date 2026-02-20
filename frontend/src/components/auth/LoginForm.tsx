/**
 * LoginForm - User login page
 *
 * Features:
 * - Spotlight effect background
 * - Slide-in arrow button with glowing border
 * - Email and password authentication
 * - Remember me checkbox
 * - Google OAuth at the bottom
 */

import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuthStore } from '@/stores/authStore';
import { loginUser, googleAuth } from '@/lib/api/auth';
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
  const { setUser, setTokens, isAuthenticated } = useAuthStore();
  const [formError, setFormError] = useState<string | null>(null);
  const [buttonState, setButtonState] = useState<AuthButtonState>('idle');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';

  const {
    register,
    handleSubmit,
    control,
    formState: { errors }
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { rememberMe: false }
  });

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const onSubmit = async (data: LoginFormValues) => {
    setFormError(null);
    setButtonState('loading');
    try {
      const response = await loginUser(data);
      setUser(response.user);
      setTokens(response.accessToken, response.refreshToken);
      setButtonState('success');
      setTimeout(() => navigate(from, { replace: true }), 500);
    } catch {
      setFormError('Invalid email or password');
      setButtonState('idle');
    }
  };

  const handleGoogleAuth = async () => {
    setGoogleLoading(true);
    setFormError(null);
    try {
      const response = await googleAuth();
      if (response.authUrl) {
        window.location.href = response.authUrl;
      }
    } catch {
      setFormError('Google authentication failed. Please try again.');
      setGoogleLoading(false);
    }
  };

  return (
    <AuthPageWrapper>
      <AuthCard>
        <div className="space-y-6">
          {/* Header */}
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-white">Welcome Back</h1>
            <p className="text-sm text-neutral-400">
              Enter your credentials to access your account
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-neutral-300">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                className="bg-neutral-900/50 border-neutral-700 text-white placeholder:text-neutral-500"
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
                  className="bg-neutral-900/50 border-neutral-700 pr-10 text-white placeholder:text-neutral-500"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-neutral-400 transition-colors hover:text-white"
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
            onClick={handleGoogleAuth}
            isLoading={googleLoading}
            mode="login"
          />

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
