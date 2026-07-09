import { useEffect, useRef } from 'react';
import 'altcha';

interface AltchaWidgetProps {
  challengeUrl: string;
  onVerify: (payload: string) => void;
  onExpire?: () => void;
}

export default function AltchaWidget({ challengeUrl, onVerify, onExpire }: AltchaWidgetProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function handleStateChange(e: Event) {
      const { payload, state } = (e as CustomEvent<{ payload: string | null; state: string }>)
        .detail;
      if (state === 'verified' && payload) {
        onVerify(payload);
      } else if ((state === 'expired' || state === 'error') && onExpire) {
        onExpire();
      }
    }

    el.addEventListener('statechange', handleStateChange);
    return () => el.removeEventListener('statechange', handleStateChange);
  }, [onVerify, onExpire]);

  return (
    <altcha-widget
      ref={ref}
      challenge={challengeUrl}
      configuration={JSON.stringify({ hideFooter: true, hideLogo: true })}
    />
  );
}
