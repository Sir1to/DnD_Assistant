import { AuthForm } from '../components/auth-form';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const nextPath = safeNextPath((await searchParams).next);
  return <AuthForm mode="register" nextPath={nextPath} />;
}

function safeNextPath(value?: string): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';
}
