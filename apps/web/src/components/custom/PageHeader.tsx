import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
}

const PageHeader = ({ title, subtitle, back, actions, children }: PageHeaderProps) => {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 glass border-b border-border">
      <div className="flex items-center gap-4 px-4 sm:px-6 h-14">
        {back && (
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
            className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-lg leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </header>
  );
};

export default PageHeader;
