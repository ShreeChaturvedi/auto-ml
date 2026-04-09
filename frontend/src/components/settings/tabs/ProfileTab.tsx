/**
 * ProfileTab — Profile, security, and sessions settings.
 *
 * Three sections:
 *   1. Profile Information — name + email, server-persisted
 *   2. Security — change password, server-persisted
 *   3. Sessions — active sessions list + sign out all devices
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock, User, Shield, Monitor, Loader2 } from 'lucide-react';
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
import { updateProfile, getActiveSessions, revokeSession, type ActiveSession } from '@/lib/api/auth';
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
// Helpers
// ---------------------------------------------------------------------------

function parseUserAgent(ua: string | null): { browser: string; os: string } {
  if (!ua) return { browser: 'Unknown browser', os: 'Unknown OS' };

  let browser = 'Unknown browser';
  if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('OPR/') || ua.includes('Opera/')) browser = 'Opera';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Safari/')) browser = 'Safari';

  let os = 'Unknown OS';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X') || ua.includes('Macintosh')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return { browser, os };
}

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

// ---------------------------------------------------------------------------
// ProfileTab
// ---------------------------------------------------------------------------

export function ProfileTab() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const refreshToken = useAuthStore((s) => s.refreshToken);

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

  // Sessions
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState(false);

  useEffect(() => {
    getActiveSessions(refreshToken)
      .then(setSessions)
      .catch(() => setSessionsError(true))
      .finally(() => setSessionsLoading(false));
  }, [refreshToken]);

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

  const handleRevokeSession = async (tokenId: string) => {
    try {
      await revokeSession(tokenId);
      setSessions((prev) => prev.filter((s) => s.token_id !== tokenId));
      toast.success('Session revoked');
    } catch {
      toast.error('Failed to revoke session');
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
              <p className="px-5 pb-4 text-xs text-destructive">{profileError}</p>
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
                <Label htmlFor="currentPassword" className="text-[13px] font-medium">
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
                <Label htmlFor="newPassword" className="text-[13px] font-medium">
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
                <Label htmlFor="confirmPassword" className="text-[13px] font-medium">
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
                <p className="text-xs text-destructive">{passwordError}</p>
              )}

              <div className="flex items-center gap-4">
                <SaveButton
                  state={passwordState}
                  idleText="Change Password"
                  loadingText="Changing..."
                />
                {passwordState === 'success' && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    Password changed. Redirecting to login...
                  </p>
                )}
              </div>
            </div>
          </form>
        </SettingsSection>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 3: Sessions                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <SettingsSection icon={Shield} title="Sessions">
          {sessionsLoading ? (
            <div className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sessions...
            </div>
          ) : sessionsError ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">
              Could not load active sessions.
            </p>
          ) : sessions.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">
              No active sessions found.
            </p>
          ) : (
            sessions.map((session) => {
              const { browser, os } = parseUserAgent(session.user_agent);
              return (
                <div key={session.token_id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium">{browser} on {os}</p>
                        {session.current && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            This device
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {session.ip_address ?? 'Unknown IP'} · {formatSessionDate(session.created_at)}
                      </p>
                    </div>
                  </div>
                  {!session.current && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => handleRevokeSession(session.token_id)}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              );
            })
          )}

          <div className="flex items-center justify-between px-5 py-3 border-t border-border/50">
            <div>
              <p className="text-[13px] font-medium text-destructive">Sign out all devices</p>
              <p className="text-xs text-muted-foreground">Revoke all active sessions across every device</p>
            </div>
            <Button variant="destructive" size="sm" onClick={() => setShowRevokeDialog(true)}>
              Sign out all
            </Button>
          </div>
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
