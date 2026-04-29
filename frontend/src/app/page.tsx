import { Header }           from "@/components/header";
import { BalanceCard }      from "@/components/balance-card";
import { DepositWithdraw }  from "@/components/deposit-withdraw";
import { RebalanceCard }    from "@/components/rebalance-card";
import { YieldTable }       from "@/components/yield-table";
import { PortfolioCard }    from "@/components/portfolio-card";
import { NetworkBanner }    from "@/components/network-banner";
import { FaucetCard }       from "@/components/faucet-card";
import { Footer }           from "@/components/footer";

export default function HomePage() {
  return (
    <>
      <Header />
      <main className="container relative space-y-8 py-10 animate-fade-in">
        {/* hero */}
        <section className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-glow/30 bg-emerald-glow/[0.06] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-glow">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-emerald-glow" />
            Live on Arbitrum Sepolia
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-zinc-50 sm:text-4xl">
            Private institutional yield, optimized by an AI agent inside a TEE.
          </h1>
          <p className="max-w-2xl text-sm text-zinc-400 sm:text-base">
            Deposits are encrypted ERC-7984 ciphertext. The Yield Fortress
            Optimizer reads your portfolio + live yield data <em>inside</em> an
            iExec Nox TDX enclave and rebalances into T-Bills, IG bonds,
            private credit, and tokenised MMFs — without ever exposing
            balances or strategy weights on-chain.
          </p>
        </section>

        <NetworkBanner />

        {/* main grid */}
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-5">
            <BalanceCard />
            <FaucetCard />
            <DepositWithdraw />
            <YieldTable />
          </div>
          <div className="space-y-5">
            <RebalanceCard />
            <PortfolioCard />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
