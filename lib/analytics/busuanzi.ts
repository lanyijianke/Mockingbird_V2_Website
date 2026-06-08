export const BUSUANZI_SCRIPT_URL = 'https://cdn.busuanzi.cc/busuanzi/3.6.9/busuanzi.min.js';

export function isBusuanziEnabled(): boolean {
    return process.env.NEXT_PUBLIC_BUSUANZI_ENABLED === 'true';
}
