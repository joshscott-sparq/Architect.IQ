import { useEffect, useState } from "react";
import { api } from "../api";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

type Rates = Awaited<ReturnType<typeof api.getRates>>;

export function RatesView() {
  const [rates, setRates] = useState<Rates | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.getRates().then(setRates).catch((e) => setError(String(e)));
  }
  useEffect(refresh, []);

  async function upload(files: FileList | null) {
    if (!files || !files[0]) return;
    setBusy(true);
    setError(null);
    try {
      await api.uploadRates(files[0]);
      refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div>
        <div className="card">
          <h2 className="card-h">Rate card</h2>
          <p className="text-[13px] text-muted mt-0">
            Load a roles-and-rates file (.csv, .xlsx, .yaml) to model a different leverage model and reprice
            estimates. New estimates use the active card; open an estimate and choose “Re-cost” to reprice it.
          </p>
          <div
            className={
              "border-2 border-dashed rounded-xl p-7 text-center transition-colors mt-2 " +
              (drag ? "border-brand-orange bg-orange-50 text-brand-orange" : "border-line text-muted bg-[#fdfcfb]")
            }
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
          >
            Drag &amp; drop a rate card — columns: discipline, tier, location, day_rate
            <div className="mt-2">
              <input type="file" accept=".csv,.xlsx,.yaml,.yml" onChange={(e) => upload(e.target.files)} />
            </div>
          </div>
          {busy && <div className="text-muted text-sm mt-2">Loading…</div>}
          {error && <div className="text-brand-orange-deep text-[13px] mt-2">{error}</div>}
          {rates && (
            <div className="mt-3 text-[13px]">
              <span className="badge bg-brand-mint text-brand-sage">source: {rates.source}</span>{" "}
              <span className="text-muted">
                {rates.summary.rows} rows · {rates.summary.disciplines.length} disciplines ·{" "}
                {rates.summary.locations.join("/")}
              </span>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="card">
          <h2 className="card-h">Active rates</h2>
          {rates && (
            <div className="max-h-[520px] overflow-y-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="text-muted">
                    <th className="text-left py-1.5 px-2 border-b border-line uppercase text-[12px]">Discipline</th>
                    <th className="text-left py-1.5 px-2 border-b border-line uppercase text-[12px]">Tier</th>
                    <th className="text-left py-1.5 px-2 border-b border-line uppercase text-[12px]">Loc</th>
                    <th className="text-left py-1.5 px-2 border-b border-line uppercase text-[12px]">Day rate</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.rates.map((r, i) => (
                    <tr key={i}>
                      <td className="py-1.5 px-2 border-b border-line">{r.discipline}</td>
                      <td className="py-1.5 px-2 border-b border-line">{r.tier}</td>
                      <td className="py-1.5 px-2 border-b border-line">{r.location}</td>
                      <td className="py-1.5 px-2 border-b border-line">{money(r.day_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
