import { Outlet } from 'react-router-dom';
import { Bell, MessageCircle, Sparkles, Users } from 'lucide-react';

const AuthLayout = () => {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/20 to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.1),transparent_50%)]" />
        
        <div className="relative z-10 flex flex-col justify-center items-center w-full p-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <span className="text-3xl font-bold gradient-text">Friendster</span>
          </div>
          
          <p className="text-muted-foreground text-center max-w-md text-lg">
            Connect with friends, share your moments, and discover amazing content in a modern social experience.
          </p>
          
          <ul className="mt-12 grid gap-3 w-full max-w-sm">
            {[
              { icon: Users, text: 'Follow friends and see their posts first' },
              { icon: MessageCircle, text: 'Chat in real time with direct messages' },
              { icon: Bell, text: 'Get notified about likes, replies and mentions' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="glass rounded-2xl px-5 py-4 flex items-center gap-3">
                <Icon className="w-5 h-5 text-primary shrink-0" />
                <span className="text-sm text-foreground">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      
      {/* Right side - Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold gradient-text">Friendster</span>
          </div>
          
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
