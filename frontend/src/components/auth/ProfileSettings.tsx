/**
 * ProfileSettings - Full-page user profile and settings management
 *
 * Features:
 * - Modern, clean full-page layout (no sidebar)
 * - Two-column grid for form fields on larger screens
 * - In-button loading spinner and success checkmark animation
 * - Minimal card styling with subtle separators
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Loader2, Check, User, Lock, Mail, UserCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { PasswordStrength } from './PasswordStrength';
import { ThemeToggle } from '@/components/theme-toggle';
import { useAuthStore } from '@/stores/authStore';
import { updateProfile } from '@/lib/api/auth';

const profileInfoSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address')
});

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

type ProfileInfoFormValues = z.infer<typeof profileInfoSchema>;
type PasswordChangeFormValues = z.infer<typeof passwordChangeSchema>;

type ButtonState = 'idle' | 'loading' | 'success' | 'error';

function SaveButton({
  state,
  idleText,
  loadingText
}: {
  state: ButtonState;
  idleText: string;
  loadingText: string;
}) {
  return (
    <Button
      type="submit"
      variant="secondary"
      disabled={state === 'loading'}
      className="min-w-[120px] h-9 px-4 text-sm transition-all duration-200"
    >
      {state === 'loading' && (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {loadingText}
        </>
      )}
      {state === 'success' && (
        <>
          <Check className="mr-2 h-4 w-4 text-emerald-500" />
          <span>Saved</span>
        </>
      )}
      {state === 'idle' && idleText}
      {state === 'error' && idleText}
    </Button>
  );
}

export function ProfileSettings() {
  const navigate = useNavigate();
  const { user, setUser, clearAuth } = useAuthStore();
  const [profileState, setProfileState] = useState<ButtonState>('idle');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordState, setPasswordState] = useState<ButtonState>('idle');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Profile info form
  const profileForm = useForm<ProfileInfoFormValues>({
    resolver: zodResolver(profileInfoSchema),
    defaultValues: {
      name: user?.name || '',
      email: user?.email || ''
    }
  });

  // Password change form
  const passwordForm = useForm<PasswordChangeFormValues>({
    resolver: zodResolver(passwordChangeSchema)
  });

  // Watch new password for strength indicator
  const newPasswordValue = passwordForm.watch('newPassword', '');
  useEffect(() => {
    setNewPassword(newPasswordValue);
  }, [newPasswordValue]);

  const onProfileSubmit = async (data: ProfileInfoFormValues) => {
    setProfileError(null);
    setProfileState('loading');

    try {
      const response = await updateProfile({
        name: data.name,
        email: data.email
      });
      setUser(response.user);
      setProfileState('success');
      setTimeout(() => setProfileState('idle'), 2000);
    } catch (error: unknown) {
      const apiError = error as { status?: number };
      setProfileState('error');
      if (apiError.status === 409) {
        setProfileError('Email is already taken');
      } else {
        setProfileError('Failed to update profile. Please try again.');
      }
    }
  };

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

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
        {/* Page Title */}
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <UserCircle className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Profile Settings</h1>
            <p className="text-sm text-muted-foreground">
              Manage your account information and security
            </p>
          </div>
        </div>

        {/* Profile Information Section */}
        <section className="mb-10">
          <div className="mb-4 flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Profile Information
            </h2>
          </div>

          <form onSubmit={profileForm.handleSubmit(onProfileSubmit)}>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">
                  Full Name
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="name"
                    placeholder="John Doe"
                    className="pl-10 bg-transparent"
                    {...profileForm.register('name')}
                  />
                </div>
                {profileForm.formState.errors.name && (
                  <p className="text-xs text-destructive">
                    {profileForm.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="john@example.com"
                    className="pl-10 bg-transparent"
                    {...profileForm.register('email')}
                  />
                </div>
                {profileForm.formState.errors.email && (
                  <p className="text-xs text-destructive">
                    {profileForm.formState.errors.email.message}
                  </p>
                )}
              </div>
            </div>

            {profileError && (
              <p className="mt-4 text-sm text-destructive">{profileError}</p>
            )}

            <div className="mt-6">
              <SaveButton
                state={profileState}
                idleText="Save Changes"
                loadingText="Saving..."
              />
            </div>
          </form>
        </section>

        <Separator className="my-8" />

        {/* Password Section */}
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
      </main>
    </div>
  );
}
