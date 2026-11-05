import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

const EmptyState = ({ icon, title, description, action }: EmptyStateProps) => (
  <div className="flex flex-col items-center text-center py-16 px-6 animate-fade-in">
    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15 text-primary flex items-center justify-center mb-4">
      {icon}
    </div>
    <h3 className="font-semibold text-lg">{title}</h3>
    {description && <p className="text-muted-foreground text-sm mt-1 max-w-xs">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export default EmptyState;
