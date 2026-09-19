import React from 'react';
import { notFound } from 'next/navigation';
import { getEscrowById } from '@/lib/escrow/milestones';
import { MilestoneTracker } from '@/components/escrow/milestone-tracker';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EscrowDetailPage({ params }: PageProps) {
  const { id } = await params;
  const deal = getEscrowById(id);

  if (!deal) {
    // If not in memory store, create a fallback mock representation for demo or 404
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4">
      <MilestoneTracker initialDeal={deal} />
    </main>
  );
}
