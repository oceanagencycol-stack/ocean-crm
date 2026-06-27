import { useState, useEffect, useRef } from 'react';
import { api, getToken, setToken, clearToken, getUser, setUser } from './api';

/* ───────────── Helpers ───────────── */
const ETAPAS = [
  { id: 'interactuando', label: 'Interactuando', color: '#4d9fff' },
  { id: 'contactado', label: 'Contactado', color: '#a78bfa' },
  { id: 'calificado', label: 'Calificado', color: '#c6f135' },
  { id: 'propuesta', label: 'Propuesta', color: '#ffb84d' },
  { id: 'negociacion', label: 'Negociación', color: '#ff9f4d' },
  { id: 'ganado', label: 'Ganado', color: '#25d366' },
  { id: 'perdido', label: 'Perdido', color: '#ff6b6b' },
];
// Mapa de sinónimos de etapa → id del kanban (Valeria usa 'nuevo', etc.)
const ETAPA_ALIAS = {
  nuevo: 'interactuando', interactuando: 'interactuando', interesado: 'interactuando',
  contactado: 'contactado',
  calificado: 'calificado', cualificado: 'calificado',
  propuesta: 'propuesta', cotizacion: 'propuesta',
  negociacion: 'negociacion', 'negociación': 'negociacion',
  ganado: 'ganado', cerrado: 'ganado', cliente: 'ganado',
  perdido: 'perdido', descartado: 'perdido',
};
function etapaDe(c) {
  // Prioriza kanban si es un id válido; si no, traduce etapa vía alias
  const k = (c.kanban || '').toLowerCase();
  if (ETAPAS.find(e => e.id === k)) return k;
  const e = (c.etapa || '').toLowerCase();
  return ETAPA_ALIAS[e] || 'interactuando';
}
function etapaInfo(id) { return ETAPAS.find(e => e.id === id) || ETAPAS[0]; }
function urgColor(u) {
  const x = (u || '').toLowerCase();
  if (x === 'alta') return 'var(--coral)';
  if (x === 'media') return 'var(--amber)';
  return 'var(--mist)';
}
function fmtFecha(s) {
  if (!s) return '—';
  const d = new Date(s);
  const hoy = new Date();
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}
function iniciales(nombre) {
  if (!nombre) return '?';
  return nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

/* ───────────── Login ───────────── */
function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const { token, user } = await api.login(email, password);
      setToken(token); setUser(user); onLogin(user);
    } catch (e) { setErr(e.message || 'No se pudo iniciar sesión'); setLoading(false); }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo font-display">ocean<span>.</span></div>
        <p style={{ color: 'var(--mist)', marginBottom: 28, fontSize: 14 }}>CRM comercial · panel interno</p>
        <form onSubmit={submit}>
          <label className="field">
            <span>Correo</span>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@oceanindustries.com.co" required />
          </label>
          <label className="field">
            <span>Contraseña</span>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
          </label>
          {err && <div style={{ color: 'var(--coral)', fontSize: 13, marginBottom: 14 }}>{err}</div>}
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ───────────── Dashboard ───────────── */
function Dashboard({ onGoPipeline }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.dashboard().then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="metrics-row">
        {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 110 }} />)}
      </div>
    );
  }
  if (!data) return <div className="empty"><h4>No se pudo cargar el panel</h4><p>Revisa la conexión con el servidor.</p></div>;

  // El backend devuelve: { total, hot, pipeline, scorePromedio, tasaConversion, stages, servicios, ... }
  const total = data.total ?? 0;
  const stages = data.stages || {};
  const servicios = data.servicios || {};
  const topServicios = Object.entries(servicios).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <>
      <div className="metrics-row">
        <div className="metric accent">
          <div className="label">Total de clientes</div>
          <div className="value tnum">{total}</div>
          <div className="sub">en tu cartera</div>
        </div>
        <div className="metric">
          <div className="label">Leads calientes</div>
          <div className="value tnum" style={{ color: 'var(--lime)' }}>{data.hot ?? 0}</div>
          <div className="sub">score ≥ 70 o urgencia alta</div>
        </div>
        <div className="metric">
          <div className="label">Tasa de conversión</div>
          <div className="value tnum">{data.tasaConversion ?? 0}%</div>
          <div className="sub">ganados / cerrados</div>
        </div>
        <div className="metric">
          <div className="label">Lead score promedio</div>
          <div className="value tnum">{data.scorePromedio ?? 0}</div>
          <div className="sub">de 100</div>
        </div>
      </div>

      <div className="dash-grid" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h3 className="font-display" style={{ fontSize: 17 }}>Embudo de ventas</h3>
            <button className="btn btn-dark" style={{ padding: '7px 14px', fontSize: 13 }} onClick={onGoPipeline}>Ver pipeline →</button>
          </div>
          {ETAPAS.map(et => {
            const n = stages[et.id] || 0;
            const pct = total ? Math.round((n / total) * 100) : 0;
            return (
              <div key={et.id} style={{ marginBottom: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span>{et.label}</span>
                  <span className="tnum" style={{ color: 'var(--mist)' }}>{n}</span>
                </div>
                <div style={{ height: 7, background: 'var(--surface)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: et.color, borderRadius: 99, transition: 'width 0.5s' }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="card" style={{ padding: 22 }}>
          <h3 className="font-display" style={{ fontSize: 17, marginBottom: 18 }}>Servicios de interés</h3>
          {topServicios.length === 0 && <p style={{ color: 'var(--mist)', fontSize: 13 }}>Aún sin datos suficientes.</p>}
          {topServicios.map(([servicio, count], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < topServicios.length - 1 ? '1px solid var(--line)' : 'none' }}>
              <span style={{ fontSize: 13.5 }}>{servicio || 'Sin especificar'}</span>
              <span className="pill" style={{ background: 'var(--lime-dim)', color: 'var(--lime)' }}>{count}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ───────────── Pipeline (Kanban) ───────────── */
function Pipeline() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);

  async function load() {
    setLoading(true);
    try { setClientes(await api.clientes()); } catch {} finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function mover(cliente, nuevaEtapa) {
    const prev = etapaDe(cliente);
    if (prev === nuevaEtapa) return;
    setClientes(cs => cs.map(c => c.id === cliente.id ? { ...c, kanban: nuevaEtapa, etapa: nuevaEtapa } : c));
    try { await api.actualizarCliente(cliente.id, { kanban: nuevaEtapa, etapa: nuevaEtapa }); }
    catch { load(); }
  }

  function onDrop(etapaId) {
    const c = clientes.find(x => x.id === dragId);
    if (c) mover(c, etapaId);
    setDragId(null); setOverCol(null);
  }

  if (loading) return <div className="kanban">{ETAPAS.slice(0, 5).map(e => <div key={e.id} className="skeleton" style={{ minWidth: 270, height: 320 }} />)}</div>;

  return (
    <>
      <div className="topbar">
        <h1 className="page-title font-display">Pipeline</h1>
        <button className="btn btn-primary" onClick={() => setNuevo(true)}>+ Nuevo cliente</button>
      </div>
      <div className="kanban">
        {ETAPAS.map(et => {
          const items = clientes.filter(c => etapaDe(c) === et.id);
          return (
            <div
              key={et.id}
              className={`kanban-col ${overCol === et.id ? 'drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setOverCol(et.id); }}
              onDragLeave={() => setOverCol(null)}
              onDrop={() => onDrop(et.id)}
            >
              <div className="kanban-col-head">
                <span className="kanban-col-title" style={{ color: et.color }}>{et.label}</span>
                <span className="kanban-count">{items.length}</span>
              </div>
              {items.map(c => (
                <KanbanCard
                  key={c.id} cliente={c} dragging={dragId === c.id}
                  onDragStart={() => setDragId(c.id)} onDragEnd={() => { setDragId(null); setOverCol(null); }}
                  onClick={() => setSel(c)}
                />
              ))}
              {items.length === 0 && <div style={{ color: 'var(--mist-dim)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>—</div>}
            </div>
          );
        })}
      </div>

      {sel && <DetalleCliente cliente={sel} onClose={() => setSel(null)} onSaved={() => { setSel(null); load(); }} />}
      {nuevo && <ClienteModal onClose={() => setNuevo(false)} onSaved={() => { setNuevo(false); load(); }} />}
    </>
  );
}

function KanbanCard({ cliente, dragging, onDragStart, onDragEnd, onClick }) {
  const score = cliente.lead_score || 0;
  const scoreColor = score >= 60 ? 'var(--lime)' : score >= 35 ? 'var(--amber)' : 'var(--mist)';
  return (
    <div className={`lead-card ${dragging ? 'dragging' : ''}`} draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>{iniciales(cliente.nombre)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cliente.nombre || 'Sin nombre'}</div>
          {cliente.sector && <div style={{ fontSize: 11, color: 'var(--mist)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cliente.sector}</div>}
        </div>
      </div>
      {cliente.necesidad && <div style={{ fontSize: 12, color: 'var(--mist)', marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{cliente.necesidad}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="pill" style={{ background: 'var(--surface-hi)', color: scoreColor, fontSize: 10 }}>◊ {score}</span>
        {cliente.urgencia && <span style={{ fontSize: 10, color: urgColor(cliente.urgencia) }}>● {cliente.urgencia}</span>}
      </div>
    </div>
  );
}

/* ───────────── Detalle Cliente ───────────── */
function DetalleCliente({ cliente, onClose, onSaved }) {
  const [tab, setTab] = useState('info');
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState(cliente);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [detalle, setDetalle] = useState(null);
  const [loadingDet, setLoadingDet] = useState(true);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    api.detalleCliente(cliente.id).then(setDetalle).catch(() => setDetalle({ mensajes: [], etiquetas: [], documentos: [] })).finally(() => setLoadingDet(false));
  }, [cliente.id]);

  async function guardar() {
    setSaving(true); setErr('');
    try {
      const { id, created_at, updated_at, ...campos } = form;
      await api.actualizarCliente(cliente.id, campos);
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  }
  async function eliminar() {
    if (!confirm(`¿Eliminar a ${cliente.nombre}? Esta acción no se puede deshacer.`)) return;
    setSaving(true);
    try { await api.eliminarCliente(cliente.id); onSaved(); }
    catch (e) { setErr(e.message); setSaving(false); }
  }

  const wa = cliente.telefono ? `https://wa.me/${String(cliente.telefono).replace(/\D/g, '')}` : null;
  const et = etapaInfo(etapaDe(cliente));
  const etiquetas = detalle?.etiquetas || [];
  const mensajes = detalle?.mensajes || [];
  const documentos = detalle?.documentos || [];
  const TABS = [
    { id: 'info', label: 'Información' },
    { id: 'chat', label: `Conversación${mensajes.length ? ` (${mensajes.length})` : ''}` },
    { id: 'files', label: `Archivos${documentos.length ? ` (${documentos.length})` : ''}` },
  ];

  return (
    <Modal onClose={onClose} wide>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 13, alignItems: 'center' }}>
          <div className="avatar" style={{ width: 46, height: 46, fontSize: 16 }}>{iniciales(cliente.nombre)}</div>
          <div>
            <span className="pill" style={{ background: `${et.color}22`, color: et.color, marginBottom: 6 }}>● {et.label}</span>
            <h3 className="font-display" style={{ fontSize: 22, fontWeight: 800 }}>{cliente.nombre || 'Sin nombre'}</h3>
            {cliente.empresa && <div style={{ color: 'var(--mist)', fontSize: 13 }}>{cliente.empresa}{cliente.sector ? ` · ${cliente.sector}` : ''}</div>}
          </div>
        </div>
        <button onClick={onClose} className="btn btn-ghost" style={{ padding: 8, borderRadius: 8, lineHeight: 1 }}>✕</button>
      </div>

      {etiquetas.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {etiquetas.map((tag, i) => {
            const isHot = tag.includes('caliente') || tag.includes('alto');
            const c = isHot ? 'var(--lime)' : 'var(--amber)';
            return <span key={i} className="pill" style={{ background: `${c}1a`, color: c, fontSize: 10 }}>{tag}</span>;
          })}
        </div>
      )}

      {!edit && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid var(--line)' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '8px 14px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === t.id ? 600 : 500, color: tab === t.id ? 'var(--lime)' : 'var(--mist)', borderBottom: tab === t.id ? '2px solid var(--lime)' : '2px solid transparent', marginBottom: -1 }}>{t.label}</button>
          ))}
        </div>
      )}

      {!edit ? (
        <>
          {tab === 'info' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 18 }}>
                <MiniStat label="Lead score" value={`◊ ${cliente.lead_score || 0}`} color="var(--lime)" />
                <MiniStat label="Urgencia" value={cliente.urgencia || '—'} color={urgColor(cliente.urgencia)} />
                <MiniStat label="Presupuesto" value={cliente.presupuesto || '—'} />
                <MiniStat label="Prioridad" value={cliente.prioridad_seguimiento || '—'} />
              </div>
              <div className="card" style={{ padding: 18, background: 'var(--void)', marginBottom: 16 }}>
                {cliente.telefono && <DetailRow label="Teléfono" value={cliente.telefono} />}
                {cliente.email && <DetailRow label="Email" value={cliente.email} />}
                {cliente.perfil_lead && <DetailRow label="Perfil / cargo" value={cliente.perfil_lead} />}
                {cliente.servicio_interes && <DetailRow label="Servicio" value={cliente.servicio_interes} />}
                {cliente.ubicacion && <DetailRow label="Ubicación" value={cliente.ubicacion} />}
                {cliente.origen && <DetailRow label="Origen" value={cliente.origen} />}
                {cliente.ultima_interaccion && <DetailRow label="Última interacción" value={fmtFecha(cliente.ultima_interaccion)} />}
              </div>
              {cliente.necesidad && <BloqueTexto titulo="Necesidad" texto={cliente.necesidad} />}
              {cliente.objetivo_crecimiento && <BloqueTexto titulo="Objetivo de crecimiento" texto={cliente.objetivo_crecimiento} />}
              {cliente.notas && <BloqueTexto titulo="Notas" texto={cliente.notas} />}
            </>
          )}

          {tab === 'chat' && (
            <div style={{ minHeight: 200 }}>
              {loadingDet ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="skeleton" style={{ height: 40, width: '70%' }} />
                  <div className="skeleton" style={{ height: 40, width: '60%', marginLeft: 'auto' }} />
                </div>
              ) : mensajes.length === 0 ? (
                <div className="empty"><h4>Sin conversación aún</h4><p>Cuando Valeria hable con este cliente, el historial aparecerá aquí.</p></div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '52vh', overflowY: 'auto', padding: '4px 2px' }}>
                  {mensajes.map((msg, i) => {
                    const esCliente = msg.rol === 'cliente';
                    return (
                      <div key={i} style={{ display: 'flex', justifyContent: esCliente ? 'flex-start' : 'flex-end' }}>
                        <div className={`wa-bubble ${esCliente ? 'cli' : 'agente'}`} style={{ maxWidth: '78%' }}>
                          <div style={{ fontSize: 10, color: esCliente ? 'var(--mist)' : 'var(--lime)', marginBottom: 3, fontWeight: 600 }}>{esCliente ? (cliente.nombre || 'Cliente') : 'Valeria'}</div>
                          {msg.contenido}
                          <div className="wa-bubble-time">{fmtFecha(msg.created_at)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'files' && (
            <div style={{ minHeight: 150 }}>
              {loadingDet ? <div className="skeleton" style={{ height: 60 }} /> : documentos.length === 0 ? (
                <div className="empty"><h4>Sin archivos</h4><p>Las imágenes y documentos que el cliente envíe aparecerán aquí.</p></div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {documentos.map((doc, i) => (
                    <a key={i} href={doc.url} target="_blank" rel="noreferrer" className="card card-hover" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
                      <span style={{ fontSize: 22 }}>{doc.tipo === 'imagen' ? '◎' : '▤'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.titulo || 'Archivo'}</div>
                        <div style={{ fontSize: 11, color: 'var(--mist)' }}>{doc.tipo} · {fmtFecha(doc.created_at)}</div>
                      </div>
                      <span style={{ color: 'var(--lime)', fontSize: 12 }}>Abrir →</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {err && <div style={{ color: 'var(--coral)', fontSize: 13, marginTop: 12 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            {wa && <a className="btn" href={wa} target="_blank" rel="noreferrer" style={{ background: 'var(--whatsapp)', color: '#fff', textDecoration: 'none' }}>WhatsApp</a>}
            <button className="btn btn-ghost" onClick={() => { setForm(cliente); setEdit(true); }}>Editar</button>
            <button className="btn btn-ghost" onClick={eliminar} disabled={saving} style={{ marginLeft: 'auto', color: 'var(--coral)', borderColor: 'rgba(255,107,107,0.3)' }}>Eliminar</button>
          </div>
        </>
      ) : (
        <div style={{ marginTop: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Nombre"><input className="input" value={form.nombre || ''} onChange={set('nombre')} /></Field>
            <Field label="Empresa"><input className="input" value={form.empresa || ''} onChange={set('empresa')} /></Field>
            <Field label="Teléfono"><input className="input" value={form.telefono || ''} onChange={set('telefono')} /></Field>
            <Field label="Email"><input className="input" value={form.email || ''} onChange={set('email')} /></Field>
            <Field label="Perfil / cargo"><input className="input" value={form.perfil_lead || ''} onChange={set('perfil_lead')} /></Field>
            <Field label="Servicio"><input className="input" value={form.servicio_interes || ''} onChange={set('servicio_interes')} /></Field>
            <Field label="Sector"><input className="input" value={form.sector || ''} onChange={set('sector')} /></Field>
            <Field label="Ubicación"><input className="input" value={form.ubicacion || ''} onChange={set('ubicacion')} /></Field>
            <Field label="Presupuesto"><input className="input" value={form.presupuesto || ''} onChange={set('presupuesto')} /></Field>
            <Field label="Lead score"><input className="input" type="number" value={form.lead_score || 0} onChange={set('lead_score')} /></Field>
            <Field label="Urgencia">
              <select className="select" value={form.urgencia || 'media'} onChange={set('urgencia')}>
                <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
              </select>
            </Field>
            <Field label="Etapa">
              <select className="select" value={etapaDe(form)} onChange={(e) => setForm({ ...form, kanban: e.target.value, etapa: e.target.value })}>
                {ETAPAS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Necesidad"><textarea className="textarea" style={{ minHeight: 60, resize: 'vertical' }} value={form.necesidad || ''} onChange={set('necesidad')} /></Field>
          <Field label="Notas"><textarea className="textarea" style={{ minHeight: 60, resize: 'vertical' }} value={form.notas || ''} onChange={set('notas')} /></Field>
          {err && <div style={{ color: 'var(--coral)', fontSize: 13, marginBottom: 12 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={() => setEdit(false)} style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
            <button className="btn btn-primary" onClick={guardar} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div className="card" style={{ padding: '12px 14px', background: 'var(--void)' }}>
      <div style={{ fontSize: 10, color: 'var(--mist)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>{label}</div>
      <div className="font-display" style={{ fontSize: 16, fontWeight: 700, color: color || 'var(--ink)' }}>{value}</div>
    </div>
  );
}
function DetailRow({ label, value }) {
  return <div className="detail-row"><span className="k">{label}</span><span className="v">{value}</span></div>;
}
function BloqueTexto({ titulo, texto }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--mist)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{titulo}</div>
      <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink)' }}>{texto}</p>
    </div>
  );
}

/* ───────────── Nuevo Cliente ───────────── */
function ClienteModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ nombre: '', telefono: '', empresa: '', email: '', sector: '', servicio_interes: '', necesidad: '', lead_score: 0, urgencia: 'media', kanban: 'interactuando' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    if (!form.nombre && !form.telefono) { setErr('Pon al menos un nombre o teléfono'); return; }
    setSaving(true); setErr('');
    try { await api.crearCliente(form); onSaved(); }
    catch (e) { setErr(e.message); setSaving(false); }
  }

  return (
    <Modal onClose={onClose}>
      <h3 className="font-display" style={{ fontSize: 20, marginBottom: 18 }}>Nuevo cliente</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Nombre"><input className="input" value={form.nombre} onChange={set('nombre')} /></Field>
        <Field label="Teléfono"><input className="input" value={form.telefono} onChange={set('telefono')} placeholder="573001234567" /></Field>
        <Field label="Empresa"><input className="input" value={form.empresa} onChange={set('empresa')} /></Field>
        <Field label="Email"><input className="input" value={form.email} onChange={set('email')} /></Field>
        <Field label="Sector"><input className="input" value={form.sector} onChange={set('sector')} /></Field>
        <Field label="Servicio"><input className="input" value={form.servicio_interes} onChange={set('servicio_interes')} /></Field>
      </div>
      <Field label="Necesidad"><textarea className="textarea" style={{ minHeight: 60, resize: 'vertical' }} value={form.necesidad} onChange={set('necesidad')} /></Field>
      {err && <div style={{ color: 'var(--coral)', fontSize: 13, marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>{saving ? 'Guardando…' : 'Crear'}</button>
      </div>
    </Modal>
  );
}

/* ───────────── WhatsApp Web propio ───────────── */
function WhatsAppWeb() {
  const [convos, setConvos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activo, setActivo] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errEnvio, setErrEnvio] = useState('');
  const endRef = useRef(null);

  async function load() {
    setLoading(true);
    try { setConvos(await api.conversaciones()); } catch {} finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function abrir(c) {
    setActivo(c); setLoadingMsgs(true); setMensajes([]); setErrEnvio('');
    try { setMensajes(await api.mensajesDe(c.id)); } catch {} finally { setLoadingMsgs(false); }
  }
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' }); }, [mensajes]);

  async function enviar() {
    if (!texto.trim() || !activo) return;
    const msg = texto.trim();
    setEnviando(true); setErrEnvio('');
    setMensajes(m => [...m, { rol: 'agente', contenido: msg, created_at: new Date().toISOString(), _pend: true }]);
    setTexto('');
    try {
      await api.enviarWhatsApp(activo.id, msg);
      setMensajes(m => m.map(x => x._pend ? { ...x, _pend: false } : x));
      load();
    } catch (e) {
      setErrEnvio(e.message || 'No se pudo enviar');
      setMensajes(m => m.filter(x => !x._pend));
      setTexto(msg);
    } finally { setEnviando(false); }
  }

  return (
    <>
      <div className="topbar"><h1 className="page-title font-display">Conversaciones</h1></div>
      <div className={`wa-layout ${activo ? 'chat-abierto' : ''}`}>
        <div className="wa-list">
          {loading ? (
            [1, 2, 3, 4, 5].map(i => <div key={i} style={{ padding: 16 }}><div className="skeleton" style={{ height: 40 }} /></div>)
          ) : convos.length === 0 ? (
            <div className="empty"><h4>Sin conversaciones</h4></div>
          ) : convos.map(c => (
            <div key={c.id} className={`wa-convo ${activo?.id === c.id ? 'active' : ''}`} onClick={() => abrir(c)}>
              <div className="avatar" style={{ width: 42, height: 42 }}>{iniciales(c.nombre)}</div>
              <div className="wa-convo-body">
                <div className="wa-convo-name">
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nombre || c.telefono || 'Sin nombre'}</span>
                  <span style={{ fontSize: 10, color: 'var(--mist-dim)', fontWeight: 400 }}>{fmtFecha(c.ultimo_at)}</span>
                </div>
                <div className="wa-convo-last">{c.ultimo_rol === 'agente' ? 'Tú: ' : ''}{c.ultimo_mensaje || 'Sin mensajes'}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="wa-chat">
          {!activo ? (
            <div className="empty" style={{ margin: 'auto' }}><h4>Selecciona una conversación</h4><p>Tus chats de WhatsApp con clientes, en un solo lugar.</p></div>
          ) : (
            <>
              <div className="wa-chat-head">
                <button className="btn btn-ghost wa-back" style={{ padding: '6px 10px' }} onClick={() => setActivo(null)}>←</button>
                <div className="avatar" style={{ width: 40, height: 40 }}>{iniciales(activo.nombre)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{activo.nombre || 'Sin nombre'}</div>
                  <div style={{ fontSize: 12, color: 'var(--mist)' }}>{activo.telefono}</div>
                </div>
                <span className="pill" style={{ background: 'var(--lime-dim)', color: 'var(--lime)' }}>◊ {activo.lead_score || 0}</span>
              </div>

              <div className="wa-messages">
                {loadingMsgs ? (
                  <div style={{ margin: 'auto', color: 'var(--mist)' }}>Cargando…</div>
                ) : mensajes.length === 0 ? (
                  <div className="empty" style={{ margin: 'auto' }}><p>Aún no hay mensajes con este cliente.</p></div>
                ) : mensajes.map((m, i) => (
                  <div key={i} className={`wa-bubble ${m.rol === 'cliente' ? 'cli' : 'agente'}`} style={{ opacity: m._pend ? 0.6 : 1 }}>
                    {m.contenido}
                    <div className="wa-bubble-time">{m._pend ? 'enviando…' : fmtFecha(m.created_at)}</div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>

              {errEnvio && <div style={{ color: 'var(--coral)', fontSize: 12, padding: '6px 18px' }}>{errEnvio}</div>}
              <div className="wa-compose">
                <textarea
                  value={texto} onChange={e => setTexto(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                  placeholder="Escribe un mensaje…" rows={1}
                />
                <button className="btn btn-primary" onClick={enviar} disabled={enviando || !texto.trim()}>{enviando ? '…' : 'Enviar'}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ───────────── Inteligencia (chat IA conversacional) ───────────── */
function Inteligencia() {
  const [mensajes, setMensajes] = useState([
    { rol: 'bot', texto: 'Hola Juan. Soy tu analista del CRM. Pregúntame lo que quieras sobre tus clientes y leads: a quién priorizar, cómo va un cliente, qué leads están calientes, a quién hacerle seguimiento.' }
  ]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const endRef = useRef(null);

  const sugerencias = [
    '¿Qué leads están más calientes?',
    '¿A quién le hago seguimiento hoy?',
    'Resume el estado de mi pipeline',
    '¿Quién lleva más días sin contacto?',
  ];

  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' }); }, [mensajes, pensando]);

  async function enviar(preset) {
    const q = (preset || texto).trim();
    if (!q || pensando) return;
    const historial = mensajes.map(m => ({ rol: m.rol === 'bot' ? 'assistant' : 'user', texto: m.texto }));
    setMensajes(m => [...m, { rol: 'user', texto: q }]);
    setTexto(''); setPensando(true);
    try {
      const { respuesta } = await api.chatIA(q, historial);
      setMensajes(m => [...m, { rol: 'bot', texto: respuesta }]);
    } catch (e) {
      setMensajes(m => [...m, { rol: 'bot', texto: 'Tuve un problema para responder: ' + (e.message || 'error') }]);
    } finally { setPensando(false); }
  }

  return (
    <>
      <div className="topbar"><h1 className="page-title font-display">Inteligencia</h1></div>
      <div className="ai-chat">
        <div className="ai-messages">
          {mensajes.map((m, i) => (
            <div key={i} className={`ai-msg ${m.rol === 'user' ? 'user' : 'bot'}`}>
              <div className="ai-msg-ava">{m.rol === 'user' ? 'Tú' : 'IA'}</div>
              <div className="ai-msg-bubble">{m.texto}</div>
            </div>
          ))}
          {pensando && (
            <div className="ai-msg bot">
              <div className="ai-msg-ava">IA</div>
              <div className="ai-msg-bubble" style={{ color: 'var(--mist)' }}>Analizando el CRM…</div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        {mensajes.length <= 1 && (
          <div className="ai-suggestions">
            {sugerencias.map((s, i) => <button key={i} className="ai-suggestion" onClick={() => enviar(s)}>{s}</button>)}
          </div>
        )}
        <div className="ai-compose">
          <input className="input" value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') enviar(); }} placeholder="Pregúntale a tu CRM…" />
          <button className="btn btn-primary" onClick={() => enviar()} disabled={pensando || !texto.trim()}>Enviar</button>
        </div>
      </div>
    </>
  );
}

/* ───────────── Campañas masivas ───────────── */
function Campanas() {
  const [tema, setTema] = useState('');
  const [limite, setLimite] = useState(5);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [err, setErr] = useState('');
  const [clientes, setClientes] = useState([]);

  useEffect(() => { api.clientes().then(setClientes).catch(() => {}); }, []);

  async function lanzar() {
    if (!tema.trim()) { setErr('Escribe el tema de la campaña'); return; }
    setEnviando(true); setErr(''); setResultado(null);
    try {
      const r = await api.lanzarCampana({ tema: tema.trim(), limite: Number(limite) });
      setResultado(r);
    } catch (e) {
      setErr(e.message || 'No se pudo lanzar la campaña');
    } finally { setEnviando(false); }
  }

  // Hora actual Colombia para mostrar si está en horario
  const horaCol = (new Date().getUTCHours() - 5 + 24) % 24;
  const enHorario = horaCol >= 8 && horaCol < 20;

  return (
    <>
      <div className="topbar"><h1 className="page-title font-display">Campañas</h1></div>

      <div className="split-grid" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 24 }}>
          <h3 className="font-display" style={{ fontSize: 17, marginBottom: 6 }}>Nueva campaña masiva</h3>
          <p style={{ color: 'var(--mist)', fontSize: 13, marginBottom: 20 }}>
            Valeria contactará a tus clientes uno por uno, con un mensaje único generado para cada quien según el tema. Envía con pausas para cuidar el número.
          </p>

          <label className="field">
            <span>Tema de la campaña</span>
            <textarea
              className="textarea" style={{ minHeight: 90, resize: 'vertical' }}
              value={tema} onChange={e => setTema(e.target.value)}
              placeholder="Ej: Retomar contacto e invitarlos a conocer cómo la IA puede automatizar su atención al cliente"
            />
          </label>

          <label className="field">
            <span>Número de destinatarios (máximo 10)</span>
            <input
              className="input" type="number" min="1" max="10"
              value={limite} onChange={e => setLimite(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
            />
          </label>

          {err && <div style={{ color: 'var(--coral)', fontSize: 13, marginBottom: 14 }}>{err}</div>}

          <button className="btn btn-primary" onClick={lanzar} disabled={enviando || !tema.trim()} style={{ width: '100%' }}>
            {enviando ? 'Lanzando campaña…' : `Lanzar a ${limite} cliente${limite > 1 ? 's' : ''}`}
          </button>

          {resultado && (
            <div className="card" style={{ padding: 16, marginTop: 16, background: 'var(--lime-dim)', border: '1px solid var(--lime-glow)' }}>
              <div style={{ fontWeight: 600, color: 'var(--lime)', marginBottom: 4 }}>✓ Campaña enviada al motor de Valeria</div>
              <div style={{ fontSize: 13, color: 'var(--mist)' }}>
                Valeria está procesando los envíos uno a uno con pausas. Te llegará un resumen por WhatsApp al terminar.
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span className="pill" style={{ background: enHorario ? 'rgba(37,211,102,0.15)' : 'rgba(255,184,77,0.15)', color: enHorario ? 'var(--whatsapp)' : 'var(--amber)' }}>
                {enHorario ? '● En horario' : '○ Fuera de horario'}
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--mist)', lineHeight: 1.6 }}>
              Las campañas solo se envían entre <strong style={{ color: 'var(--ink)' }}>8am y 8pm</strong> hora Colombia. Si lanzas fuera de ese rango, Valeria no enviará.
            </p>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <h4 style={{ fontSize: 14, marginBottom: 12 }}>Protecciones activas</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: 'var(--mist)' }}>
              <div style={{ display: 'flex', gap: 8 }}><span style={{ color: 'var(--lime)' }}>✓</span> Mensaje único por cliente (sin spam)</div>
              <div style={{ display: 'flex', gap: 8 }}><span style={{ color: 'var(--lime)' }}>✓</span> Pausa de 40-90s entre cada envío</div>
              <div style={{ display: 'flex', gap: 8 }}><span style={{ color: 'var(--lime)' }}>✓</span> Techo de 10 destinatarios por campaña</div>
              <div style={{ display: 'flex', gap: 8 }}><span style={{ color: 'var(--lime)' }}>✓</span> Solo en horario comercial</div>
            </div>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--mist)', marginBottom: 4 }}>Clientes en tu cartera</div>
            <div className="font-display" style={{ fontSize: 28, fontWeight: 800 }}>{clientes.length}</div>
            <div style={{ fontSize: 12, color: 'var(--mist)' }}>disponibles para contactar</div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ───────────── Seguimientos ───────────── */
function Seguimientos() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);

  async function load() {
    setLoading(true);
    try { setItems(await api.seguimientos()); } catch {} finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const prioColor = (p) => p === 'alta' ? 'var(--coral)' : p === 'media' ? 'var(--amber)' : 'var(--mist)';

  return (
    <>
      <div className="topbar"><h1 className="page-title font-display">Seguimientos</h1></div>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 70 }} />)}</div>
      ) : items.length === 0 ? (
        <div className="empty"><h4>Todo al día</h4><p>No tienes seguimientos pendientes ahora mismo.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(c => (
            <div key={c.id} className="card card-hover" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }} onClick={() => setSel(c)}>
              <div className="avatar">{iniciales(c.nombre)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{c.nombre || c.telefono}</div>
                <div style={{ fontSize: 12.5, color: 'var(--mist)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.necesidad || 'Sin necesidad registrada'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="pill" style={{ background: `${prioColor(c.prioridad)}1a`, color: prioColor(c.prioridad) }}>{c.prioridad}</span>
                <div style={{ fontSize: 11, color: 'var(--mist)', marginTop: 4 }}>{c.dias_sin_contacto >= 999 ? 'sin contacto' : `${c.dias_sin_contacto}d sin contacto`}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {sel && <DetalleCliente cliente={sel} onClose={() => setSel(null)} onSaved={() => { setSel(null); load(); }} />}
    </>
  );
}

/* ───────────── Utilidades UI ───────────── */
function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
function Modal({ children, onClose, wide }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  );
}

/* ───────────── App raíz ───────────── */
const NAV = [
  { id: 'dashboard', label: 'Panel', ico: '◆' },
  { id: 'pipeline', label: 'Pipeline', ico: '▦' },
  { id: 'chats', label: 'Conversaciones', ico: '✦' },
  { id: 'ia', label: 'Inteligencia', ico: '✶' },
  { id: 'seguimientos', label: 'Seguimientos', ico: '◉' },
  { id: 'campanas', label: 'Campañas', ico: '➤' },
];

export default function App() {
  const [user, setUserState] = useState(getUser());
  const [vista, setVista] = useState('dashboard');

  function salir() { clearToken(); localStorage.removeItem('ocean_user'); setUserState(null); }

  if (!user) return <Login onLogin={setUserState} />;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand font-display">ocean<span>.</span></div>
        {NAV.map(n => (
          <button key={n.id} className={`nav-item ${vista === n.id ? 'active' : ''}`} onClick={() => setVista(n.id)}>
            <span className="ico">{n.ico}</span>{n.label}
          </button>
        ))}
        <div className="sidebar-foot">
          <div className="user-chip">
            <div className="avatar">{iniciales(user.nombre || user.email)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.nombre || 'Usuario'}</div>
              <div style={{ fontSize: 11, color: 'var(--mist)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
            </div>
          </div>
          <button className="nav-item" style={{ marginTop: 6 }} onClick={salir}><span className="ico">⊗</span>Salir</button>
        </div>
      </aside>

      <main className="main">
        {vista === 'dashboard' && <><div className="topbar"><h1 className="page-title font-display">Panel</h1></div><Dashboard onGoPipeline={() => setVista('pipeline')} /></>}
        {vista === 'pipeline' && <Pipeline />}
        {vista === 'chats' && <WhatsAppWeb />}
        {vista === 'ia' && <Inteligencia />}
        {vista === 'seguimientos' && <Seguimientos />}
        {vista === 'campanas' && <Campanas />}
      </main>
    </div>
  );
}
