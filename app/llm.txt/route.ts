import { GET as getLlmsText } from '@/app/llms.txt/route';

export const runtime = 'nodejs';

export async function GET() {
  return getLlmsText();
}
