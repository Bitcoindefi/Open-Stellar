import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle2, Download, ExternalLink, ShieldCheck, XCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  getLatestReputationCredential,
  verifyReputationCredential,
} from '@/lib/reputation/credential-client'

type CredentialPageProps = {
  params: Promise<{ agentId: string }>
}

export async function generateMetadata({ params }: CredentialPageProps): Promise<Metadata> {
  const { agentId } = await params
  const credential = getLatestReputationCredential(agentId)

  if (!credential) {
    return {
      title: 'Reputation credential not issued - Open Stellar',
      description: 'No public reputation credential has been issued for this agent yet.',
    }
  }

  return {
    title: `${credential.agent.name} reputation credential - Open Stellar`,
    description: `Public reputation credential for ${credential.agent.name}, level ${credential.agent.level}.`,
  }
}

export default async function CredentialPage({ params }: CredentialPageProps) {
  const { agentId } = await params
  const credential = getLatestReputationCredential(agentId)

  if (!credential) {
    return (
      <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          <Button asChild variant="outline" className="w-fit border-cyan-400/30 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20">
            <Link href={`/agents/${encodeURIComponent(agentId)}`}>Back to agent</Link>
          </Button>
          <Card className="border-slate-800 bg-slate-950/85 text-slate-100">
            <CardHeader>
              <CardDescription className="font-mono uppercase tracking-[0.24em] text-cyan-300">
                Reputation credential
              </CardDescription>
              <CardTitle>No credential issued yet</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-400">
              This public page is read-only. A credential must be issued through the API before it appears here.
            </CardContent>
          </Card>
        </div>
      </main>
    )
  }

  const verification = verifyReputationCredential(credential)
  const credentialJson = JSON.stringify(credential, null, 2)
  const VerifyIcon = verification.ok ? CheckCircle2 : XCircle
  const isOnChainIssued = Boolean(credential.proof.transactionHash)
  const verificationLabel = verification.ok
    ? isOnChainIssued ? 'Verified on-chain' : 'Verified locally'
    : 'Verification failed'

  return (
    <main className="min-h-screen bg-[#030712] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="outline" className="border-cyan-400/30 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20">
            <Link href={credential.agent.profilePath}>Back to agent</Link>
          </Button>
          <Badge variant={verification.ok ? 'default' : 'destructive'} className="font-mono uppercase">
            {verificationLabel}
          </Badge>
        </div>

        <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-slate-800 bg-slate-950/85 text-slate-100 shadow-[0_24px_80px_rgba(2,8,23,0.45)]">
            <CardHeader>
              <CardDescription className="font-mono uppercase tracking-[0.24em] text-cyan-300">
                Reputation credential
              </CardDescription>
              <CardTitle className="text-3xl">{credential.agent.name}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Level" value={String(credential.agent.level)} />
                <Stat label="Success rate" value={`${credential.agent.successRate.toFixed(1)}%`} />
                <Stat label="Reputation" value={`${credential.reputation.score} / ${credential.reputation.tier}`} />
              </div>

              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <a href={credential.links.jsonUrl}>
                    <Download />
                    JSON export
                  </a>
                </Button>
                {isOnChainIssued && credential.links.explorerUrl ? (
                  <Button asChild variant="outline">
                    <a href={credential.links.explorerUrl} target="_blank" rel="noreferrer">
                      <ExternalLink />
                      Stellar explorer
                    </a>
                  </Button>
                ) : (
                  <Button asChild variant="outline">
                    <a href={credential.links.jsonUrl}>
                      <ShieldCheck />
                      View attestation
                    </a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-950/85 text-slate-100">
            <CardHeader>
              <CardDescription className="font-mono uppercase tracking-[0.24em] text-emerald-300">
                Live verification
              </CardDescription>
              <CardTitle className="flex items-center gap-2 text-xl">
                <VerifyIcon className={verification.ok ? 'text-emerald-300' : 'text-red-300'} />
                verify_credential: {verification.result}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 font-mono text-xs text-slate-300">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-emerald-100">
                <span className="flex items-center gap-2">
                  <VerifyIcon className={verification.ok ? 'size-4 text-emerald-300' : 'size-4 text-red-300'} />
                  {verificationLabel}
                </span>
                {isOnChainIssued && credential.links.explorerUrl ? (
                  <a href={credential.links.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-200 underline-offset-4 hover:underline">
                    Stellar explorer
                    <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <span className="text-slate-400">
                    local attestation {credential.proof.attestationHash.slice(0, 12)}...
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-900/70 px-3 py-2 text-slate-400">
                <span>proof mode</span>
                <span>{credential.proof.mode}</span>
              </div>
              {Object.entries(verification.checks).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-900/70 px-3 py-2">
                  <span>{key}</span>
                  <span className={value ? 'text-emerald-300' : 'text-red-300'}>{value ? 'pass' : 'fail'}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/70 px-3 py-2 text-slate-400">
                <ShieldCheck className="size-4 text-cyan-300" />
                Checked {verification.checkedAt}
              </div>
            </CardContent>
          </Card>
        </section>

        <Card className="border-slate-800 bg-slate-950/85 text-slate-100">
          <CardHeader>
            <CardDescription className="font-mono uppercase tracking-[0.24em] text-cyan-300">
              Credential JSON
            </CardDescription>
            <CardTitle className="text-xl">{credential.id}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[520px] overflow-auto rounded-md border border-slate-800 bg-slate-950 p-4 text-xs leading-relaxed text-slate-300">
              {credentialJson}
            </pre>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-100">{value}</p>
    </div>
  )
}
