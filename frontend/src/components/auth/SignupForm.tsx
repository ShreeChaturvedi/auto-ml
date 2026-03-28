/**
 * SignupForm - User registration page
 *
 * Features:
 * - Wider card for more fields
 * - Spotlight effect background
 * - Password strength indicator (no label)
 * - Password match indicator
 * - Google OAuth at the bottom
 */

import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/authStore';
import { registerUser, googleAuth } from '@/lib/api/auth';
import { AuthCard, AuthPageWrapper } from './AuthCard';
import { AuthSubmitButton, type AuthButtonState } from './AuthSubmitButton';
import { GoogleAuthButton } from './GoogleAuthButton';
import { PasswordStrength } from './PasswordStrength';
import { PasswordMatch } from './PasswordMatch';

const signupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword']
});

type SignupFormValues = z.infer<typeof signupSchema>;

export function SignupForm() {
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);
  const setTokens = useAuthStore((state) => state.setTokens);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [formError, setFormError] = useState<string | null>(null);
  const [buttonState, setButtonState] = useState<AuthButtonState>('idle');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema)
  });

  const password = watch('password') || '';
  const confirmPassword = watch('confirmPassword') || '';

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const onSubmit = async (data: SignupFormValues) => {
    setFormError(null);
    setButtonState('loading');
    try {
      const { name, email, password } = data;
      const response = await registerUser({ name, email, password });
      setUser(response.user);
      setTokens(response.accessToken, response.refreshToken);
      setButtonState('success');
      setTimeout(() => navigate('/'), 500);
    } catch (error: unknown) {
      if (error instanceof Error && 'status' in error && (error as { status: number }).status === 409) {
        setFormError('Email already registered');
      } else {
        setFormError('Registration failed. Please try again.');
      }
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
            <h1 className="text-2xl font-semibold tracking-tight text-white">Create an Account</h1>
            <p className="text-sm text-neutral-400">
              Enter your information to get started
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-neutral-300">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                autoComplete="name"
                className="dark:bg-white/[0.03] border-border hover:border-ring text-white placeholder:text-neutral-500 focus-visible:ring-ring"
                {...register('name')}
              />
              {errors.name && (
                <p className="text-xs text-red-400">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-neutral-300">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                className="dark:bg-white/[0.03] border-border hover:border-ring text-white placeholder:text-neutral-500 focus-visible:ring-ring"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-xs text-red-400">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-neutral-300">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a password"
                  autoComplete="new-password"
                  className="dark:bg-white/[0.03] border-border hover:border-ring pr-10 text-white placeholder:text-neutral-500 focus-visible:ring-ring"
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
              <PasswordStrength password={password} />
              {errors.password && (
                <p className="text-xs text-red-400">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-neutral-300">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm your password"
                  autoComplete="new-password"
                  className="dark:bg-white/[0.03] border-border hover:border-ring pr-10 text-white placeholder:text-neutral-500 focus-visible:ring-ring"
                  {...register('confirmPassword')}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-neutral-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:text-white"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordMatch password={password} confirmPassword={confirmPassword} />
              {errors.confirmPassword && (
                <p className="text-xs text-red-400">{errors.confirmPassword.message}</p>
              )}
            </div>

            {formError && (
              <p className="text-sm text-red-400 text-center">{formError}</p>
            )}

            <AuthSubmitButton
              state={buttonState}
              idleText="Continue"
              loadingText="Creating account..."
              successText="Account created!"
            />
          </form>

          {/* Google OAuth - at bottom */}
          <GoogleAuthButton
            onClick={handleGoogleAuth}
            isLoading={googleLoading}
            mode="signup"
          />

          {/* Footer */}
          <p className="text-center text-sm text-neutral-400">
            Already have an account?{' '}
            <Link to="/login" className="text-white hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </AuthCard>
    </AuthPageWrapper>
  );
}
