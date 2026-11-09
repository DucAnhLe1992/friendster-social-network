import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/custom/EmptyState';
import { usePageTitle } from '@/hooks/usePageTitle';

const NotFound = () => {
  usePageTitle('Page not found');
  return (
  <div className="min-h-screen flex items-center justify-center">
    <EmptyState
      icon={<Compass className="w-7 h-7" />}
      title="Page not found"
      description="The page you're looking for doesn't exist or has moved."
      action={
        <Button asChild>
          <Link to="/">Go home</Link>
        </Button>
      }
    />
  </div>
  );
};

export default NotFound;
