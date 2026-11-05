import { Fragment } from 'react';
import { Link } from 'react-router-dom';

const TOKEN = /(#[a-zA-Z0-9_]{2,30}|@[a-zA-Z0-9_]{3,30})/g;

const RichText = ({ text, className }: { text: string; className?: string }) => (
  <p className={className ?? 'whitespace-pre-wrap break-words leading-relaxed'}>
    {text.split(TOKEN).map((part, i) => {
      if (/^#[a-zA-Z0-9_]{2,30}$/.test(part)) {
        return (
          <Link
            key={i}
            to={`/explore?q=${encodeURIComponent(part)}`}
            onClick={(e) => e.stopPropagation()}
            className="text-primary hover:underline"
          >
            {part}
          </Link>
        );
      }
      if (/^@[a-zA-Z0-9_]{3,30}$/.test(part)) {
        return (
          <Link
            key={i}
            to={`/profile/${part.slice(1).toLowerCase()}`}
            onClick={(e) => e.stopPropagation()}
            className="text-primary hover:underline"
          >
            {part}
          </Link>
        );
      }
      return <Fragment key={i}>{part}</Fragment>;
    })}
  </p>
);

export default RichText;
