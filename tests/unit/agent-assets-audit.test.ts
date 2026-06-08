import { describe, expect, it } from 'vitest';
import {
    formatAssetCompletenessMarkdown,
    summarizeAssetCompleteness,
} from '../../scripts/agent-assets-audit.mjs';

describe('agent assets audit helpers', () => {
    it('summarizes asset completeness buckets', () => {
        const report = summarizeAssetCompleteness([
            {
                type: 'prompt',
                id: '1',
                title: 'A',
                mediaTypes: ['image'],
                qualitySignals: { hasCover: true, hasVideo: false, hasExamples: true },
                description: 'Prompt description',
                content: 'Prompt content',
            },
            {
                type: 'prompt',
                id: '2',
                title: 'B',
                mediaTypes: [],
                qualitySignals: { hasCover: false, hasVideo: false, hasExamples: false },
                description: '',
                content: '',
            },
            {
                type: 'article',
                id: 'agent-workflow',
                title: 'Agent Workflow',
                mediaTypes: [],
                qualitySignals: { hasCover: false, hasVideo: false, hasExamples: false },
                summary: '',
                content: 'Article body',
            },
        ]);

        expect(report).toMatchObject({
            total: 3,
            prompts: 2,
            articles: 1,
            withCover: 1,
            withImage: 1,
            withVideo: 0,
            withExamples: 1,
            missingMedia: [
                { type: 'prompt', id: '2', title: 'B' },
                { type: 'article', id: 'agent-workflow', title: 'Agent Workflow' },
            ],
            missingDescription: [
                { type: 'prompt', id: '2', title: 'B' },
                { type: 'article', id: 'agent-workflow', title: 'Agent Workflow' },
            ],
            emptyContent: [
                { type: 'prompt', id: '2', title: 'B' },
            ],
        });
    });

    it('formats a markdown report for human review', () => {
        const markdown = formatAssetCompletenessMarkdown({
            total: 1,
            prompts: 1,
            articles: 0,
            withCover: 0,
            withImage: 0,
            withVideo: 0,
            withExamples: 0,
            invalidMediaJson: [],
            missingMedia: [{ type: 'prompt', id: '2', title: 'B' }],
            missingDescription: [],
            emptyContent: [],
        });

        expect(markdown).toContain('# Agent Assets Audit');
        expect(markdown).toContain('| Total | 1 |');
        expect(markdown).toContain('prompt:2');
    });
});
