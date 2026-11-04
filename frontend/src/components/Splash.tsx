import { Logo } from './Logo';

export function Splash() {
  return (
    <div className="splash" role="status" aria-label="Loading">
      <Logo size={72} />
    </div>
  );
}
