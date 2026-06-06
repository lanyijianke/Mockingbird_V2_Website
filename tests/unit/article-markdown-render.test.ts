import { describe, expect, it } from 'vitest';

describe('article markdown renderer', () => {
    it('renders markdown and extracts heading ids', async () => {
        const { renderArticleMarkdown } = await import('@/lib/articles/render-markdown');

        const result = await renderArticleMarkdown('# 标题\n\n## 小节\n\n![图](images/cover.jpg)\n\n正文');

        expect(result.renderedHtml).toContain('<h1 id="');
        expect(result.renderedHtml).toContain('loading="lazy"');
        expect(result.toc.map((item) => item.text)).toContain('标题');
        expect(result.toc.map((item) => item.text)).toContain('小节');
    });
});
