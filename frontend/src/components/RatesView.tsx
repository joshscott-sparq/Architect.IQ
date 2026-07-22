import { useEffect, useState } from "react";
import { api } from "../api";

const HOURS_PER_DAY = 8;
const LOCATIONS = ["US", "NS"];

type Cards = Awaited<ReturnType<typeof api.listRateCards>>;
type Rates = Awaited<ReturnType<typeof api.getRates>>;
type Row = { discipline: string; tier: string; location: string; day_rate: number };

export function RatesView() {
  const [cards, setCards] = useState<Cards | null>(null);
  const [active, setActive] = useState<Rates | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [name, setName] = useState("");
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api.listRateCards().then(setCards).catch((e) => setError(String(e)));
    api.getRates().then((r) => { setActive(r); setRows(r.rates); setDirty(false); }).catch(() => {});
  }
  useEffect(refresh, []);

  const activeCardId = cards?.find((c) => c.is_active)?.id;

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

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setDirty(true);
  }
  function addRow() {
    setRows((rs) => [...rs, { discipline: "", tier: "", location: "US", day_rate: 0 }]);
    setDirty(true);
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
    setDirty(true);
  }

  async function saveRows() {
    if (!activeCardId) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateRateCard(activeCardId, rows);
      refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div>
        <div className="card">
          <h2 className="card-h">Rate cards</h2>
          <p className="text-[13px] text-muted mt-0">
            Save multiple rate cards; one is active and one is the default. Estimates use the active card;
            re-cost an estimate to apply a change. Activate a card to edit its rates on the right.
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
          <h2 className="card-h">
            Active card{active ? ` · ${active.source}` : ""}
            {dirty && <span className="normal-case tracking-normal text-brand-orange-deep ml-2">unsaved changes</span>}
          </h2>
          <p className="text-[13px] text-muted mt-0 mb-2">Rates shown per hour; stored internally as a day rate (× {HOURS_PER_DAY}).</p>
          {active && (
            <>
              <div className="max-h-[500px] overflow-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="text-muted">
                      <th className="text-left py-1.5 px-2 border-b border-line uppercase text-[12px]">Discipline</th>
                      <th className="text-left py-1.5 px-2 border-b border-line uppercase text-[12px]">Tier</th>
                      <th className="text-left py-1.5 px-2 border-b border-line uppercase text-[12px]">Loc</th>
                      <th className="text-left py-1.5 px-2 border-b border-line uppercase text-[12px]">$/hr</th>
                      <th className="w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td className="py-1 px-1 border-b border-line">
                          <input className="field !w-full !py-1 !px-1.5 text-[13px]" value={r.discipline}
                            onChange={(e) => setRow(i, { discipline: e.target.value })} />
                        </td>
                        <td className="py-1 px-1 border-b border-line">
                          <input className="field !w-full !py-1 !px-1.5 text-[13px]" value={r.tier}
                            onChange={(e) => setRow(i, { tier: e.target.value })} />
                        </td>
                        <td className="py-1 px-1 border-b border-line">
                          <select className="field !w-full !py-1 !px-1.5 text-[13px]" value={r.location}
                            onChange={(e) => setRow(i, { location: e.target.value })}>
                            {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </td>
                        <td className="py-1 px-1 border-b border-line">
                          <input type="number" min={0} step={1} className="field !w-20 !py-1 !px-1.5 text-[13px]"
                            value={Math.round(r.day_rate / HOURS_PER_DAY)}
                            onChange={(e) => setRow(i, { day_rate: (parseFloat(e.target.value) || 0) * HOURS_PER_DAY })} />
                        </td>
                        <td className="py-1 px-1 border-b border-line text-center">
                          <button className="text-muted hover:text-brand-orange-deep" title="Remove row" onClick={() => removeRow(i)}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <button className="btn text-[13px]" onClick={addRow}>+ Add row</button>
                <button className="btn btn-primary text-[13px] ml-auto" disabled={!dirty || saving} onClick={saveRows}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
