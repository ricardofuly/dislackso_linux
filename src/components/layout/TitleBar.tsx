import { APP_VERSION } from '@/lib/env';

/**
 * A faixa de arrastar a janela, só no app instalado.
 *
 * A janela é sem moldura (`frame: false` no Electron) para o vidro chegar até
 * a borda; esta faixa devolve o "pegar e arrastar" que a barra de título do
 * sistema daria.
 */
export function TitleBar() {
  return (
    <div className="titlebar-drag flex h-8 shrink-0 items-center justify-center gap-2 text-[11px] text-dim">
      <span className="font-semibold tracking-wide text-text">DiSlackso</span>
      <span className="opacity-60">{APP_VERSION}</span>
    </div>
  );
}
