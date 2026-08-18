import { useCallback, useEffect, useState } from 'react';

interface Devices {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
}

/**
 * Os microfones e saídas do sistema.
 *
 * Enquanto o usuário não tiver liberado o microfone pelo menos uma vez, o
 * navegador devolve a lista com os nomes em branco — daí `labelsHidden`, que
 * a interface usa para explicar isso em vez de mostrar "Microfone 1, 2, 3".
 *
 * Também acompanha quem pluga e desconecta aparelho com o app aberto.
 */
export function useAudioDevices() {
  const [devices, setDevices] = useState<Devices>({ inputs: [], outputs: [] });

  const refresh = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices({
        inputs: list.filter((d) => d.kind === 'audioinput'),
        outputs: list.filter((d) => d.kind === 'audiooutput'),
      });
    } catch {
      setDevices({ inputs: [], outputs: [] });
    }
  }, []);

  useEffect(() => {
    void refresh();
    const media = navigator.mediaDevices;
    if (!media) return;
    const onChange = () => void refresh();
    media.addEventListener('devicechange', onChange);
    return () => media.removeEventListener('devicechange', onChange);
  }, [refresh]);

  return {
    ...devices,
    refresh,
    labelsHidden: devices.inputs.length > 0 && !devices.inputs[0]?.label,
  };
}
