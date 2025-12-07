import { useAppStore } from '@/state/useAppStore';

type InfoDrawerProps = {
  source?: string | null;
  candlesCount: number;
  signalsCount: number;
  orderBlocksCount: number;
  gapsCount: number;
  swingsCount: number;
  sweepsCount: number;
};

export function InfoDrawer({
  source,
  candlesCount,
  signalsCount,
  orderBlocksCount,
  gapsCount,
  swingsCount,
  sweepsCount,
}: InfoDrawerProps) {
  const { toggleInfo } = useAppStore();
  return (
    <div className="flex h-full w-80 flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-950/95 p-4 text-sm text-zinc-200 shadow-2xl shadow-black/60">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-400">Info dashboard</p>
          <p className="text-base font-semibold text-white">Strategy status</p>
        </div>
        <button
          className="rounded px-2 py-1 text-xs text-zinc-400 transition hover:text-emerald-200"
          onClick={() => toggleInfo()}
          aria-label="Close info"
        >
          ✕
        </button>
      </div>

      <section>
        <p className="mb-1 text-xs uppercase text-zinc-500">Data</p>
        <div className="space-y-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-[13px]">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Source</span>
            <span className="font-semibold text-emerald-200">{source || 'Live'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Candles</span>
            <span className="font-semibold text-white">{candlesCount.toLocaleString()}</span>
          </div>
        </div>
      </section>

      <section>
        <p className="mb-1 text-xs uppercase text-zinc-500">Detections</p>
        <div className="grid grid-cols-2 gap-2 text-[13px]">
          {[
            { label: 'Signals', value: signalsCount, color: 'text-emerald-200' },
            { label: 'Order Blocks', value: orderBlocksCount, color: 'text-sky-200' },
            { label: 'FVGs', value: gapsCount, color: 'text-rose-200' },
            { label: 'Swings', value: swingsCount, color: 'text-amber-200' },
            { label: 'Sweeps', value: sweepsCount, color: 'text-indigo-200' },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
              <p className="text-[11px] uppercase text-zinc-500">{item.label}</p>
              <p className={`text-sm font-semibold ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-1 text-xs uppercase text-zinc-500">Modules</p>
        <ul className="space-y-1 text-[13px] leading-relaxed text-zinc-300">
          <li><span className="text-emerald-300">structure/</span> bias, swings, BOS/CHoCH</li>
          <li><span className="text-sky-300">liquidity/</span> sweeps, EQH/EQL, premium/discount, HTF levels</li>
          <li><span className="text-rose-300">gaps/</span> FVG detection</li>
          <li><span className="text-amber-300">blocks/</span> order blocks, breakers</li>
          <li><span className="text-indigo-300">signals/</span> alert assembly & filters</li>
          <li><span className="text-fuchsia-300">model2022/</span> ICT 2022 setups</li>
        </ul>
      </section>

      <section>
        <p className="mb-1 text-xs uppercase text-zinc-500">Quick tips</p>
        <ul className="list-disc space-y-1 pl-4 text-[13px] text-zinc-300">
          <li>Use Layers ➜ BOS/CHoCH segments to see structure shifts.</li>
          <li>Auto trade requires a fresh signal and Auto trade ON in the chart panel.</li>
          <li>Model 2022 signals come from the 15m FVG logic (see model2022 module).</li>
        </ul>
      </section>
    </div>
  );
}
