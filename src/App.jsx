import React, { useState, useEffect, useCallback, useRef } from "react";
import { Save, Copy, Trash2, RotateCcw, Check, ChevronDown, ChevronUp, Layers, Plus, Zap, Printer, Loader2, MessageSquarePlus } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { storage } from "./storage";

const DEFAULT_PRINTERS = [
  { id: "core-one", name: "Prusa CORE One", watts: 120, price: 17000, lifespanHours: 6000 },
  { id: "bambu-a1", name: "Bambu Lab A1", watts: 140, price: 9000, lifespanHours: 5000 },
  { id: "voron-350", name: "Voron 350×350", watts: 250, price: 15000, lifespanHours: 6000 },
];

const DEFAULT_MATERIALS = [
  { id: "pla", name: "PLA", pricePerKg: 430 },
  { id: "petg", name: "PETG", pricePerKg: 480 },
  { id: "abs", name: "ABS", pricePerKg: 420 },
  { id: "pla-cf", name: "PLA-CF", pricePerKg: 750 },
  { id: "abs-cf", name: "ABS-CF", pricePerKg: 800 },
  { id: "petg-cf", name: "PETG-CF", pricePerKg: 820 },
];

// Configura tu propio endpoint de Formspree (gratis en https://formspree.io):
// crea una cuenta, crea un formulario nuevo, y pega aquí la URL que te den
// (algo como "https://formspree.io/f/xxxxabcd"). Mientras diga "TU-FORM-ID",
// el botón de sugerencias avisa que falta configurarlo.
const FEEDBACK_ENDPOINT = "https://formspree.io/f/mzebabjb";

const DEFAULT_RATES = {
  currency: "MXN",
  businessName: "",
  wastePercent: 8,
  electricityCostPerKwh: 2.4,
  maintenancePerHour: 1.5,
  laborRatePerHour: 90,
  marginPercent: 45,
  marginMode: "margin", // "margin" = sobre precio de venta · "markup" = sobre costo
  printers: DEFAULT_PRINTERS,
  materials: DEFAULT_MATERIALS,
};

function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function makeDefaultComponent(printerId, materialId, index) {
  return {
    id: newId("c"),
    name: index ? `Pieza ${index}` : "Pieza 1",
    printerId: printerId || DEFAULT_PRINTERS[0].id,
    materialId: materialId || DEFAULT_MATERIALS[0].id,
    weightGrams: 50,
    printHours: 4,
    postProcessHours: 0.5,
    extraCosts: 0,
  };
}

const DEFAULT_ORDER = {
  orderName: "",
  components: [makeDefaultComponent(null, null, 1)],
  extras: [],
};

function round2(n) {
  if (!isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function fmtMoney(n, currency) {
  const locale = currency === "MXN" ? "es-MX" : currency === "USD" ? "en-US" : "es-MX";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n || 0);
  } catch {
    return `$${round2(n).toFixed(2)}`;
  }
}

function n(v) {
  return typeof v === "number" && isFinite(v) ? v : 0;
}

function fmtHM(totalHours) {
  const h = Math.floor(n(totalHours));
  const m = Math.round((n(totalHours) - h) * 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function NumField({ label, value, onChange, step = 1, min = 0, suffix, hint }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <div className="field-input-wrap">
        <input
          type="number"
          className="field-input"
          value={value}
          min={min}
          step={step}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? "" : Number(v));
          }}
          onBlur={(e) => {
            if (e.target.value === "") onChange(0);
          }}
        />
        {suffix && <span className="field-suffix">{suffix}</span>}
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function TimeField({ label, totalHours, onChange, hint }) {
  const hours = Math.floor(n(totalHours));
  let minutes = Math.round((n(totalHours) - hours) * 60);
  if (minutes >= 60) minutes = 59;
  if (minutes < 0) minutes = 0;

  const setHours = (h) => onChange(Math.max(0, n(h)) + minutes / 60);
  const setMinutes = (m) => {
    let mm = n(m);
    if (mm > 59) mm = 59;
    if (mm < 0) mm = 0;
    onChange(hours + mm / 60);
  };

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="time-field-row">
        <div className="field-input-wrap">
          <input
            type="number"
            className="field-input"
            min={0}
            step={1}
            value={hours}
            onChange={(e) => setHours(e.target.value === "" ? 0 : Number(e.target.value))}
          />
          <span className="field-suffix">h</span>
        </div>
        <div className="field-input-wrap">
          <input
            type="number"
            className="field-input"
            min={0}
            max={59}
            step={5}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value === "" ? 0 : Number(e.target.value))}
          />
          <span className="field-suffix">min</span>
        </div>
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

