import AiHomePage from '@/app/ai/AiHomePage';
import { buildHomeMetadata } from '@/lib/seo/metadata';

export const runtime = 'nodejs';
export const revalidate = 300;
export const metadata = buildHomeMetadata();

export default AiHomePage;
