import { describe, expect, it } from 'vitest';
import {
    getArticleCategoryFilterPath,
    getArticleDetailPath,
    getArticleListPath,
} from '@/lib/articles/article-route-paths';

describe('article route paths', () => {
    it('builds canonical paths for AI articles and generic article sources', () => {
        expect(getArticleListPath('ai')).toBe('/ai/articles');
        expect(getArticleDetailPath('ai', 'prompt-caching')).toBe('/ai/articles/prompt-caching');
        expect(getArticleCategoryFilterPath('ai', 'engineering')).toBe('/ai/articles?category=engineering');
        expect(getArticleListPath('research')).toBe('/research/articles');
        expect(getArticleDetailPath('research', 'field-notes')).toBe('/research/articles/field-notes');
        expect(getArticleCategoryFilterPath('research', 'macro')).toBe('/research/articles?category=macro');
    });
});
