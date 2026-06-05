import '@/app/_styles/editorial.css';
import '@/app/_styles/shared-ui.css';
import '@/app/_styles/articles-list.css';
import '@/app/_styles/prompts.css';
import AiHomePage from '@/app/ai/AiHomePage';
import { buildHomeMetadata } from '@/lib/seo/metadata';

export const runtime = 'nodejs';
export const revalidate = 300;
export const metadata = buildHomeMetadata();

export default AiHomePage;
