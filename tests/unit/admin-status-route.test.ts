import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetMonitoringStatus = vi.fn();
const mockGetHealthSnapshot = vi.fn();
const mockLoadCoverageSnapshot = vi.fn();

vi.mock('@/lib/monitoring/status-service', () => ({
    getMonitoringStatus: mockGetMonitoringStatus,
}));

vi.mock('@/app/api/health/route', () => ({
    getHealthSnapshot: mockGetHealthSnapshot,
}));

vi.mock('@/lib/monitoring/coverage-service', () => ({
    loadCoverageSnapshot: mockLoadCoverageSnapshot,
}));

describe('GET /api/admin/status', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        process.env.KNOWLEDGE_ADMIN_TOKEN = 'secret-token';
        mockGetHealthSnapshot.mockResolvedValue({
            status: 'healthy',
            timestamp: '2026-06-08T12:00:00.000Z',
            version: '0.1.0',
            database: { status: 'ok', prompts: 100 },
            articleSources: { status: 'ok', articles: 10 },
            scheduler: { running: true, jobs: [] },
            service: 'Mockingbird Knowledge',
        });
        mockLoadCoverageSnapshot.mockResolvedValue({
            site: 'ai',
            available: true,
            prompts: { sourceTotal: 100, indexed: 98, pending: 2 },
            articles: { sourceTotal: 10, indexed: 10, pending: 0 },
            embeddings: {
                semanticEnabled: true,
                totalChunks: 200,
                embeddedChunks: 190,
                promptDocumentsWithEmbeddings: 98,
                articleDocumentsWithEmbeddings: 10,
                promptDocumentsPending: 0,
                articleDocumentsPending: 0,
            },
            vectors: {
                promptPoints: 98,
                articlePoints: 10,
                totalPoints: 108,
            },
        });
    });

    it('rejects missing admin token', async () => {
        const { GET } = await import('@/app/api/admin/status/route');
        const response = await GET(new NextRequest('http://localhost:5046/api/admin/status'));
        expect(response.status).toBe(401);
    });

    it('returns aggregated job monitoring payload for valid admin token', async () => {
        mockGetMonitoringStatus.mockResolvedValue({ jobs: [], scheduler: { running: true } });
        const { GET } = await import('@/app/api/admin/status/route');
        const response = await GET(new NextRequest('http://localhost:5046/api/admin/status', {
            headers: { 'x-admin-token': 'secret-token' },
        }));

        expect(response.status).toBe(200);
        expect(mockLoadCoverageSnapshot).toHaveBeenCalledWith('ai');
        expect(mockGetMonitoringStatus).toHaveBeenCalledWith({
            health: expect.objectContaining({ status: 'healthy' }),
            indexStatus: expect.objectContaining({
                available: true,
                prompts: { sourceTotal: 100, indexed: 98, pending: 2 },
            }),
        });
        expect(await response.json()).toEqual({
            success: true,
            data: { jobs: [], scheduler: { running: true } },
        });
    });
});
