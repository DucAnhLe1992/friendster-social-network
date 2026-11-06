import { toast } from 'sonner';
import { getErrorMessage, isStaleSessionError } from '@/lib/api';

// Requests from a session that has since ended (logout/account switch) are dropped silently.
export const notifyError = (error: unknown, fallback?: string): void => {
  if (isStaleSessionError(error)) return;
  toast.error(getErrorMessage(error, fallback));
};
