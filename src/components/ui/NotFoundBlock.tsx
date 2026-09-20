import { Link } from 'react-router';
import { CornerShardLg } from './CornerShardLg';

export function NotFoundBlock({ title, text, to, cta }: { title: string; text: string; to: string; cta: string }) {
  return (
    <div className="fc-block fc-marine fc-error">
      <CornerShardLg />
      <span className="fc-title fc-title--lg">{title}</span>
      <span className="fc-body">{text}</span>
      <Link to={to} className="fc-cta">
        {cta}
      </Link>
    </div>
  );
}
