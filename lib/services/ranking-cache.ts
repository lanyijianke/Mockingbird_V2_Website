import { GitHubTrending, ProductHuntRanking, SkillsShRanking } from '@/lib/types';
import { scrapeGitHubTrending, scrapeProductHunt, scrapeSkillsSh } from './ranking-scrapers';
import { logger } from '@/lib/utils/logger';

// ════════════════════════════════════════════════════════════════
// 排行榜数据源 — ISR 页面负责缓存
// 这里不做 MemoryCache，避免与静态页面/ISR 形成两套缓存。
// ════════════════════════════════════════════════════════════════

type RankingLoader<T> = () => Promise<T[]>;

async function loadRankings<T>(
    sourceName: string,
    loader: RankingLoader<T>
): Promise<T[]> {
    try {
        const result = await loader();
        if (result.length === 0) {
            logger.warn('RankingSource', `${sourceName} 直采未获取到数据`);
            return result;
        }

        logger.info('RankingSource', `✅ ${sourceName} 直采成功: ${result.length} 条`);
        return result;
    } catch (err) {
        logger.error('RankingSource', `${sourceName} 抓取失败`, err);
        return [];
    }
}

// ════════════════════════════════════════════════════════════════
// GitHub Trending
// ════════════════════════════════════════════════════════════════

export async function getGitHubTrendings(): Promise<GitHubTrending[]> {
    return loadRankings(
        'GitHub Trending',
        scrapeGitHubTrending
    );
}

// ════════════════════════════════════════════════════════════════
// ProductHunt
// ════════════════════════════════════════════════════════════════

export async function getProductHuntRankings(): Promise<ProductHuntRanking[]> {
    return loadRankings(
        'ProductHunt',
        scrapeProductHunt
    );
}

// ════════════════════════════════════════════════════════════════
// Skills.sh
// ════════════════════════════════════════════════════════════════

export async function getSkillsShRankings(listType: string = 'trending'): Promise<SkillsShRanking[]> {
    const validType = listType === 'hot' ? 'hot' : 'trending';

    return loadRankings(
        `Skills.sh ${validType}`,
        async () => scrapeSkillsSh(validType)
    );
}
