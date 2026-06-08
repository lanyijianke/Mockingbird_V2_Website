/**
 * categories.ts 单元测试
 * 测试分类系统：名称查询、子类获取、编码列表
 */
import { describe, it, expect } from 'vitest';
import { getCategoryName, getSubcategories, getAllCategoryCodes, CATEGORY_GROUPS } from '@/lib/categories';

describe('CATEGORY_GROUPS', () => {
    it('应有至少一个分组', () => {
        expect(CATEGORY_GROUPS.length).toBeGreaterThan(0);
    });

    it('每个分组应有 code 和 name', () => {
        for (const group of CATEGORY_GROUPS) {
            expect(group.code).toBeTruthy();
            expect(group.name).toBeTruthy();
            expect(Array.isArray(group.children)).toBe(true);
        }
    });
});

describe('getCategoryName', () => {
    it('已知 code 应返回中文名', () => {
        // 验证至少有一个能正常工作
        const codes = getAllCategoryCodes();
        expect(codes.length).toBeGreaterThan(0);

        const firstName = getCategoryName(codes[0]);
        expect(firstName).toBeTruthy();
        expect(firstName).not.toBe(codes[0]); // 不应回退到 code 自身（除非注册名就是 code）
    });

    it('null/undefined 应返回 "未分类"', () => {
        expect(getCategoryName(null)).toBe('未分类');
        expect(getCategoryName(undefined)).toBe('未分类');
    });

    it('空字符串应返回 "未分类"', () => {
        expect(getCategoryName('')).toBe('未分类');
    });

    it('未知 code 应原样返回', () => {
        expect(getCategoryName('nonexistent-code-xyz')).toBe('nonexistent-code-xyz');
    });
});

describe('getSubcategories', () => {
    it('有效分组 code 应返回子类列表', () => {
        const firstGroup = CATEGORY_GROUPS[0];
        const subs = getSubcategories(firstGroup.code);
        expect(subs).toEqual(firstGroup.children);
    });

    it('文章分组应使用读者入口式短分类', () => {
        expect(getSubcategories('articles')).toEqual([
            { code: 'fundamentals', name: '基础概念' },
            { code: 'engineering', name: '工程架构' },
            { code: 'devtools', name: '开发工具' },
            { code: 'workflows', name: '工作流' },
            { code: 'applications', name: '应用实践' },
            { code: 'cases', name: '案例拆解' },
            { code: 'opinions', name: '观点反思' },
        ]);
    });

    it('无效分组 code 应返回空数组', () => {
        expect(getSubcategories('nonexistent-group')).toEqual([]);
    });
});

describe('getAllCategoryCodes', () => {
    it('应包含顶级和子级编码', () => {
        const codes = getAllCategoryCodes();
        expect(codes.length).toBeGreaterThan(0);

        // 应包含至少一个顶级分组 code
        const groupCodes = CATEGORY_GROUPS.map(g => g.code);
        for (const gc of groupCodes) {
            expect(codes).toContain(gc);
        }
    });

    it('编码不应有重复', () => {
        const codes = getAllCategoryCodes();
        const unique = new Set(codes);
        expect(unique.size).toBe(codes.length);
    });
});
