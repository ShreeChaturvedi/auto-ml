import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthCard, AuthPageWrapper } from './AuthCard';

export function GoogleOAuthCallback() {
  const navigate = useNavigate();

  return (
    <AuthPageWrapper>
      <AuthCard>
        <div className="space-y-6 text-center">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
              <AlertCircle className="h-8 w-8 text-amber-400" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight font-display">Google sign-in is coming soon</h1>
            <p className="text-sm text-muted-foreground">
              The public beta only supports email and password authentication right now.
            </p>
          </div>
          <Button
            variant="secondary"
            className="w-full h-11"
            onClick={() => navigate('/login', { replace: true })}
          >
            Back to Login
          </Button>
        </div>
      </AuthCard>
    </AuthPageWrapper>
  );
}
