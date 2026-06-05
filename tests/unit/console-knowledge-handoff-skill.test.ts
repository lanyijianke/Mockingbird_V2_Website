import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const skillDir = path.join(root, 'console-knowledge-handoff');

function readJson(relativePath: string) {
  return JSON.parse(readFileSync(path.join(skillDir, relativePath), 'utf8'));
}

describe('console-knowledge-handoff skill', () => {
  it('replaces the legacy web-article skill directory', () => {
    expect(existsSync(path.join(root, 'web-article'))).toBe(false);
    expect(existsSync(path.join(skillDir, 'SKILL.md'))).toBe(true);
  });

  it('keeps review gate rules explicit in the skill body', () => {
    const skill = readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');

    expect(skill).toContain('未经用户明确确认，绝不发布');
    expect(skill).toContain('审阅暂存阶段绝不更新 `ai/manifest.json`');
    expect(skill).toContain('将文章暂存至 `ai/articles/review/<slug>/index.md`');
    expect(skill).toContain('若需翻译英文内容，必须使用 `references/terminology.json`');
  });

  it('requires published articles to use the unified revalidation endpoint', () => {
    const skill = readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');

    expect(skill).toContain('POST /api/revalidate/content');
    expect(skill).toContain('{"type":"article","action":"publish","site":"ai","slug":"<slug>"}');
  });

  it('provides a Chinese handoff fixture that should be copied without translation', () => {
    const handoff = readJson('fixtures/console-chinese-handoff.json');

    expect(handoff.schemaVersion).toBe(1);
    expect(handoff.source.sourceType).toBe('twitter');
    expect(handoff.source.sourceContentId).toBe('tweet-zh-42');
    expect(handoff.article.language).toBe('zh');
    expect(handoff.article.content).toContain('Agent 工作流为什么需要可审计的中间状态');
    expect(handoff.article.content).toContain('有效复核');
    expect(handoff.mediaAssets[0]).toMatchObject({
      assetType: 'image',
      processingStatus: 'completed'
    });
  });

  it('provides an English handoff fixture that must be translated to Chinese', () => {
    const handoff = readJson('fixtures/console-english-handoff.json');

    expect(handoff.schemaVersion).toBe(1);
    expect(handoff.source.sourceType).toBe('twitter');
    expect(handoff.source.sourceContentId).toBe('tweet-en-42');
    expect(handoff.article.language).toBe('en');
    expect(handoff.article.content).toContain('LLM agents');
    expect(handoff.article.content).toContain('review gate');
    expect(handoff.analysis.categoryHints).toContain('ai-application');
  });

  it('binds eval scenarios to real fixture files', () => {
    const evals = readJson('evals/evals.json');

    expect(evals.skill_name).toBe('console-knowledge-handoff');
    expect(evals.evals).toHaveLength(3);
    for (const entry of evals.evals) {
      expect(entry.files.length).toBeGreaterThan(0);
      for (const file of entry.files) {
        expect(existsSync(path.join(skillDir, file))).toBe(true);
      }
    }
  });
});
