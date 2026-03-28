/**
 * PasswordSection - Change-password form section extracted from ProfileSettings.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordStrength } from './PasswordStrength';
import { SaveButton, type ButtonState } from './ProfileSettings';
import { useAuthStore } from '@/stores/authStore';
import { updateProfile } from '@/lib/api/auth';

const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[a-z]/, 'Must contain a lowercase letter')
      .regex(/[A-Z]/, 'Must contain an uppercase letter'),
    confirmPassword: z.string()
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword']
  });

type PasswordChangeFormValues = z.infer<typeof passwordChangeSchema>;

export function PasswordSection() {
  const navigate = useNavigate();
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const [passwordState, setPasswordState] = useState<ButtonState>('idle');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const passwordForm = useForm<PasswordChangeFormValues>({
    resolver: zodResolver(passwordChangeSchema)
  });

  // Watch new password for strength indicator
  const newPasswordValue = passwordForm.watch('newPassword', '');
  useEffect(() => {
    setNewPassword(newPasswordValue);
  }, [newPasswordValue]);

  const onPasswordSubmit = async (data: PasswordChangeFormValues) => {
    setPasswordError(null);
    setPasswordState('loading');

    try {
      await updateProfile({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword
      });
      setPasswordState('success');
      passwordForm.reset();
      setTimeout(() => {
        clearAuth();
        navigate('/login');
      }, 1500);
    } catch (error: unknown) {
      const apiError = error as { status?: number };
      setPasswordState('error');
      if (apiError.status === 401) {
        setPasswordError('Current password is incorrect');
      } else {
        setPasswordError('Failed to change password. Please try again.');
      }
    }
  };

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <Lock className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Change Password
        </h2>
      </div>

      <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2 sm:max-w-sm">
            <Label htmlFor="currentPassword" className="text-sm font-medium">
              Current Password
            </Label>
            <Input
              id="currentPassword"
              type="password"
              placeholder="••••••••"
              className="bg-transparent"
              {...passwordForm.register('currentPassword')}
            />
            {passwordForm.formState.errors.currentPassword && (
              <p className="text-xs text-destructive">
                {passwordForm.formState.errors.currentPassword.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword" className="text-sm font-medium">
              New Password
            </Label>
            <Input
              id="newPassword"
              type="password"
              placeholder="••••••••"
              className="bg-transparent"
              {...passwordForm.register('newPassword')}
            />
            {passwordForm.formState.errors.newPassword && (
              <p className="text-xs text-destructive">
                {passwordForm.formState.errors.newPassword.message}
              </p>
            )}
            <PasswordStrength password={newPassword} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-sm font-medium">
              Confirm New Password
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              className="bg-transparent"
              {...passwordForm.register('confirmPassword')}
            />
            {passwordForm.formState.errors.confirmPassword && (
              <p className="text-xs text-destructive">
                {passwordForm.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>
        </div>

        {passwordError && (
          <p className="mt-4 text-sm text-destructive">{passwordError}</p>
        )}

        <div className="mt-6">
          <SaveButton
            state={passwordState}
            idleText="Change Password"
            loadingText="Changing..."
          />
        </div>

        {passwordState === 'success' && (
          <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">
            Password changed. Redirecting to login...
          </p>
        )}
      </form>
    </section>
  );
}
