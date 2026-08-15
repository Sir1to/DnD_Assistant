import { AuthForm } from '../components/auth-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const nextPath = safeNextPath((await searchParams).next);
  return <AuthForm mode="login" nextPath={nextPath} />;
}

function safeNextPath(value?: string): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';
}
