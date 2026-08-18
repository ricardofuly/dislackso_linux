import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { SettingRow } from '../SettingRow';
import { assetUrl } from '@/lib/env';
import { updateProfile } from '@/features/profile/actions';
import { useSession } from '@/stores/session';

/** Apelido, pronomes, bio e o botão de sair da conta. */
export function AccountSection() {
  const me = useSession((s) => s.me);
  const logout = useSession((s) => s.logout);
  const [confirmLogout, setConfirmLogout] = useState(false);

  if (!me) return <p className="text-[13px] text-dim">Conectando…</p>;

  return (
    <>
      <div className="mb-6 overflow-hidden rounded-[var(--radius-lg)] bg-bg-3">
        <div
          className="h-24 bg-cover bg-center"
          style={{
            backgroundImage: me.banner ? `url('${assetUrl(me.banner)}')` : undefined,
            background: me.banner ? undefined : me.accent || me.color,
          }}
        />
        <div className="-mt-10 flex items-end gap-3 p-4">
          <Avatar user={me} size="lg" className="ring-4 ring-bg-3" />
          <div className="pb-1">
            <p className="text-base font-semibold text-bright">{me.name}</p>
            {me.pronouns && <p className="text-[12px] text-dim">{me.pronouns}</p>}
          </div>
        </div>
        {me.bio && <p className="px-4 pb-4 text-[13px] whitespace-pre-wrap text-text">{me.bio}</p>}
      </div>

      <SettingRow title="Apelido" desc="Como seus amigos te veem." stack>
        <TextInput
          defaultValue={me.name}
          maxLength={32}
          onBlur={(e) => void updateProfile({ name: e.target.value.trim() || me.name })}
        />
      </SettingRow>

      <SettingRow title="Pronomes" desc="Opcional." stack>
        <TextInput
          defaultValue={me.pronouns}
          maxLength={20}
          placeholder="ele/dele, ela/dela, elu/delu…"
          onBlur={(e) => void updateProfile({ pronouns: e.target.value.trim() })}
        />
      </SettingRow>

      <SettingRow title="Sobre mim" desc="Até 300 caracteres." stack>
        <TextArea
          rows={3}
          defaultValue={me.bio}
          maxLength={300}
          placeholder="Fale um pouco sobre você…"
          onBlur={(e) => void updateProfile({ bio: e.target.value })}
        />
      </SettingRow>

      <SettingRow title="Sessão" desc="Sai desta conta neste app.">
        <Button variant="ghost" onClick={() => setConfirmLogout(true)}>
          <LogOut size={16} /> Sair da conta
        </Button>
      </SettingRow>

      <Modal
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        title="Sair da conta"
        description={`Você precisará entrar de novo com o nickname ${me.username || me.name} e a senha.`}
        confirmLabel="Sair"
        danger
        onConfirm={logout}
      />
    </>
  );
}
