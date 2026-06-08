import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const skillRoot = path.join(process.cwd(), 'skills/mockingbird-knowledge');

async function readSkillFile(relativePath: string): Promise<string> {
    return readFile(path.join(skillRoot, relativePath), 'utf8');
}

describe('mockingbird-knowledge skill package', () => {
    it('uses the knowledge name and describes reusable knowledge retrieval', async () => {
        const skill = await readSkillFile('SKILL.md');
        const metadata = await readSkillFile('agents/openai.yaml');

        expect(skill).toContain('name: mockingbird-knowledge');
        expect(skill).toContain('Mockingbird Knowledge');
        expect(skill).toContain('reusable knowledge assets');
        expect(metadata).toContain('display_name: Mockingbird Knowledge');
        expect(skill).not.toContain('/skills/mockingbird-agent-assets/scripts/');
    });

    it('keeps the read-only boundary explicit', async () => {
        const files = await Promise.all([
            readSkillFile('SKILL.md'),
            readSkillFile('references/api.md'),
            readSkillFile('scripts/search.mjs'),
            readSkillFile('scripts/get-prompt.mjs'),
            readSkillFile('scripts/get-article.mjs'),
        ]);
        const combined = files.join('\n');

        expect(combined).toContain('/api/agent/search');
        expect(combined).toContain('/api/agent/prompts/');
        expect(combined).toContain('/api/agent/articles/');
        expect(combined).toContain('/api/agent/index');
        expect(combined).toContain('/api/revalidate/content');

        for (const script of files.slice(2)) {
            expect(script).not.toContain('/api/agent/index');
            expect(script).not.toContain('/api/revalidate/content');
            expect(script).not.toContain('/api/jobs');
            expect(script).not.toContain('R2_');
        }
    });

    it('prefers the new base URL env var and accepts the legacy alias', async () => {
        for (const scriptName of ['search.mjs', 'get-prompt.mjs', 'get-article.mjs']) {
            const script = await readSkillFile(`scripts/${scriptName}`);

            expect(script).toContain('MOCKINGBIRD_KNOWLEDGE_BASE_URL');
            expect(script).toContain('MOCKINGBIRD_AGENT_ASSETS_BASE_URL');
        }

        const apiReference = await readSkillFile('references/api.md');
        expect(apiReference).toContain('MOCKINGBIRD_KNOWLEDGE_BASE_URL=https://example.com');
        expect(apiReference).toContain('legacy alias');
    });

    it('documents and supports media-aware asset search', async () => {
        const skill = await readSkillFile('SKILL.md');
        const apiReference = await readSkillFile('references/api.md');
        const searchScript = await readSkillFile('scripts/search.mjs');

        expect(skill).toContain('--media=image');
        expect(skill).toContain('--media=video');
        expect(skill).toContain('qualitySignals');
        expect(apiReference).toContain('media=image|video|any');
        expect(apiReference).toContain('mediaAssets');
        expect(searchScript).toContain("url.searchParams.set('media'");
        expect(searchScript).toContain("url.searchParams.set('useCase'");
    });
});
