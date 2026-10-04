import { Link2, LogIn, UserPlus } from 'lucide-react';
import { AuthLayout } from '../components/layout';
import { Button } from '../components/ui';
import { useNavigate } from '../lib/nav';
import { useT } from '../lib/settings';

export function Welcome() {
  const t = useT();
  const navigate = useNavigate();
  return (
    <AuthLayout>
      <header className="heading">
        <h2>{t.welcome.title}</h2>
        <p className="muted">{t.welcome.subtitle}</p>
      </header>
      <div className="stack">
        <Button size="lg" icon={LogIn} block onClick={() => navigate({ name: 'login' })}>
          {t.welcome.logIn}
        </Button>
        <Button size="lg" variant="secondary" icon={UserPlus} block onClick={() => navigate({ name: 'register' })}>
          {t.welcome.signUp}
        </Button>
      </div>
      <div className="divider-text">
        <span>{t.welcome.haveLink}</span>
      </div>
      <Button variant="ghost" icon={Link2} block onClick={() => navigate({ name: 'guestJoin' })}>
        {t.welcome.joinAsGuest}
      </Button>
    </AuthLayout>
  );
}
