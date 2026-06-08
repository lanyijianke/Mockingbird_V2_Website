/**
 * api-validation.ts 单元测试
 * 测试 API 参数校验工具函数
 */
import { describe, it, expect } from 'vitest';
import {
    parsePaginationParams,
    parseCountParam,
    parseSearchQuery,
    parseCategoryParam,
} from '@/lib/utils/api-validation';

describe('parsePaginationParams', () => {
    it('默认值: page=1, pageSize=12', () => {
        const params = new URLSearchParams();
        const result = parsePaginationParams(params);
        expect(result.page).toBe(1);
        expect(result.pageSize).toBe(12);
    });

    it('正常参数解析', () => {
        const params = new URLSearchParams({ page: '3', pageSize: '20' });
        const result = parsePaginationParams(params);
        expect(result.page).toBe(3);
        expect(result.pageSize).toBe(20);
    });

    it('page < 1 应限制为 1', () => {
        const params = new URLSearchParams({ page: '0' });
        expect(parsePaginationParams(params).page).toBe(1);

        const params2 = new URLSearchParams({ page: '-5' });
        expect(parsePaginationParams(params2).page).toBe(1);
    });

    it('pageSize 上限 100', () => {
        const params = new URLSearchParams({ pageSize: '999' });
        expect(parsePaginationParams(params).pageSize).toBe(100);
    });

    it('pageSize 下限 1', () => {
        const params = new URLSearchParams({ pageSize: '0' });
        expect(parsePaginationParams(params).pageSize).toBe(1);
    });

    it('非数字参数应回退到默认值', () => {
        const params = new URLSearchParams({ page: 'abc', pageSize: 'xyz' });
        const result = parsePaginationParams(params);
        expect(result.page).toBe(1);
        expect(result.pageSize).toBe(12);
    });
});

describe('parseCountParam', () => {
    it('默认值 9', () => {
        const params = new URLSearchParams();
        expect(parseCountParam(params)).toBe(9);
    });

    it('自定义默认值', () => {
        const params = new URLSearchParams();
        expect(parseCountParam(params, 5)).toBe(5);
    });

    it('正常参数解析', () => {
        const params = new URLSearchParams({ count: '15' });
        expect(parseCountParam(params)).toBe(15);
    });

    it('上限 50', () => {
        const params = new URLSearchParams({ count: '100' });
        expect(parseCountParam(params)).toBe(50);
    });

    it('下限 1', () => {
        const params = new URLSearchParams({ count: '0' });
        expect(parseCountParam(params)).toBe(1);
    });

    it('非数字回退默认值', () => {
        const params = new URLSearchParams({ count: 'abc' });
        expect(parseCountParam(params)).toBe(9);
    });
});

describe('parseSearchQuery', () => {
    it('无 q 参数返回 undefined', () => {
        const params = new URLSearchParams();
        expect(parseSearchQuery(params)).toBeUndefined();
    });

    it('空字符串返回 undefined', () => {
        const params = new URLSearchParams({ q: '' });
        expect(parseSearchQuery(params)).toBeUndefined();
    });

    it('纯空白返回 undefined', () => {
        const params = new URLSearchParams({ q: '   ' });
        expect(parseSearchQuery(params)).toBeUndefined();
    });

    it('正常查询去除首尾空白', () => {
        const params = new URLSearchParams({ q: '  bitcoin  ' });
        expect(parseSearchQuery(params)).toBe('bitcoin');
    });

    it('超长查询截断到 200 字符', () => {
        const longQuery = 'A'.repeat(300);
        const params = new URLSearchParams({ q: longQuery });
        expect(parseSearchQuery(params)!.length).toBe(200);
    });
});

describe('parseCategoryParam', () => {
    it('无 category 参数返回 undefined', () => {
        const params = new URLSearchParams();
        expect(parseCategoryParam(params)).toBeUndefined();
    });

    it('空字符串返回 undefined', () => {
        const params = new URLSearchParams({ category: '' });
        expect(parseCategoryParam(params)).toBeUndefined();
    });

    it('合法分类编码正常返回', () => {
        const params = new URLSearchParams({ category: 'engineering' });
        expect(parseCategoryParam(params)).toBe('engineering');
    });

    it('纯字母数字合法', () => {
        const params = new URLSearchParams({ category: 'gemini3' });
        expect(parseCategoryParam(params)).toBe('gemini3');
    });

    it('含特殊字符的应被拒绝', () => {
        expect(parseCategoryParam(new URLSearchParams({ category: 'cat;drop table' }))).toBeUndefined();
        expect(parseCategoryParam(new URLSearchParams({ category: '../etc/passwd' }))).toBeUndefined();
        expect(parseCategoryParam(new URLSearchParams({ category: 'cat name' }))).toBeUndefined();
    });
});
