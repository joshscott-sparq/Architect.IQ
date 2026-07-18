import { useEffect, useState } from "react";
import { api } from "../api";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

type Cards = Awaited<ReturnType<typeof api.listRateCards>>;
type Rates = Awaited<ReturnType<typeof api.getRates>>;

export function RatesView() {
  const [cards, setCards] = useState<Cards | null>(null);
  const [active, setActive] = useState<Rates | null>(null);
  const [name, setName] = useState("");
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.listRateCards().then(setCards).catch((e) => setError(String(e)));
    api.getRates().then(setActive).catch(() => {});
  }
  useEffect(refresh, []);

  async function upload(files: FileList | null) {
    if (!files || !files[0]) return;
    setBusy(true);
    setError(null);
    try {
      await api.createRateCard(files[0], name || files[0].name);
      setName("");
      refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function activate(id: string) {
    await api.activateRateCard(id);
    refresh();
  }
  async function remove(id: string) {
    try {
      await api.deleteRateCard(id);
      refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div>
        <div className="card">
          <h2 className="card-h">Rate cards</h2>
          <p className="text-[13px] text-muted mt-0">
            Save multiple rate cards; one is active and one is the default. Estimates use the active card;
            re-cost an estimate to apply a change. Each row is role, tier, location, and rate.
          </p>
          {cards?.map((c) => (
            <div key={c.id} className="flex items-center gap-2 py-2 border-b border-line last:border-0 text-[13px]">
              <div className="flex-1">
                <b>{c.name}</b>
                {c.is_default && <span className="badge bg-brand-mint text-brand-sage ml-1.5">default</span>}
                {c.is_active && <span className="badge bg-brand-aurora text-brand-deepest ml-1.5">active</span>}
                <div className="text-muted text-[11px]">{c.summary.rows} rows · {c.summary.locations.join("/")}</div>
              </div>
              {!c.is_active && <button className="btn text-[12px] py-1" onClick={() => activate(c.id)}>Activate</button>}
              {!c.is_default && <button className="btn text-[12px] py-1" onClick={() => remove(c.id)}>Delete</button>}
            </div>
          ))}
        </div>

        <div className="card">
          <h2 className="card-h">Add a rate card</h2>
          <label className="label">Name</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FY26 Onshore" />
          <div
            className={
              "border-2 border-dashed rounded-xl p-6 text-center transition-colors mt-3 " +
              (drag ? "border-brand-orange bg-orange-50 text-brand-orange" : "border-line text-muted bg-[#fdfcfb]")
            }
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
          >
            Drag &amp; drop .csv / .xlsx / .yaml — columns: discipline, tier, location, day_rate
            <div className="mt-2"><input type="file" accept=".csv,.xlsx,.yaml,.yml" onChange={(e) => upload(e.target.files)} /></div>
          </div>
          {busy && <div className="text-muted text-sm mt-2">Saving…</div>}
          {error && <div className="text-brand-orange-deep text-[13px] mt-2">{error}</div>}
        </div>
      </div>

      <div>
        <div className="card">
          <h2 className="card-h">Active card{active ? ` · ${active.source}` : ""}</h2>
          {active && (
            <div className="max-h-[560px] overflow-auto">
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
                  {active.rates.map((r, i) => (
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
