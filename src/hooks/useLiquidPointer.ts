import { useEffect, useRef } from 'react';

/**
 * Faz o brilho especular do vidro seguir o ponteiro.
 *
 * Publica `--mx` e `--my` (a posição do cursor em porcentagem do elemento),
 * que `glass.css` usa como centro do gradiente. É o detalhe que faz a
 * superfície parecer curva em vez de um retângulo translúcido.
 *
 * Escreve direto no estilo do nó, sem estado do React: um `setState` a cada
 * `pointermove` re-renderizaria a árvore inteira dezenas de vezes por segundo
 * para mudar duas variáveis de CSS.
 */
export function useLiquidPointer<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return;

    let frame = 0;
    const move = (e: PointerEvent) => {
      if (frame) return; // no máximo uma atualização por quadro
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = node.getBoundingClientRect();
        node.style.setProperty('--mx', `${((e.clientX - box.left) / box.width) * 100}%`);
        node.style.setProperty('--my', `${((e.clientY - box.top) / box.height) * 100}%`);
      });
    };

    const leave = () => {
      node.style.removeProperty('--mx');
      node.style.removeProperty('--my');
    };

    node.addEventListener('pointermove', move);
    node.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerleave', leave);
    };
  }, [enabled]);

  return ref;
}
