import Script from 'next/script';
import { BUSUANZI_SCRIPT_URL, isBusuanziEnabled } from '@/lib/analytics/busuanzi';

export default function BusuanziScript() {
  if (!isBusuanziEnabled()) return null;

  return (
    <Script
      id="busuanzi-counter"
      src={BUSUANZI_SCRIPT_URL}
      strategy="afterInteractive"
    />
  );
}
