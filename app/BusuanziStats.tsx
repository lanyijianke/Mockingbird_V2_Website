import { isBusuanziEnabled } from '@/lib/analytics/busuanzi';

export default function BusuanziStats() {
  if (!isBusuanziEnabled()) return null;

  return (
    <div className="site-footer-stats" aria-label="站点访问统计">
      <span>
        本站访问 <span id="busuanzi_value_site_pv">-</span> 次
      </span>
      <span>
        访客 <span id="busuanzi_value_site_uv">-</span> 人
      </span>
    </div>
  );
}
