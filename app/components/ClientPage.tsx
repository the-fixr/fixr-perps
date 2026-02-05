'use client';

import dynamic from 'next/dynamic';

const Demo = dynamic(() => import('./Demo'), {
  ssr: false,
});

export default function ClientPage() {
  return (
    <main className="min-h-screen flex flex-col p-4">
      <Demo />
    </main>
  );
}