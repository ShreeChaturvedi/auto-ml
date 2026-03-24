/**
 * ProfileSettings - Full-page user profile and settings management
 *
 * Features:
 * - Modern, clean full-page layout (no sidebar)
 * - Two-column grid for form fields on larger screens
 * - In-button loading spinner and success checkmark animation
 * - Minimal card styling with subtle separators
 */

import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Loader2, Check, User, Mail, UserCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { PasswordSection } from './PasswordSection';
import { RuntimeSettingsSection } from './RuntimeSettingsSection';
import { ThemeToggle } from '@/components/theme-toggle';
import { useAuthStore } from '@/stores/authStore';
import { updateProfile } from '@/lib/api/auth';

const profileInfoSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address')
});

type ProfileInfoFormValues = z.infer<typeof profileInfoSchema>;

export type ButtonState = 'idle' | 'loading' | 'success' | 'error';

export function SaveButton({
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
  const DEV_BYPASS_AUTH = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const setUser = useAuthStore((state) => state.setUser);
  const [profileState, setProfileState] = useState<ButtonState>('idle');
  const [profileError, setProfileError] = useState<string | null>(null);

  // Profile info form
  const profileForm = useForm<ProfileInfoFormValues>({
    resolver: zodResolver(profileInfoSchema),
    defaultValues: {
      name: user?.name || '',
      email: user?.email || ''
    }
  });

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

  if (!user) {
    if (DEV_BYPASS_AUTH) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-6">
          <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
            <h1 className="text-lg font-semibold tracking-tight">Dev Auth Bypass Active</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Profile settings need a signed-in account. Disable `VITE_DEV_BYPASS_AUTH` or sign in to
              view and edit profile details.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <Button variant="outline" onClick={() => navigate('/')}>
                Back to Projects
              </Button>
              <Button onClick={() => navigate('/login')}>Go to Login</Button>
            </div>
          </div>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading...</span>
          </div>
        </div>
      );
    }

    return <Navigate to="/login" replace />;
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
        <PasswordSection />

        <Separator className="my-8" />

        {/* Runtime Configuration */}
        <RuntimeSettingsSection />
      </main>
    </div>
  );
}
