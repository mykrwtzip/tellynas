import { SharePage } from './share-page';
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharePage token={token} />;
}
