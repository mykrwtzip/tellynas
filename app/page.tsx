import { redirect } from 'next/navigation';
import { getSession } from '@/lib/api';
import { publicRuntimeConfig } from '@/lib/config';
import { backendKind } from '@/lib/store';
import { FileManager } from '@/components/dashboard/file-manager';

export const dynamic = 'force-dynamic';

export default async function DrivePage() {
  const session = await getSession();

  if (!session) redirect('/login');

  return (
    <FileManager
      username={session.sub}
      runtime={publicRuntimeConfig()}
      indexBackend={backendKind}
    />
  );
}
