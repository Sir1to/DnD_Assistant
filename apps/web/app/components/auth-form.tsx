'use client';

import type { AuthResponse } from '@fog-of-lore/contracts';
import { Button } from '@fog-of-lore/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { apiRequest, readableError } from '../lib/api';

interface AuthFormProps {
  mode: 'login' | 'register';
  nextPath?: string;
}

export function AuthForm({ mode, nextPath = '/dashboard' }: AuthFormProps) {
  const isRegister = mode === 'register';
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest<AuthResponse>(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          ...(isRegister ? { displayName } : {}),
        }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['auth', 'me'], data);
      router.replace(nextPath);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    mutation.reset();
    mutation.mutate();
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="auth-title">
        <Link className="brand auth-brand" href="/" aria-label="Fog of Lore — главная">
          <span className="brand-mark" aria-hidden="true">
            F
          </span>
          <span>Fog of Lore</span>
        </Link>

        <p className="eyebrow">{isRegister ? 'Новая мастерская' : 'Возвращение к истории'}</p>
        <h1 id="auth-title">{isRegister ? 'Создайте учётную запись' : 'Войдите в мастерскую'}</h1>
        <p className="auth-intro">
          {isRegister
            ? 'Данные останутся на вашем сервере. После регистрации можно сразу создать первую кампанию.'
            : 'Продолжите работу с кампаниями и мастерскими досками.'}
        </p>

        <form className="auth-form" onSubmit={submit}>
          {isRegister ? (
            <label>
              Как к вам обращаться
              <input
                autoComplete="name"
                maxLength={80}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                value={displayName}
              />
            </label>
          ) : null}

          <label>
            {isRegister ? 'Электронная почта' : 'Логин или электронная почта'}
            <input
              autoComplete={isRegister ? 'email' : 'username'}
              inputMode={isRegister ? 'email' : 'text'}
              maxLength={320}
              onChange={(event) => setEmail(event.target.value)}
              required
              type={isRegister ? 'email' : 'text'}
              value={email}
            />
          </label>

          <label>
            Пароль
            <input
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              maxLength={128}
              minLength={isRegister ? 12 : 1}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            {isRegister ? <span className="field-hint">Не менее 12 символов</span> : null}
          </label>

          {mutation.isError ? (
            <p className="form-error" role="alert">
              {readableError(mutation.error)}
            </p>
          ) : null}

          <Button className="form-submit" disabled={mutation.isPending} type="submit">
            {mutation.isPending ? 'Сохраняем…' : isRegister ? 'Создать учётную запись' : 'Войти'}
          </Button>
        </form>

        <p className="auth-switch">
          {isRegister ? 'Уже есть учётная запись?' : 'Впервые в Fog of Lore?'}{' '}
          <Link
            href={`${isRegister ? '/login' : '/register'}${
              nextPath === '/dashboard' ? '' : `?next=${encodeURIComponent(nextPath)}`
            }`}
          >
            {isRegister ? 'Войти' : 'Зарегистрироваться'}
          </Link>
        </p>
      </section>

      <aside className="auth-aside" aria-hidden="true">
        <div>
          <p>Ваш сервер</p>
          <strong>Ваши истории не покидают мастерскую.</strong>
        </div>
      </aside>
    </main>
  );
}
