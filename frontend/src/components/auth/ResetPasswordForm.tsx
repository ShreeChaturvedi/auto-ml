/**
 * ResetPasswordForm - Complete password reset with token
 *
 * Features:
 * - Frosted glass card design
 * - Animated submit button with glowing border
 * - Password strength indicator
 * - Password match indicator
 * - Token validation from URL
 */

import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordStrength } from './PasswordStrength';
import { PasswordMatch } from './PasswordMatch';
import { resetPassword } from '@/lib/api/auth';
import { CheckCircle2, AlertCircle, KeyRound, ArrowLeft } from 'lucide-react';
import { AuthCard, AuthPageWrapper } from './AuthCard';
import { AuthSubmitButton, type AuthButtonState } from './AuthSubmitButton';

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[a-z]/, 'Password must contain a lowercase letter')
      .regex(/[A-Z]/, 'Password must contain an uppercase letter'),
    confirmPassword: z.string()
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword']
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [buttonState, setButtonState] = useState<AuthButtonState>('idle');

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema)
  });

  const password = watch('password') || '';
  const confirmPassword = watch('confirmPassword') || '';

  const onSubmit = async (data: ResetPasswordFormValues) => {
    if (!token) {
      setFormError('Invalid or missing reset token');
      return;
    }

    setFormError(null);
    setButtonState('loading');
    try {
      await resetPassword({ token, password: data.password });
      setButtonState('success');
      setSuccess(true);
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (error: unknown) {
      const apiError = error as { status?: number };
      setButtonState('idle');
      if (apiError.status === 400) {
        setFormError('This reset link is invalid or has expired. Please request a new one.');
      } else {
        setFormError('An error occurred. Please try again.');
      }
    }
  };

  // Show error if no token
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
              <h1 className="text-2xl font-semibold tracking-tight text-white">Invalid reset link</h1>
              <p className="text-sm text-neutral-400">
                This password reset link is invalid or has expired. Please request a new one.
              </p>
            </div>

            <Button asChild variant="secondary" className="w-full h-11 gap-2 bg-neutral-800 hover:bg-neutral-700 border-neutral-700">
              <Link to="/forgot-password">
                <ArrowLeft className="h-4 w-4" />
                Request new reset link
              </Link>
            </Button>
          </div>
        </AuthCard>
      </AuthPageWrapper>
    );
  }

  if (success) {
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
              <h1 className="text-2xl font-semibold tracking-tight text-white">Password reset successful</h1>
              <p className="text-sm text-neutral-400">
                Your password has been changed. Redirecting to login...
              </p>
            </div>
          </div>
        </AuthCard>
      </AuthPageWrapper>
    );
  }

  return (
    <AuthPageWrapper>
      <AuthCard>
        <div className="space-y-6">
          {/* Header */}
          <div className="space-y-2 text-center">
            <div className="flex justify-center mb-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-800">
                <KeyRound className="h-7 w-7 text-neutral-300" />
              </div>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Reset your password</h1>
            <p className="text-sm text-neutral-400">
              Enter a new password for your account
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-neutral-300">New Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Create a new password"
                autoComplete="new-password"
                className="bg-neutral-900/50 border-neutral-700 text-white placeholder:text-neutral-500"
                {...register('password')}
              />
              <PasswordStrength password={password} />
              {errors.password && (
                <p className="text-xs text-red-400">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-neutral-300">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your new password"
                autoComplete="new-password"
                className="bg-neutral-900/50 border-neutral-700 text-white placeholder:text-neutral-500"
                {...register('confirmPassword')}
              />
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
              idleText="Reset Password"
              loadingText="Resetting..."
              successText="Password reset!"
            />

            <Button asChild variant="ghost" className="w-full h-11 gap-2 text-neutral-400 hover:text-white hover:bg-neutral-800">
              <Link to="/login">
                <ArrowLeft className="h-4 w-4" />
                Back to login
              </Link>
            </Button>
          </form>
        </div>
      </AuthCard>
    </AuthPageWrapper>
  );
}
