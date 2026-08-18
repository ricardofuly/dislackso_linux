import { useState } from 'react';
import { motion } from 'motion/react';
import { Glass } from '@/components/ui/Glass';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { submitGate, suggestedUsername, type GateMode } from '@/features/auth/actions';
import { legacyUserId } from '@/stores/session';

const HINT_NORMAL = 'Sem e-mail — só nickname e senha, guardados no nosso banco.';
const HINT_LEGACY =
  'Você já usava o app sem senha — escolha um nickname e uma senha pra proteger essa '
  + 'mesma conta (seus servidores continuam salvos).';

/**
 * A tela de entrada.
 *
 * Abre sempre em "Entrar", nunca pulando sozinha para "Criar conta" — mesmo
 * quando o motivo de estar aqui foi um token salvo que acabou de ser
 * invalidado. A aba de cadastro continua ali para quem realmente precisa.
 */
export function Gate() {
  const [mode, setMode] = useState<GateMode>('login');
  const [username, setUsername] = useState(suggestedUsername);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const legacy = Boolean(legacyUserId());
  const confirmLabel = mode === 'login' ? 'Entrar' : legacy ? 'Proteger minha conta' : 'Criar conta';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!username.trim() || !password) return setError('Preencha nickname e senha.');

    setBusy(true);
    setError('');
    try {
      await submitGate(mode, username.trim(), password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid h-full place-items-center bg-bg-0 p-6">
      <GateBackdrop />

      <Glass
        as={motion.div}
        variant="card"
        live
        refract
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-90 p-8 text-center"
      >
        <img src="favicon.png" width={54} height={54} alt="" className="mx-auto mb-3" />
        <h1 className="text-2xl font-semibold text-bright">DiSlackso</h1>
        <p className="mt-1 mb-6 text-[13px] text-dim">
          Servidores privados, tela compartilhada e anotação ao vivo.
        </p>

        <ModeTabs mode={mode} onChange={(next) => { setMode(next); setError(''); }} />

        <form onSubmit={submit} className="mt-5 space-y-3 text-left">
          <Field label="Nickname">
            {(id) => (
              <TextInput
                id={id}
                value={username}
                maxLength={20}
                autoComplete="username"
                placeholder="seu_nickname"
                autoFocus
                onChange={(e) => setUsername(e.target.value)}
              />
            )}
          </Field>

          <Field label="Senha">
            {(id) => (
              <TextInput
                id={id}
                type="password"
                value={password}
                maxLength={72}
                placeholder="Sua senha"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>

          <Button type="submit" variant="primary" size="block" disabled={busy}>
            {busy ? 'Um instante…' : confirmLabel}
          </Button>
        </form>

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 text-[13px] text-red"
          >
            {error}
          </motion.p>
        )}

        <p className="mt-4 text-[12px] leading-snug text-dim">
          {mode === 'register' && legacy ? HINT_LEGACY : HINT_NORMAL}
        </p>
      </Glass>
    </div>
  );
}

function ModeTabs({ mode, onChange }: { mode: GateMode; onChange(mode: GateMode): void }) {
  const tabs: { id: GateMode; label: string }[] = [
    { id: 'login', label: 'Entrar' },
    { id: 'register', label: 'Criar conta' },
  ];

  return (
    <div className="flex gap-1 rounded-[var(--radius-sm)] bg-bg-1/60 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className="relative flex-1 rounded-[var(--radius-xs)] px-3 py-1.5 text-[13px] font-medium"
        >
          {mode === tab.id && (
            <motion.span
              layoutId="gate-tab"
              className="absolute inset-0 rounded-[var(--radius-xs)] bg-accent"
              transition={{ type: 'spring', stiffness: 480, damping: 38 }}
            />
          )}
          <span className={mode === tab.id ? 'relative text-accent-fg' : 'relative text-dim'}>
            {tab.label}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Duas manchas de luz que se movem devagar atrás do vidro. */
function GateBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <motion.div
        className="absolute size-[38rem] rounded-full bg-accent/25 blur-[120px]"
        initial={{ x: '-20%', y: '-10%' }}
        animate={{ x: ['-20%', '10%', '-20%'], y: ['-10%', '15%', '-10%'] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute right-0 bottom-0 size-[30rem] rounded-full bg-bg-4/70 blur-[110px]"
        animate={{ x: ['10%', '-15%', '10%'], y: ['10%', '-10%', '10%'] }}
        transition={{ duration: 32, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}
