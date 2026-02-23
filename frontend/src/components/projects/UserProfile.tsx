/**
 * UserProfile - User profile component at the bottom of sidebar
 *
 * Features:
 * - Displays authenticated user name and email
 * - Profile navigation and logout action
 * - Collapsed mode: shows only avatar, centered
 */

import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { User, Settings, LogOut } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { logoutUser } from '@/lib/api/auth';
import { cn } from '@/lib/utils';

interface UserProfileProps {
  collapsed?: boolean;
}

export function UserProfile({ collapsed = false }: UserProfileProps) {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  const displayName = user?.name ?? 'Account';
  const displayEmail = user?.email ?? 'Signed in';
  const avatarUrl = undefined;

  // Get user initials for avatar fallback
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  const handleLogout = async () => {
    try {
      if (refreshToken) {
        await logoutUser(refreshToken);
      }
    } catch (error) {
      console.error('[UserProfile] Logout failed', error);
    } finally {
      clearAuth();
      navigate('/login');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Full section with padding and hover effect */}
        <div
          className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-accent/50 focus:outline-none transition-colors"
        >
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={avatarUrl} alt={displayName} />
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>

          {/* Text fades out with opacity, doesn't affect avatar position */}
          <div
            className={cn(
              'flex-1 text-left min-w-0 transition-opacity duration-300',
              collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
            )}
          >
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{displayEmail}</p>
          </div>
        </div>
      </DropdownMenuTrigger>

      <DropdownMenuContent align={collapsed ? 'center' : 'end'} side={collapsed ? 'right' : 'top'} className="w-48">
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            navigate('/profile');
          }}
        >
          <User className="h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            navigate('/profile');
          }}
        >
          <Settings className="h-4 w-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:bg-destructive/15 focus:text-destructive"
          onSelect={(event) => {
            event.preventDefault();
            void handleLogout();
          }}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
