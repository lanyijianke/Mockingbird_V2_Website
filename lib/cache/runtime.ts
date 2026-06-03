import { CacheManager } from './manager';
import { MemoryCacheStore } from './memory-store';

const store = new MemoryCacheStore();
const manager = new CacheManager(store);

export function getCacheManager(): CacheManager {
    return manager;
}
