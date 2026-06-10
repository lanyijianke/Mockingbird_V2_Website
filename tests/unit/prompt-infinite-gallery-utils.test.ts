import { describe, expect, it } from 'vitest';
import {
    buildPromptDetailHref,
    buildPromptListReturnUrl,
} from '@/app/ai/prompts/infinite-gallery-utils';

describe('prompt infinite gallery URL helpers', () => {
    it('builds prompt list return URLs from active filters', () => {
        expect(buildPromptListReturnUrl({ category: 'seedance-2', q: 'CEO 剧情' })).toBe(
            '/ai/prompts?category=seedance-2&q=CEO+%E5%89%A7%E6%83%85'
        );
    });

    it('includes returnTo only when leaving a filtered prompt list', () => {
        expect(buildPromptDetailHref(42, '/ai/prompts')).toBe('/ai/prompts/42');
        expect(buildPromptDetailHref(42, '/ai/prompts?category=seedance-2')).toBe(
            '/ai/prompts/42?returnTo=%2Fai%2Fprompts%3Fcategory%3Dseedance-2'
        );
    });

    it('includes a prompt card anchor in returnTo so detail pages can return to the selected card', () => {
        expect(buildPromptDetailHref(42, '/ai/prompts', 'prompt-42')).toBe(
            '/ai/prompts/42?returnTo=%2Fai%2Fprompts%23prompt-42'
        );
        expect(buildPromptDetailHref(42, '/ai/prompts?category=seedance-2', 'prompt-42')).toBe(
            '/ai/prompts/42?returnTo=%2Fai%2Fprompts%3Fcategory%3Dseedance-2%23prompt-42'
        );
    });
});
