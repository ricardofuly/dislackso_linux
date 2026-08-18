import { ask } from '@/lib/socket/client';
import { serverUrl } from '@/lib/env';
import { useSession } from '@/stores/session';
import { toast } from '@/stores/toasts';
import type { ProfilePatch } from '@/types/api';

/** Tamanho máximo aceito pelo servidor. */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export async function updateProfile(patch: ProfilePatch): Promise<void> {
  try {
    const { user } = await ask('user:update', patch);
    useSession.getState().setMe(user);
  } catch (err) {
    toast(`Não consegui salvar: ${(err as Error).message}`);
  }
}

/** Abre o seletor de arquivos e devolve um data URL, ou `null` se cancelou. */
export function pickImage(maxBytes = MAX_UPLOAD_BYTES): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/webp';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      if (file.size > maxBytes) {
        toast(`Imagem muito grande (máx. ${Math.round(maxBytes / 1024 / 1024)} MB).`);
        return resolve(null);
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => {
        toast('Não consegui ler o arquivo.');
        resolve(null);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

/**
 * Envia a imagem e devolve o caminho salvo (`/uploads/...`).
 *
 * Sobe como data URL de propósito: aceita GIF animado sem o servidor precisar
 * reprocessar a imagem (o que mataria a animação).
 */
export async function uploadImage(
  dataUrl: string,
  kind: 'avatar' | 'banner' | 'guild',
  userId: string,
): Promise<string> {
  const res = await fetch(`${serverUrl()}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl, kind, userId }),
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error ?? 'falha no envio');
  return json.url;
}
