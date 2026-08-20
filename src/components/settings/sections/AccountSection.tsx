import { useState } from 'react';
import { Copy, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { SettingRow, Swatches } from '../SettingRow';
import { ImageUpload } from '../ImageUpload';
import { initials } from '@/lib/format';
import { updateProfile } from '@/features/profile/actions';
import { useSession } from '@/stores/session';
import { ACCENTS } from '@/stores/settings';
import { toast } from '@/stores/toasts';

/** Foto, banner, apelido, pronomes, bio e o botão de sair da conta — tudo o que é "eu" num só lugar. */
export function AccountSection() {
  const me = useSession((s) => s.me);
  const logout = useSession((s) => s.logout);
  const [confirmLogout, setConfirmLogout] = useState(false);

  if (!me) return <p className="text-[13px] text-dim">Conectando…</p>;

  return (
    <>
      <SettingRow title="Foto de perfil" desc="PNG, JPG, WEBP ou GIF animado. Até 12 MB." stack>
        <ImageUpload
          kind="avatar"
          current={me.avatar}
          label="Enviar imagem"
          fallbackColor={me.color}
          fallbackText={initials(me.name)}
        />
      </SettingRow>

      <SettingRow title="Banner" desc="Aparece atrás da sua foto. Até 12 MB." stack>
        <ImageUpload
          kind="banner"
          current={me.banner}
          label="Enviar banner"
          fallbackColor={me.accent || me.color}
          fallbackText="sem banner"
          wide
        />
      </SettingRow>

      <SettingRow title="Cor do perfil" desc="Usada no banner quando você não tem imagem." stack>
        <Swatches
          colors={ACCENTS}
          value={me.accent || me.color}
          onPick={(color) => void updateProfile({ accent: color })}
        />
      </SettingRow>

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

      <SettingRow
        title="ID da conta"
        desc="Identificador único, sem uso no dia a dia — só precisa dele para configurar o painel de desenvolvedor (ex.: administrador do app)."
      >
        <div className="flex items-center gap-2">
          <code className="selectable rounded-[var(--radius-sm)] bg-field px-2.5 py-1.5 font-mono text-[12px] text-dim">
            {me.id}
          </code>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigator.clipboard
                .writeText(me.id)
                .then(() => toast('ID copiado.'))
                .catch(() => toast(`Copie manualmente: ${me.id}`, 8000))
            }
          >
            <Copy size={14} />
          </Button>
        </div>
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
