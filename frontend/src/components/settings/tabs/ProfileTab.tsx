/**
 * ProfileTab — Profile, security, and danger-zone settings.
 *
 * Three sections:
 *   1. Profile Information — name + email, server-persisted
 *   2. Security — change password, server-persisted
 *   3. Danger Zone — sign out all devices
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, Lock, User } from 'lucide-react';
import { toast } from 'sonner';

import { SettingsSection } from '@/components/settings/SettingsSection';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { SaveButton, type ButtonState } from '@/components/settings/SaveButton';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/authStore';
import { updateProfile } from '@/lib/api/auth';
import { apiRequest } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const profileInfoSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[a-z]/, 'Lowercase letter required')
      .regex(/[A-Z]/, 'Uppercase letter required'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type ProfileInfoValues = z.infer<typeof profileInfoSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

// ---------------------------------------------------------------------------
// ProfileTab
// ---------------------------------------------------------------------------

export function ProfileTab() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  // Profile form state
  const [profileState, setProfileState] = useState<ButtonState>('idle');
  const [profileError, setProfileError] = useState<string | null>(null);

  const profileForm = useForm<ProfileInfoValues>({
    resolver: zodResolver(profileInfoSchema),
    defaultValues: {
      name: user?.name ?? '',
      email: user?.email ?? '',
    },
  });

  const onProfileSubmit = async (data: ProfileInfoValues) => {
    setProfileError(null);
    setProfileState('loading');
    try {
      const response = await updateProfile({ name: data.name, email: data.email });
      setUser(response.user);
      setProfileState('success');
      setTimeout(() => setProfileState('idle'), 2000);
    } catch (error: unknown) {
      setProfileState('error');
      const apiError = error as { status?: number };
      setProfileError(
        apiError.status === 409
          ? 'Email is already taken.'
          : 'Failed to update profile. Please try again.',
      );
    }
  };

  // Password form state
  const [passwordState, setPasswordState] = useState<ButtonState>('idle');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
  });

  const newPasswordValue = passwordForm.watch('newPassword', '');

  const onPasswordSubmit = async (data: PasswordValues) => {
    setPasswordError(null);
    setPasswordState('loading');
    try {
      await updateProfile({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
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
      setPasswordError(
        apiError.status === 401
          ? 'Current password is incorrect.'
          : 'Failed to change password. Please try again.',
      );
    }
  };

  // Revoke all sessions
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const handleRevokeAll = async () => {
    setRevoking(true);
    try {
      await apiRequest('/auth/revoke-all-sessions', { method: 'POST' });
      clearAuth();
      navigate('/login');
    } catch {
      toast.error('Failed to sign out all devices. Please try again.');
    } finally {
      setRevoking(false);
      setShowRevokeDialog(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------------ */}
      {/* Section 1: Profile Information                                       */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <SettingsSection icon={User} title="Profile Information">
          <form onSubmit={profileForm.handleSubmit(onProfileSubmit)}>
            <SettingsRow label="Full name" htmlFor="name">
              <div className="space-y-1">
                <Input
                  id="name"
                  placeholder="John Doe"
                  className="w-[250px] bg-transparent"
                  {...profileForm.register('name')}
                />
                {profileForm.formState.errors.name && (
                  <p className="text-xs text-destructive">
                    {profileForm.formState.errors.name.message}
                  </p>
                )}
              </div>
            </SettingsRow>

            <SettingsRow label="Email address" htmlFor="email">
              <div className="space-y-1">
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  className="w-[250px] bg-transparent"
                  {...profileForm.register('email')}
                />
                {profileForm.formState.errors.email && (
                  <p className="text-xs text-destructive">
                    {profileForm.formState.errors.email.message}
                  </p>
                )}
              </div>
            </SettingsRow>

            {profileError && (
              <p className="px-5 pb-4 text-sm text-destructive">{profileError}</p>
            )}

            <div className="px-5 pb-5 pt-1">
              <SaveButton
                state={profileState}
                idleText="Save Changes"
                loadingText="Saving..."
              />
            </div>
          </form>
        </SettingsSection>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2: Security                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <SettingsSection icon={Lock} title="Security">
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}>
            <div className="px-5 py-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword" className="text-sm font-medium">
                  Current Password
                </Label>
                <Input
                  id="currentPassword"
                  type="password"
                  placeholder="••••••••"
                  className="max-w-sm bg-transparent"
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
                  className="max-w-sm bg-transparent"
                  {...passwordForm.register('newPassword')}
                />
                {passwordForm.formState.errors.newPassword && (
                  <p className="text-xs text-destructive">
                    {passwordForm.formState.errors.newPassword.message}
                  </p>
                )}
                <div className="max-w-sm">
                  <PasswordStrength password={newPasswordValue} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">
                  Confirm Password
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  className="max-w-sm bg-transparent"
                  {...passwordForm.register('confirmPassword')}
                />
                {passwordForm.formState.errors.confirmPassword && (
                  <p className="text-xs text-destructive">
                    {passwordForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>

              {passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}

              <div className="flex items-center gap-4">
                <SaveButton
                  state={passwordState}
                  idleText="Change Password"
                  loadingText="Changing..."
                />
                {passwordState === 'success' && (
                  <p className="text-sm text-emerald-600 dark:text-emerald-400">
                    Password changed. Redirecting to login...
                  </p>
                )}
              </div>
            </div>
          </form>
        </SettingsSection>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 3: Danger Zone                                               */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <SettingsSection icon={AlertTriangle} title="Danger Zone">
          <SettingsRow
            label="Sign out all devices"
            description="Revoke all active sessions. You will need to sign in again on every device."
          >
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowRevokeDialog(true)}
            >
              Sign out all
            </Button>
          </SettingsRow>
        </SettingsSection>
      </div>

      {/* Revoke confirmation dialog */}
      <Dialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sign out all devices?</DialogTitle>
            <DialogDescription>
              This will revoke all active sessions across every device. You will be
              redirected to the login page immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRevokeDialog(false)}
              disabled={revoking}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevokeAll}
              disabled={revoking}
            >
              {revoking ? 'Signing out...' : 'Sign out all'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