function TextField({ value, onChange, placeholder, className }) {
  return (
    <input
      type="text"
      className={className || "field-input field-input-text"}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function LineRow({ label, value, currency, dim, strong }) {
  return (
    <div className={"line-row" + (dim ? " dim" : "") + (strong ? " strong" : "")}>
      <span className="line-label">{label}</span>
      <span className="line-value">{fmtMoney(value, currency)}</span>
    </div>
  );
}

function Section({ index, title, subtitle, children, open, onToggle, bodyClassName }) {
  return (
    <div className="section">
      <button type="button" className="section-head" onClick={onToggle}>
        <span className="section-num">{String(index).padStart(2, "0")}</span>
        <span className="section-titles">
          <span className="section-title">{title}</span>
          <span className="section-subtitle">{subtitle}</span>
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div className={"section-body" + (bodyClassName ? " " + bodyClassName : "")}>{children}</div>}
    </div>
  );
}

function PrinterCard({ printer, currency, onChange, onRemove, canRemove }) {
  return (
    <div className="printer-card">
      <div className="printer-card-head">
        <input
          className="printer-name-input"
          value={printer.name}
          placeholder="Nombre de la impresora"
          onChange={(e) => onChange({ ...printer, name: e.target.value })}
        />
        <span className="watt-tag"><Zap size={11} /> {printer.watts} W</span>
        {canRemove && (
          <button className="piece-remove" onClick={onRemove} aria-label="Quitar impresora">
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <div className="printer-card-fields">
        <NumField label="Consumo" value={printer.watts} onChange={(v) => onChange({ ...printer, watts: v })} suffix="W" step={5} />
        <NumField label="Precio de la máquina" value={printer.price} onChange={(v) => onChange({ ...printer, price: v })} suffix={currency} step={100} />
        <NumField label="Vida útil" value={printer.lifespanHours} onChange={(v) => onChange({ ...printer, lifespanHours: v })} suffix="h" step={100} />
      </div>
    </div>
  );
}

function MaterialCard({ material, currency, onChange, onRemove, canRemove }) {
  return (
    <div className="material-card">
      <TextField value={material.name} onChange={(v) => onChange({ ...material, name: v })} className="material-name" placeholder="Material" />
      <div className="field-input-wrap material-price">
        <input
          type="number"
          className="field-input"
          min={0}
          step={10}
          value={material.pricePerKg}
          onChange={(e) => onChange({ ...material, pricePerKg: e.target.value === "" ? "" : Number(e.target.value) })}
        />
        <span className="field-suffix">{currency}/kg</span>
      </div>
      {canRemove && (
        <button className="piece-remove" onClick={onRemove} aria-label="Quitar material">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

function ExtraItemRow({ item, currency, onChange, onRemove, canRemove }) {
  return (
    <div className="material-card">
      <TextField value={item.name} onChange={(v) => onChange({ ...item, name: v })} className="material-name" placeholder="Ej. pegamento, espuma, bolsa de embalaje" />
      <div className="field-input-wrap material-price">
        <input
          type="number"
          className="field-input"
          min={0}
          step={5}
          value={item.cost}
          onChange={(e) => onChange({ ...item, cost: e.target.value === "" ? "" : Number(e.target.value) })}
        />
        <span className="field-suffix">{currency}</span>
      </div>
      {canRemove && (
        <button className="piece-remove" onClick={onRemove} aria-label="Quitar extra">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

function ComponentCard({ component, index, printers, materials, currency, onChange, onRemove, canRemove }) {
  const printer = printers.find((p) => p.id === component.printerId) || printers[0];
  const material = materials.find((m) => m.id === component.materialId) || materials[0];
  return (
    <div className="piece-card">
      <div className="piece-card-head">
        <span className="piece-num">{index}</span>
        <input
          className="piece-name"
          value={component.name}
          placeholder={`Pieza ${index}`}
          onChange={(e) => onChange({ ...component, name: e.target.value })}
        />
        {canRemove && (
          <button className="piece-remove" onClick={onRemove} aria-label="Quitar pieza">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <span className="chip-row-label">Impresora</span>
      <div className="printer-chips">
        {printers.map((p) => (
          <button
            key={p.id}
            type="button"
            className={"printer-chip" + (p.id === component.printerId ? " active" : "")}
            onClick={() => onChange({ ...component, printerId: p.id })}
          >
            {p.name}
            <span className="watt-tag small"><Zap size={10} /> {p.watts} W</span>
          </button>
        ))}
      </div>

      <span className="chip-row-label">Material</span>
      <div className="printer-chips">
        {materials.map((m) => (
          <button
            key={m.id}
            type="button"
            className={"printer-chip" + (m.id === component.materialId ? " active" : "")}
            onClick={() => onChange({ ...component, materialId: m.id })}
          >
            {m.name}
          </button>
        ))}
      </div>

      <div className="piece-fields">
        <NumField label="Peso" value={component.weightGrams} onChange={(v) => onChange({ ...component, weightGrams: v })} suffix="g" step={1} />
        <TimeField label="Tiempo de impresión" totalHours={component.printHours} onChange={(v) => onChange({ ...component, printHours: v })} />
        <TimeField label="Post-proceso" totalHours={component.postProcessHours} onChange={(v) => onChange({ ...component, postProcessHours: v })} />
        <NumField label="Extras fijos" value={component.extraCosts} onChange={(v) => onChange({ ...component, extraCosts: v })} suffix={currency} step={5} />
      </div>
      <div className="piece-printer-note">{printer.name} · {material.name}</div>
    </div>
  );
}

function applyMargin(cost, rates) {
  if (rates.marginMode === "markup") {
    const profit = cost * (n(rates.marginPercent) / 100);
    return { profit, total: cost + profit };
  }
  const marginFrac = Math.min(Math.max(n(rates.marginPercent) / 100, 0), 0.95);
  const total = cost / (1 - marginFrac);
  return { profit: total - cost, total };
}

function computeComponent(component, rates) {
  const printer = rates.printers.find((p) => p.id === component.printerId) || rates.printers[0];
  const material = rates.materials.find((m) => m.id === component.materialId) || rates.materials[0];
  const weight = n(component.weightGrams);
  const printHours = n(component.printHours);
  const materialCost = (weight / 1000) * n(material.pricePerKg) * (1 + n(rates.wastePercent) / 100);
  const energyCost = (n(printer.watts) / 1000) * printHours * n(rates.electricityCostPerKwh);
  const depreciationCost = n(printer.lifespanHours) > 0 ? (n(printer.price) / n(printer.lifespanHours)) * printHours : 0;
  const maintenanceCost = n(rates.maintenancePerHour) * printHours;
  const laborCost = n(rates.laborRatePerHour) * n(component.postProcessHours);
  const extras = n(component.extraCosts);
  const subtotal = materialCost + energyCost + depreciationCost + maintenanceCost + laborCost + extras;
  const { profit, total } = applyMargin(subtotal, rates);

  return { printer, material, weight, printHours, materialCost, energyCost, depreciationCost, maintenanceCost, laborCost, extras, subtotal, profit, total };
}

function PrintableQuote({ businessName, orderName, results, orderExtrasSubtotal, orderExtrasClientPrice, total, currency }) {
  const today = new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
  return (
    <div className="print-quote" id="print-quote-root">
      <style>{`
        /* Renderizado fuera de la pantalla visible (no display:none) para que
           html2canvas pueda "fotografiarlo" y generar el PDF. Si además usas
           Ctrl+P / Imprimir del navegador, la regla @media print lo coloca
           en su posición normal y oculta el resto de la app. */
        .print-quote {
          position: fixed;
          top: 0;
          left: -10000px;
          width: 794px;
          background: #fff;
          color: #1A1A1A;
          font-family: 'IBM Plex Sans', sans-serif;
          padding: 10mm 4mm;
        }
        @media print {
          .app-ui { display: none !important; }
          .print-quote {
            position: static;
            left: 0;
            width: auto;
            max-width: 100%;
          }
          @page { margin: 14mm; }
        }
        .pq-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #1A1A1A; padding-bottom: 14px; margin-bottom: 18px; }
        .pq-business { font-family: 'Space Grotesk', sans-serif; font-size: 22px; font-weight: 700; }
        .pq-meta { text-align: right; font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: #555; }
        .pq-client { font-size: 14px; margin-bottom: 18px; color: #333; }
        .pq-client b { color: #1A1A1A; }
        .pq-table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
        .pq-table th { text-align: left; font-family: 'IBM Plex Sans', sans-serif; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.03em; color: #777; padding: 6px 8px; border-bottom: 1px solid #ccc; }
        .pq-table td { font-size: 13.5px; padding: 10px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
        .pq-table td:last-child, .pq-table th:last-child { text-align: right; font-family: 'IBM Plex Mono', monospace; white-space: nowrap; }
        .pq-item-name { font-family: 'Space Grotesk', sans-serif; font-weight: 600; }
        .pq-item-spec { font-size: 11.5px; color: #777; margin-top: 2px; }
        .pq-total-row { display: flex; justify-content: space-between; align-items: baseline; padding-top: 10px; border-top: 2px solid #1A1A1A; }
        .pq-total-label { font-family: 'Space Grotesk', sans-serif; font-size: 15px; }
        .pq-total-value { font-family: 'Space Grotesk', sans-serif; font-size: 26px; font-weight: 700; }
        .pq-footer { margin-top: 28px; font-size: 11.5px; color: #999; text-align: center; }
      `}</style>

      <div className="pq-header">
        <div className="pq-business">{businessName || "Cotización"}</div>
        <div className="pq-meta">Cotización<br />{today}</div>
      </div>

      {orderName && <div className="pq-client">Para: <b>{orderName}</b></div>}

      <table className="pq-table">
        <thead>
          <tr>
            <th>Pieza</th>
            <th>Precio</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.component.id}>
              <td>
                <div className="pq-item-name">{r.component.name || "Pieza"}</div>
                <div className="pq-item-spec">{r.calc.material.name} · {round2(r.calc.weight)} g · {fmtHM(r.calc.printHours)} de impresión</div>
              </td>
              <td>{fmtMoney(r.calc.total, currency)}</td>
            </tr>
          ))}
          {orderExtrasSubtotal > 0 && (
            <tr>
              <td>
                <div className="pq-item-name">Acabados y empaque</div>
              </td>
              <td>{fmtMoney(orderExtrasClientPrice, currency)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="pq-total-row">
        <span className="pq-total-label">Total</span>
        <span className="pq-total-value">{fmtMoney(total, currency)}</span>
      </div>

      <div className="pq-footer">Cotización generada el {today}.</div>
    </div>
  );
}

function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error

  const notConfigured = FEEDBACK_ENDPOINT.includes("TU-FORM-ID");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim() || notConfigured) return;
    setStatus("sending");
    try {
      const res = await fetch(FEEDBACK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name: name || "Anónimo", message, origen: "Cotizador 3D - beta" }),
      });
      if (res.ok) {
        setStatus("sent");
        setMessage("");
        setName("");
        setTimeout(() => {
          setStatus("idle");
          setOpen(false);
        }, 1800);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <>
      <button className="feedback-fab" onClick={() => setOpen(true)} aria-label="Enviar sugerencia">
        <MessageSquarePlus size={18} />
      </button>

      {open && (
        <div className="feedback-overlay" onClick={() => setOpen(false)}>
          <div className="feedback-modal" onClick={(e) => e.stopPropagation()}>
            <div className="feedback-modal-head">
              <span>Sugerencias — versión beta</span>
              <button className="feedback-close" onClick={() => setOpen(false)} aria-label="Cerrar">×</button>
            </div>

            {notConfigured && (
              <p className="feedback-hint">
                Este formulario todavía no está conectado. Configura FEEDBACK_ENDPOINT en el código con tu URL de Formspree.
              </p>
            )}

            {status === "sent" ? (
              <p className="feedback-sent">¡Gracias! Tu sugerencia fue enviada.</p>
            ) : (
              <form onSubmit={handleSubmit}>
                <input
                  className="feedback-input"
                  type="text"
                  placeholder="Tu nombre (opcional)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <textarea
                  className="feedback-textarea"
                  placeholder="¿Qué mejorarías, qué falló, qué te gustaría que tuviera?"
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                {status === "error" && <p className="feedback-error">No se pudo enviar. Intenta de nuevo.</p>}
                <button className="feedback-submit" type="submit" disabled={status === "sending" || notConfigured || !message.trim()}>
                  {status === "sending" ? "Enviando…" : "Enviar sugerencia"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <style>{`
        .feedback-fab {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 40;
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: #FF7A3D;
          color: #1A1206;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(0,0,0,0.35);
        }
        .feedback-fab:hover { background: #ff8a54; }
        @media print { .feedback-fab { display: none !important; } }

        .feedback-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50;
          padding: 16px;
        }
        @media print { .feedback-overlay { display: none !important; } }
        .feedback-modal {
          background: #1D2023;
          border: 1px solid #33373C;
          border-radius: 14px;
          padding: 20px;
          width: 100%;
          max-width: 380px;
          color: #EDEAE2;
          font-family: 'IBM Plex Sans', sans-serif;
        }
        .feedback-modal-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 600;
          font-size: 15px;
          margin-bottom: 12px;
        }
        .feedback-close { background: transparent; border: none; color: #93968F; font-size: 20px; line-height: 1; cursor: pointer; }
        .feedback-close:hover { color: #EDEAE2; }
        .feedback-hint { font-size: 12px; color: #93968F; margin-bottom: 10px; line-height: 1.5; }
        .feedback-input, .feedback-textarea {
          width: 100%;
          background: #23262A;
          border: 1px solid #33373C;
          border-radius: 8px;
          color: #EDEAE2;
          font-family: 'IBM Plex Sans', sans-serif;
          font-size: 13.5px;
          padding: 9px 10px;
          margin-bottom: 10px;
          resize: vertical;
        }
        .feedback-input:focus, .feedback-textarea:focus { outline: none; border-color: #7A4025; }
        .feedback-submit {
          width: 100%;
          background: #FF7A3D;
          color: #1A1206;
          border: none;
          font-family: 'IBM Plex Sans', sans-serif;
          font-size: 13.5px;
          font-weight: 500;
          padding: 10px;
          border-radius: 9px;
          cursor: pointer;
        }
        .feedback-submit:hover { background: #ff8a54; }
        .feedback-submit:disabled { opacity: 0.5; cursor: default; }
        .feedback-error { color: #e5484d; font-size: 12px; margin: -4px 0 10px; }
        .feedback-sent { font-size: 14px; color: #4FD1B8; text-align: center; padding: 20px 0; }
      `}</style>
    </>
  );
}

export default function CotizadorImpresion3D() {
  const [rates, setRates] = useState(DEFAULT_RATES);
  const [order, setOrder] = useState(DEFAULT_ORDER);
  const [openSection, setOpenSection] = useState(4);
  const [history, setHistory] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const savedRates = await storage.get("tarifas-default", false);
        if (savedRates && savedRates.value) {
          const parsed = JSON.parse(savedRates.value);
          setRates({
            ...DEFAULT_RATES,
            ...parsed,
            printers: Array.isArray(parsed.printers) && parsed.printers.length ? parsed.printers : DEFAULT_PRINTERS,
            materials: Array.isArray(parsed.materials) && parsed.materials.length ? parsed.materials : DEFAULT_MATERIALS,
            marginMode: parsed.marginMode === "markup" ? "markup" : "margin",
          });
        }
      } catch (e) {
        /* no rates saved yet */
      }
      try {
        const savedHistory = await storage.get("historial-cotizaciones", false);
        if (savedHistory && savedHistory.value) {
          const parsedHistory = JSON.parse(savedHistory.value);
          setHistory(Array.isArray(parsedHistory) ? parsedHistory.filter((h) => h.order && Array.isArray(h.order.components)) : []);
        }
      } catch (e) {
        /* no history yet */
      }
      setLoaded(true);
    })();
  }, []);

  const persistRates = useCallback(async (next) => {
    try {
      const res = await storage.set("tarifas-default", JSON.stringify(next), false);
      if (!res) setStorageOk(false);
    } catch {
      setStorageOk(false);
    }
  }, []);

  const updateRate = (key, value) => {
    const next = { ...rates, [key]: value };
    setRates(next);
    persistRates(next);
  };

  const updatePrinter = (printerId, updatedPrinter) => {
    const next = { ...rates, printers: rates.printers.map((p) => (p.id === printerId ? updatedPrinter : p)) };
    setRates(next);
    persistRates(next);
  };

  const addPrinter = () => {
    const next = {
      ...rates,
      printers: [...rates.printers, { id: newId("p"), name: "Nueva impresora", watts: 150, price: 10000, lifespanHours: 5000 }],
    };
    setRates(next);
    persistRates(next);
  };

  const removePrinter = (printerId) => {
    const next = { ...rates, printers: rates.printers.filter((p) => p.id !== printerId) };
    setRates(next);
    persistRates(next);
    // Si alguna pieza usaba esta impresora, reasignar a la primera disponible
    const fallbackId = next.printers[0]?.id;
    if (fallbackId) {
      setOrder((o) => ({
        ...o,
        components: o.components.map((c) => (c.printerId === printerId ? { ...c, printerId: fallbackId } : c)),
      }));
    }
  };

  const updateMaterial = (materialId, updatedMaterial) => {
    const next = { ...rates, materials: rates.materials.map((m) => (m.id === materialId ? updatedMaterial : m)) };
    setRates(next);
    persistRates(next);
  };

  const addMaterial = () => {
    const next = { ...rates, materials: [...rates.materials, { id: newId("m"), name: "Nuevo material", pricePerKg: 500 }] };
    setRates(next);
    persistRates(next);
  };

  const removeMaterial = (materialId) => {
    const next = { ...rates, materials: rates.materials.filter((m) => m.id !== materialId) };
    setRates(next);
    persistRates(next);
  };

  const updateOrderName = (value) => setOrder((o) => ({ ...o, orderName: value }));

  const addOrderExtra = () =>
    setOrder((o) => ({ ...o, extras: [...(o.extras || []), { id: newId("e"), name: "", cost: 0 }] }));

  const updateOrderExtra = (id, updated) =>
    setOrder((o) => ({ ...o, extras: (o.extras || []).map((ex) => (ex.id === id ? updated : ex)) }));

  const removeOrderExtra = (id) =>
    setOrder((o) => ({ ...o, extras: (o.extras || []).filter((ex) => ex.id !== id) }));

  const updateComponent = (id, updated) =>
    setOrder((o) => ({ ...o, components: o.components.map((c) => (c.id === id ? updated : c)) }));

  const addComponent = () =>
    setOrder((o) => ({
      ...o,
      components: [...o.components, makeDefaultComponent(rates.printers[0].id, rates.materials[0].id, o.components.length + 1)],
    }));

  const removeComponent = (id) =>
    setOrder((o) => ({ ...o, components: o.components.filter((c) => c.id !== id) }));

  const results = order.components.map((c) => ({ component: c, calc: computeComponent(c, rates) }));

  const componentTotals = results.reduce(
    (acc, r) => ({
      weight: acc.weight + r.calc.weight,
      printHours: acc.printHours + r.calc.printHours,
      materialCost: acc.materialCost + r.calc.materialCost,
      energyCost: acc.energyCost + r.calc.energyCost,
      depreciationCost: acc.depreciationCost + r.calc.depreciationCost,
      maintenanceCost: acc.maintenanceCost + r.calc.maintenanceCost,
      laborCost: acc.laborCost + r.calc.laborCost,
      extras: acc.extras + r.calc.extras,
      subtotal: acc.subtotal + r.calc.subtotal,
    }),
    { weight: 0, printHours: 0, materialCost: 0, energyCost: 0, depreciationCost: 0, maintenanceCost: 0, laborCost: 0, extras: 0, subtotal: 0 }
  );

  const orderExtras = order.extras || [];
  const orderExtrasSubtotal = orderExtras.reduce((s, e) => s + n(e.cost), 0);
  const grandSubtotal = componentTotals.subtotal + orderExtrasSubtotal;
  const { profit: grandProfit, total: grandTotal } = applyMargin(grandSubtotal, rates);
  const { total: orderExtrasClientPrice } = applyMargin(orderExtrasSubtotal, rates);

  const totals = { ...componentTotals, subtotal: grandSubtotal, profit: grandProfit, total: grandTotal };

  const pricePerGram = totals.weight > 0 ? totals.total / totals.weight : 0;
  const pricePerHour = totals.printHours > 0 ? totals.total / totals.printHours : 0;
  const effectiveMarginOnSale = totals.total > 0 ? (totals.profit / totals.total) * 100 : 0;

  const buildSummaryText = () => {
    const name = order.orderName ? order.orderName : "Pedido de impresion 3D";
    const lines = [`Cotizacion: ${name}`, ""];
    results.forEach((r) => {
      lines.push(`${r.component.name} (${r.calc.printer.name}, ${r.calc.material.name}) - ${fmtMoney(r.calc.total, rates.currency)}`);
    });
    lines.push("");
    lines.push(`Material: ${fmtMoney(totals.materialCost, rates.currency)}`);
    lines.push(`Electricidad: ${fmtMoney(totals.energyCost, rates.currency)}`);
    lines.push(`Uso de maquina: ${fmtMoney(totals.depreciationCost, rates.currency)}`);
    lines.push(`Mantenimiento: ${fmtMoney(totals.maintenanceCost, rates.currency)}`);
    lines.push(`Mano de obra: ${fmtMoney(totals.laborCost, rates.currency)}`);
    lines.push(`Extras por pieza: ${fmtMoney(totals.extras, rates.currency)}`);
    if (orderExtras.length) {
      lines.push("");
      lines.push("Post-proceso y acabados:");
      orderExtras.forEach((e) => lines.push(`  ${e.name || "Sin nombre"}: ${fmtMoney(n(e.cost), rates.currency)}`));
    }
    lines.push("");
    lines.push(`Subtotal: ${fmtMoney(totals.subtotal, rates.currency)}`);
    lines.push(`Ganancia: ${fmtMoney(totals.profit, rates.currency)}`);
    lines.push(`Precio total: ${fmtMoney(totals.total, rates.currency)}`);
    return lines.join("\n");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildSummaryText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  const handlePrint = () => {
    try {
      const safeName = (order.orderName || "cotizacion").trim().replace(/\s+/g, "-");
      document.title = `Cotizacion-${safeName}`;
    } catch {
      /* no-op */
    }
    window.print();
  };

  const handleDownloadPdf = async () => {
    const node = document.getElementById("print-quote-root");
    if (!node || pdfBusy) return;
    setPdfBusy(true);
    try {
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const safeName = (order.orderName || "cotizacion").trim().replace(/\s+/g, "-") || "cotizacion";
      pdf.save(`Cotizacion-${safeName}.pdf`);
    } catch (e) {
      console.error("No se pudo generar el PDF", e);
    } finally {
      setPdfBusy(false);
    }
  };

  const handleSaveQuote = async () => {
    const entry = {
      id: `q_${Date.now()}`,
      name: order.orderName || "Sin nombre",
      timestamp: Date.now(),
      currency: rates.currency,
      total: round2(totals.total),
      order,
    };
    const next = [entry, ...history].slice(0, 40);
    setHistory(next);
    try {
      const res = await storage.set("historial-cotizaciones", JSON.stringify(next), false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
      if (!res) setStorageOk(false);
    } catch {
      setStorageOk(false);
    }
  };

  const handleDeleteEntry = async (id) => {
    const next = history.filter((h) => h.id !== id);
    setHistory(next);
    try {
      await storage.set("historial-cotizaciones", JSON.stringify(next), false);
    } catch {
      setStorageOk(false);
    }
  };

  const handleLoadEntry = (entry) => {
    setOrder(entry.order);
    setRates((r) => ({ ...r, currency: entry.currency }));
  };

  const handleResetOrder = () =>
    setOrder({ orderName: "", components: [makeDefaultComponent(rates.printers[0].id, rates.materials[0].id, 1)], extras: [] });

  return (
    <>
    <div className="wrap app-ui">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

        .wrap {
          --bg: #15171A;
          --panel: #1D2023;
          --panel-alt: #23262A;
          --panel-alt-2: #292D31;
          --line: #33373C;
          --line-soft: #292C30;
          --ink: #EDEAE2;
          --ink-dim: #93968F;
          --accent: #FF7A3D;
          --accent-dim: #7A4025;
          --teal: #4FD1B8;
          --teal-dim: #245349;
          font-family: 'IBM Plex Sans', sans-serif;
          background: var(--bg);
          color: var(--ink);
          padding: 28px 20px 60px;
          border-radius: 16px;
          max-width: 980px;
          margin: 0 auto;
        }
        .wrap * { box-sizing: border-box; }
        .header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }
        .header h1 {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 26px;
          font-weight: 700;
          margin: 0 0 4px;
          letter-spacing: -0.01em;
        }
        .header p { margin: 0; color: var(--ink-dim); font-size: 13.5px; }
        .brand-mark {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--accent);
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          letter-spacing: 0.02em;
        }
        .currency-toggle {
          display: flex;
          border: 1px solid var(--line);
          border-radius: 8px;
          overflow: hidden;
        }
        .currency-toggle button {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12.5px;
          padding: 6px 12px;
          background: transparent;
          color: var(--ink-dim);
          border: none;
          cursor: pointer;
        }
        .currency-toggle button.active { background: var(--panel-alt); color: var(--ink); }

        .grid {
          display: grid;
          grid-template-columns: 1.35fr 1fr;
          gap: 20px;
          align-items: start;
        }
        .grid > div { min-width: 0; }
        @media (max-width: 760px) {
          .grid { grid-template-columns: 1fr; }
        }

        .job-name {
          width: 100%;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 12px 14px;
          color: var(--ink);
          font-family: 'Space Grotesk', sans-serif;
          font-size: 15px;
          margin-bottom: 16px;
        }
        .job-name::placeholder { color: var(--ink-dim); font-family: 'IBM Plex Sans', sans-serif; }
        .job-name:focus { outline: none; border-color: var(--accent-dim); }

        .section {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 12px;
          margin-bottom: 12px;
          overflow: hidden;
        }
        .section-head {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: transparent;
          border: none;
          color: var(--ink);
          cursor: pointer;
          text-align: left;
        }
        .section-num {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          color: var(--accent);
          background: var(--accent-dim);
          border-radius: 5px;
          padding: 3px 6px;
        }
        .section-titles { flex: 1; display: flex; flex-direction: column; gap: 2px; }
        .section-title { font-family: 'Space Grotesk', sans-serif; font-size: 15px; font-weight: 600; }
        .section-subtitle { font-size: 12px; color: var(--ink-dim); }
        .section-head svg { color: var(--ink-dim); flex-shrink: 0; }

        .section-body {
          padding: 4px 16px 18px;
          border-top: 1px solid var(--line-soft);
          padding-top: 16px;
        }
        .section-body.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; }
        @media (max-width: 480px) {
          .section-body.grid2 { grid-template-columns: 1fr; }
        }

        .field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .field-label { font-size: 12.5px; color: var(--ink-dim); }
        .field-input-wrap {
          display: flex;
          align-items: center;
          background: var(--panel-alt);
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 0 10px;
        }
        .field-input-wrap:focus-within { border-color: var(--accent-dim); }
        .field-input {
          flex: 1;
          background: transparent;
          border: none;
          color: var(--ink);
          font-family: 'IBM Plex Mono', monospace;
          font-size: 14.5px;
          padding: 9px 0;
          min-width: 0;
        }
        .field-input-text { font-family: 'IBM Plex Sans', sans-serif; }
        .field-input:focus { outline: none; }
        .field-input::-webkit-outer-spin-button,
        .field-input::-webkit-inner-spin-button { opacity: 0.4; }
        .field-suffix { font-size: 12px; color: var(--ink-dim); white-space: nowrap; margin-left: 6px; }
        .field-hint { font-size: 11px; color: var(--ink-dim); opacity: 0.75; }

        .time-field-row { display: flex; gap: 8px; }
        .time-field-row .field-input-wrap { flex: 1; min-width: 0; }

        .watt-tag {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11.5px;
          color: var(--teal);
          background: var(--teal-dim);
          border-radius: 6px;
          padding: 3px 7px;
          white-space: nowrap;
        }
        .watt-tag.small { font-size: 10.5px; padding: 2px 6px; }

        .printer-card {
          background: var(--panel-alt);
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 12px 14px;
          margin-bottom: 10px;
        }
        .printer-card:last-child { margin-bottom: 0; }
        .printer-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .printer-name-input {
          flex: 1;
          background: transparent;
          border: none;
          color: var(--ink);
          font-family: 'Space Grotesk', sans-serif;
          font-size: 14px;
          font-weight: 600;
          min-width: 0;
          padding: 2px 0;
        }
        .printer-name-input:focus { outline: none; }
        .printer-card-fields { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        @media (max-width: 560px) {
          .printer-card-fields { grid-template-columns: 1fr; }
        }

        .material-card {
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--panel-alt);
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 8px 10px;
          margin-bottom: 8px;
        }
        .material-card:last-child { margin-bottom: 0; }
        .material-name {
          flex: 1;
          background: transparent;
          border: none;
          color: var(--ink);
          font-family: 'Space Grotesk', sans-serif;
          font-size: 14px;
          font-weight: 600;
          min-width: 0;
        }
        .material-name:focus { outline: none; }
        .material-price { width: 150px; flex-shrink: 0; }
        .add-row-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: transparent;
          border: 1px dashed var(--line);
          color: var(--ink-dim);
          font-family: 'IBM Plex Sans', sans-serif;
          font-size: 13px;
          padding: 10px;
          border-radius: 10px;
          cursor: pointer;
          margin-top: 2px;
        }
        .add-row-btn:hover { color: var(--ink); border-color: var(--accent-dim); }
        .empty-hint { font-size: 12.5px; color: var(--ink-dim); line-height: 1.5; margin: 0 0 12px; }

        .piece-card {
          background: var(--panel-alt);
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 14px;
          margin-bottom: 12px;
        }
        .piece-card:last-child { margin-bottom: 0; }
        .piece-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .piece-num {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          color: var(--ink-dim);
          background: var(--panel-alt-2);
          border-radius: 50%;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .piece-name {
          flex: 1;
          background: transparent;
          border: none;
          border-bottom: 1px solid transparent;
          color: var(--ink);
          font-family: 'Space Grotesk', sans-serif;
          font-size: 14.5px;
          font-weight: 600;
          padding: 2px 0;
          min-width: 0;
        }
        .piece-name:focus { outline: none; border-bottom-color: var(--accent-dim); }
        .piece-name::placeholder { color: var(--ink-dim); font-weight: 500; }
        .piece-remove { background: transparent; border: none; color: var(--ink-dim); cursor: pointer; padding: 4px; flex-shrink: 0; }
        .piece-remove:hover { color: #e5484d; }

        .chip-row-label { font-size: 11px; color: var(--ink-dim); display: block; margin-bottom: 6px; }
        .printer-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
        .printer-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--panel);
          border: 1px solid var(--line);
          color: var(--ink-dim);
          font-family: 'IBM Plex Sans', sans-serif;
          font-size: 12.5px;
          padding: 6px 10px;
          border-radius: 20px;
          cursor: pointer;
        }
        .printer-chip.active { border-color: var(--accent); color: var(--ink); background: var(--accent-dim); }
        .printer-chip.active .watt-tag { background: rgba(0,0,0,0.2); }

        .piece-fields { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 16px; }
        @media (max-width: 380px) {
          .piece-fields { grid-template-columns: 1fr; }
        }
        .piece-printer-note { font-size: 11px; color: var(--ink-dim); margin-top: 8px; opacity: 0.8; }

        .add-piece-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: transparent;
          border: 1px dashed var(--line);
          color: var(--ink-dim);
          font-family: 'IBM Plex Sans', sans-serif;
          font-size: 13px;
          padding: 11px;
          border-radius: 10px;
          cursor: pointer;
          margin-top: 4px;
        }
        .add-piece-btn:hover { color: var(--ink); border-color: var(--accent-dim); }

        .actions-row { display: flex; gap: 8px; margin-top: 4px; }
        .btn-ghost {
          display: flex; align-items: center; gap: 6px;
          background: transparent;
          border: 1px solid var(--line);
          color: var(--ink-dim);
          font-family: 'IBM Plex Sans', sans-serif;
          font-size: 12.5px;
          padding: 8px 12px;
          border-radius: 8px;
          cursor: pointer;
        }
        .btn-ghost:hover { color: var(--ink); border-color: var(--ink-dim); }

        .margin-mode-row {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          background: var(--panel-alt);
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 10px 12px;
        }
        .margin-mode-toggle { display: flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; flex-shrink: 0; }
        .margin-mode-toggle button {
          font-family: 'IBM Plex Sans', sans-serif;
          font-size: 12px;
          padding: 7px 10px;
          background: transparent;
          color: var(--ink-dim);
          border: none;
          cursor: pointer;
        }
        .margin-mode-toggle button.active { background: var(--accent-dim); color: var(--ink); }
        .margin-mode-hint { font-size: 11px; color: var(--ink-dim); line-height: 1.5; }

        .ticket {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 20px;
          position: sticky;
          top: 12px;
          min-width: 0;
        }
        .ticket-head {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11.5px;
          color: var(--ink-dim);
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 12px;
          border-bottom: 1px dashed var(--line);
          margin-bottom: 12px;
          gap: 8px;
          flex-wrap: wrap;
        }
        .business-name-input {
          background: transparent;
          border: none;
          color: var(--ink);
          font-family: 'Space Grotesk', sans-serif;
          font-size: 14px;
          font-weight: 600;
          padding: 2px 0;
          min-width: 0;
          flex: 1;
        }
        .business-name-input::placeholder { color: var(--ink-dim); font-weight: 500; font-family: 'IBM Plex Sans', sans-serif; }
        .business-name-input:focus { outline: none; }

        .ticket-pieces { margin-bottom: 8px; }
        .ticket-piece-row { display: flex; justify-content: space-between; align-items: baseline; padding: 5px 0; gap: 8px; }
        .ticket-piece-row > span:first-child { min-width: 0; flex: 1; }
        .ticket-piece-name { font-family: 'Space Grotesk', sans-serif; font-size: 13px; font-weight: 600; }
        .ticket-piece-sub { font-size: 11px; color: var(--ink-dim); display: block; margin-top: 1px; }
        .ticket-piece-value { font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: var(--teal); white-space: nowrap; flex-shrink: 0; }

        .line-row { display: flex; justify-content: space-between; font-family: 'IBM Plex Mono', monospace; font-size: 13px; padding: 5px 0; gap: 8px; }
        .line-row.dim { color: var(--ink-dim); }
        .line-row.strong { color: var(--ink); }
        .line-label { padding-right: 8px; min-width: 0; flex: 1; }
        .line-value { white-space: nowrap; flex-shrink: 0; }

        .ticket-divider { border-top: 1px dashed var(--line); margin: 10px 0; }

        .ticket-total { display: flex; justify-content: space-between; align-items: baseline; padding-top: 6px; gap: 10px; flex-wrap: wrap; }
        .ticket-total-label { font-family: 'Space Grotesk', sans-serif; font-size: 14px; color: var(--ink-dim); }
        .ticket-total-value { font-family: 'Space Grotesk', sans-serif; font-size: 28px; font-weight: 700; color: var(--accent); white-space: nowrap; }

        .ticket-sub { display: flex; gap: 16px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line-soft); }
        .ticket-sub-item { flex: 1; }
        .ticket-sub-label { font-size: 11px; color: var(--ink-dim); }
        .ticket-sub-value { font-family: 'IBM Plex Mono', monospace; font-size: 13.5px; color: var(--teal); margin-top: 2px; }

        .ticket-actions { display: flex; gap: 8px; margin-top: 16px; }
        .btn-primary, .btn-secondary {
          flex: 1;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          font-family: 'IBM Plex Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          padding: 10px 12px;
          border-radius: 9px;
          cursor: pointer;
          border: 1px solid transparent;
        }
        .btn-primary { background: var(--accent); color: #1A1206; }
        .btn-primary:hover { background: #ff8a54; }
        .btn-secondary { background: transparent; border-color: var(--line); color: var(--ink); }
        .btn-secondary:hover { border-color: var(--ink-dim); }

        .btn-pdf {
          width: 100%;
          display: flex; align-items: center; justify-content: center; gap: 7px;
          background: transparent;
          border: 1px dashed var(--teal-dim);
          color: var(--teal);
          font-family: 'IBM Plex Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          padding: 10px 12px;
          border-radius: 9px;
          cursor: pointer;
          margin-top: 10px;
        }
        .btn-pdf:hover { border-color: var(--teal); background: rgba(79, 209, 184, 0.08); }
        .btn-pdf:disabled { opacity: 0.6; cursor: default; }
        .spin { animation: pq-spin 0.8s linear infinite; }
        @keyframes pq-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .storage-note { font-size: 11px; color: var(--ink-dim); margin-top: 10px; text-align: center; }

        .history { margin-top: 20px; }
        .history-title { font-family: 'Space Grotesk', sans-serif; font-size: 15px; font-weight: 600; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
        .history-empty { font-size: 13px; color: var(--ink-dim); padding: 14px 0; }
        .history-item { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--line-soft); }
        .history-item:last-child { border-bottom: none; }
        .history-main { flex: 1; min-width: 0; cursor: pointer; }
        .history-name { font-size: 13.5px; font-family: 'Space Grotesk', sans-serif; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .history-meta { font-size: 11.5px; color: var(--ink-dim); }
        .history-total { font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: var(--teal); white-space: nowrap; }
        .history-del { background: transparent; border: none; color: var(--ink-dim); cursor: pointer; padding: 4px; }
        .history-del:hover { color: #e5484d; }
      `}</style>

      <div className="header">
        <div>
          <span className="brand-mark"><Layers size={14} /> COTIZADOR · IMPRESIÓN 3D</span>
          <h1>Calculadora de precios</h1>
          <p>Material, máquina, tiempo y margen — en un ticket listo para tu cliente.</p>
        </div>
        <div className="currency-toggle">
          <button className={rates.currency === "MXN" ? "active" : ""} onClick={() => updateRate("currency", "MXN")}>MXN</button>
          <button className={rates.currency === "USD" ? "active" : ""} onClick={() => updateRate("currency", "USD")}>USD</button>
        </div>
      </div>

      <div className="grid">
        <div>
          <input
            className="job-name"
            placeholder="Nombre del pedido o cliente (opcional)"
            value={order.orderName}
            onChange={(e) => updateOrderName(e.target.value)}
          />

          <Section
            index={1}
            title="Impresoras"
            subtitle="Consumo eléctrico y depreciación de cada máquina"
            open={openSection === 1}
            onToggle={() => setOpenSection(openSection === 1 ? 0 : 1)}
          >
            {rates.printers.map((p) => (
              <PrinterCard
                key={p.id}
                printer={p}
                currency={rates.currency}
                onChange={(updated) => updatePrinter(p.id, updated)}
                onRemove={() => removePrinter(p.id)}
                canRemove={rates.printers.length > 1}
              />
            ))}
            <button type="button" className="add-row-btn" onClick={addPrinter}>
              <Plus size={14} /> Agregar impresora
            </button>
          </Section>

          <Section
            index={2}
            title="Material"
            subtitle="Tipos de filamento y su precio por kg"
            open={openSection === 2}
            onToggle={() => setOpenSection(openSection === 2 ? 0 : 2)}
          >
            <NumField
              label="Desperdicio / fallas"
              value={rates.wastePercent}
              onChange={(v) => updateRate("wastePercent", v)}
              suffix="%"
              step={1}
              hint="Aplica a todos los materiales — soportes, purgas y piezas fallidas"
            />
            <div style={{ marginTop: 14 }}>
              {rates.materials.map((m) => (
                <MaterialCard
                  key={m.id}
                  material={m}
                  currency={rates.currency}
                  onChange={(updated) => updateMaterial(m.id, updated)}
                  onRemove={() => removeMaterial(m.id)}
                  canRemove={rates.materials.length > 1}
                />
              ))}
              <button type="button" className="add-row-btn" onClick={addMaterial}>
                <Plus size={14} /> Agregar material
              </button>
            </div>
          </Section>

          <Section
            index={3}
            title="Tarifas generales"
            subtitle="Electricidad, mantenimiento, mano de obra y margen"
            open={openSection === 3}
            onToggle={() => setOpenSection(openSection === 3 ? 0 : 3)}
            bodyClassName="grid2"
          >
            <NumField label="Costo de electricidad" value={rates.electricityCostPerKwh} onChange={(v) => updateRate("electricityCostPerKwh", v)} suffix={`${rates.currency}/kWh`} step={0.1} />
            <NumField label="Mantenimiento" value={rates.maintenancePerHour} onChange={(v) => updateRate("maintenancePerHour", v)} suffix={`${rates.currency}/h`} step={0.5} hint="Boquillas, correas, lubricante" />
            <NumField label="Mano de obra" value={rates.laborRatePerHour} onChange={(v) => updateRate("laborRatePerHour", v)} suffix={`${rates.currency}/h`} step={10} />
            <NumField label="Margen de ganancia" value={rates.marginPercent} onChange={(v) => updateRate("marginPercent", v)} suffix="%" step={5} />
            <div className="margin-mode-row">
              <span className="margin-mode-hint">
                {rates.marginMode === "margin"
                  ? "Margen sobre precio de venta: precio = costo ÷ (1 − %). El % es la ganancia exacta sobre lo que paga el cliente."
                  : "Markup sobre costo: precio = costo × (1 + %). El % es la ganancia sobre tu costo, no sobre el precio final."}
              </span>
              <div className="margin-mode-toggle">
                <button className={rates.marginMode === "margin" ? "active" : ""} onClick={() => updateRate("marginMode", "margin")}>Sobre venta</button>
                <button className={rates.marginMode === "markup" ? "active" : ""} onClick={() => updateRate("marginMode", "markup")}>Sobre costo</button>
              </div>
            </div>
          </Section>

          <Section
            index={4}
            title="Piezas del pedido"
            subtitle={`${order.components.length} ${order.components.length === 1 ? "componente" : "componentes"} a imprimir por separado`}
            open={openSection === 4}
            onToggle={() => setOpenSection(openSection === 4 ? 0 : 4)}
          >
            {order.components.map((c, i) => (
              <ComponentCard
                key={c.id}
                component={c}
                index={i + 1}
                printers={rates.printers}
                materials={rates.materials}
                currency={rates.currency}
                onChange={(updated) => updateComponent(c.id, updated)}
                onRemove={() => removeComponent(c.id)}
                canRemove={order.components.length > 1}
              />
            ))}
            <button type="button" className="add-piece-btn" onClick={addComponent}>
              <Plus size={14} /> Agregar pieza
            </button>
          </Section>

          <Section
            index={5}
            title="Post-proceso y acabados"
            subtitle="Costos generales del pedido: pegamento, espuma, empaque, accesorios..."
            open={openSection === 5}
            onToggle={() => setOpenSection(openSection === 5 ? 0 : 5)}
          >
            {orderExtras.length === 0 && (
              <p className="empty-hint">
                Para pedidos con varias piezas pequeñas (llaveros) o acabados de una pieza grande (pegamento, espuma de poliuretano, bolsa de embalaje), agrega aquí cada costo por separado.
              </p>
            )}
            {orderExtras.map((ex) => (
              <ExtraItemRow
                key={ex.id}
                item={ex}
                currency={rates.currency}
                onChange={(updated) => updateOrderExtra(ex.id, updated)}
                onRemove={() => removeOrderExtra(ex.id)}
                canRemove
              />
            ))}
            <button type="button" className="add-row-btn" onClick={addOrderExtra}>
              <Plus size={14} /> Agregar extra
            </button>
          </Section>

          <div className="actions-row">
            <button className="btn-ghost" onClick={handleResetOrder}><RotateCcw size={13} /> Nuevo pedido</button>
          </div>
        </div>

        <div>
          <div className="ticket">
            <div className="ticket-head">
              <input
                className="business-name-input"
                value={rates.businessName}
                placeholder="Nombre de tu negocio"
                onChange={(e) => updateRate("businessName", e.target.value)}
              />
              <span>{round2(totals.weight)} g · {fmtHM(totals.printHours)}</span>
            </div>

            <div className="ticket-pieces">
              {results.map((r) => (
                <div className="ticket-piece-row" key={r.component.id}>
                  <span>
                    <span className="ticket-piece-name">{r.component.name || "Pieza"}</span>
                    <span className="ticket-piece-sub">{r.calc.printer.name} · {r.calc.material.name} · {round2(r.calc.weight)} g · {fmtHM(r.calc.printHours)}</span>
                  </span>
                  <span className="ticket-piece-value">{fmtMoney(r.calc.total, rates.currency)}</span>
                </div>
              ))}
            </div>

            <div className="ticket-divider" />

            <LineRow label="Material" value={totals.materialCost} currency={rates.currency} />
            <LineRow label="Electricidad" value={totals.energyCost} currency={rates.currency} />
            <LineRow label="Uso de máquina" value={totals.depreciationCost} currency={rates.currency} />
            <LineRow label="Mantenimiento" value={totals.maintenanceCost} currency={rates.currency} dim />
            <LineRow label="Mano de obra" value={totals.laborCost} currency={rates.currency} />
            <LineRow label="Extras por pieza" value={totals.extras} currency={rates.currency} dim />
            {orderExtrasSubtotal > 0 && <LineRow label="Post-proceso y acabados" value={orderExtrasSubtotal} currency={rates.currency} />}

            <div className="ticket-divider" />
            <LineRow label="Subtotal (costo)" value={totals.subtotal} currency={rates.currency} />
            <LineRow label={`Ganancia (${round2(effectiveMarginOnSale)}% del precio)`} value={totals.profit} currency={rates.currency} />
            <div className="ticket-divider" />

            <div className="ticket-total">
              <span className="ticket-total-label">Precio final</span>
              <span className="ticket-total-value">{fmtMoney(totals.total, rates.currency)}</span>
            </div>

            <div className="ticket-sub">
              <div className="ticket-sub-item">
                <div className="ticket-sub-label">Por gramo</div>
                <div className="ticket-sub-value">{fmtMoney(pricePerGram, rates.currency)}</div>
              </div>
              <div className="ticket-sub-item">
                <div className="ticket-sub-label">Por hora</div>
                <div className="ticket-sub-value">{fmtMoney(pricePerHour, rates.currency)}</div>
              </div>
            </div>

            <div className="ticket-actions">
              <button className="btn-secondary" onClick={handleCopy}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copiado" : "Copiar"}
              </button>
              <button className="btn-primary" onClick={handleSaveQuote}>
                {savedFlash ? <Check size={14} /> : <Save size={14} />} {savedFlash ? "Guardado" : "Guardar"}
              </button>
            </div>
            <button className="btn-pdf" onClick={handleDownloadPdf} disabled={pdfBusy}>
              {pdfBusy ? <Loader2 size={14} className="spin" /> : <Printer size={14} />} {pdfBusy ? "Generando PDF…" : "Descargar PDF para el cliente"}
            </button>
            {!storageOk && <div className="storage-note">No se pudo guardar en este momento. Tus datos siguen visibles en pantalla.</div>}
          </div>

          <div className="history">
            <div className="history-title">Historial de cotizaciones</div>
            {history.length === 0 && loaded && <div className="history-empty">Tus cotizaciones guardadas aparecerán aquí, sincronizadas con tu cuenta.</div>}
            {history.map((h) => (
              <div className="history-item" key={h.id}>
                <div className="history-main" onClick={() => handleLoadEntry(h)}>
                  <div className="history-name">{h.name}</div>
                  <div className="history-meta">
                    {new Date(h.timestamp).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })} · {h.order.components.length} {h.order.components.length === 1 ? "pieza" : "piezas"}
                  </div>
                </div>
                <div className="history-total">{fmtMoney(h.total, h.currency)}</div>
                <button className="history-del" onClick={() => handleDeleteEntry(h.id)} aria-label="Eliminar"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    <PrintableQuote
      businessName={rates.businessName}
      orderName={order.orderName}
      results={results}
      orderExtrasSubtotal={orderExtrasSubtotal}
      orderExtrasClientPrice={orderExtrasClientPrice}
      total={totals.total}
      currency={rates.currency}
    />
    <FeedbackWidget />
    </>
  );
}
