import { describe, expect, it } from 'vitest';
import { extractToc, rehypeUniqueHeadingIds } from '@/lib/articles/markdown-headings';

interface TestNode {
    type: string;
    tagName?: string;
    value?: string;
    properties?: Record<string, unknown>;
    children?: TestNode[];
}

describe('markdown headings', () => {
    it('generates stable unique ids for duplicate TOC headings', () => {
        expect(extractToc([
            '# 开始',
            '## Prompt 示例',
            '## Prompt 示例',
            '### Prompt 示例',
        ].join('\n'))).toEqual([
            { id: '开始', text: '开始', level: 1 },
            { id: 'prompt-示例', text: 'Prompt 示例', level: 2 },
            { id: 'prompt-示例-2', text: 'Prompt 示例', level: 2 },
            { id: 'prompt-示例-3', text: 'Prompt 示例', level: 3 },
        ]);
    });

    it('assigns the same unique ids to rendered HTML headings', () => {
        const tree: TestNode = {
            type: 'root',
            children: [
                { type: 'element', tagName: 'h2', children: [{ type: 'text', value: 'Prompt 示例' }] },
                { type: 'element', tagName: 'h2', children: [{ type: 'text', value: 'Prompt 示例' }] },
            ],
        };

        rehypeUniqueHeadingIds()(tree);

        expect(tree.children?.[0].properties).toEqual({ id: 'prompt-示例' });
        expect(tree.children?.[1].properties).toEqual({ id: 'prompt-示例-2' });
    });
});
