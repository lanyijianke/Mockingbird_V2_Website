export function isSkillMarketingPageEnabled(): boolean {
    return process.env.NEXT_PUBLIC_SKILL_PAGE_ENABLED === 'true';
}
