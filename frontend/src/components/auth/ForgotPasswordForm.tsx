/**
 * ForgotPasswordForm - Request password reset email
 *
 * Features:
 * - Spotlight effect background
 * - Slide-in arrow button
 * - Success state with visual feedback
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { forgotPassword } from '@/lib/api/auth';
import { CheckCircle2, ArrowLeft, Mail } from 'lucide-react';
import { AuthCard, AuthPageWrapper } from './AuthCard';
import { AuthSubmitButton, type AuthButtonState } from './AuthSubmitButton';

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address')
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [buttonState, setButtonState] = useState<AuthButtonState>('idle');

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema)
  });

  const onSubmit = async (data: ForgotPasswordFormValues) => {
    setFormError(null);
    setButtonState('loading');
    try {
      await forgotPassword(data);
      setButtonState('success');
      setTimeout(() => setSuccess(true), 500);
    } catch {
      setFormError('An error occurred. Please try again.');
      setButtonState('idle');
    }
  };

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
              <h1 className="text-2xl font-semibold tracking-tight text-white">Check your email</h1>
              <p className="text-sm text-neutral-400">
                If an account exists with that email address, we've sent instructions
                to reset your password.
              </p>
            </div>
            <p className="text-xs text-neutral-500">
              Didn't receive an email? Check your spam folder or contact support.
            </p>

            <Button asChild variant="secondary" className="w-full h-11 gap-2 bg-neutral-800 hover:bg-neutral-700 border-neutral-700">
              <Link to="/login">
                <ArrowLeft className="h-4 w-4" />
                Back to login
              </Link>
            </Button>
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
                <Mail className="h-7 w-7 text-neutral-300" />
              </div>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Forgot password?</h1>
            <p className="text-sm text-neutral-400">
              Enter your email address and we'll send you instructions to reset your password.
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

            {formError && (
              <p className="text-sm text-red-400 text-center">{formError}</p>
            )}

            <AuthSubmitButton
              state={buttonState}
              idleText="Send Instructions"
              loadingText="Sending..."
              successText="Email sent!"
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
