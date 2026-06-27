import { getSupabase, jwt, bcrypt, jwtSecret, cors, verifyAuth, getBody } from './_lib.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const route = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const method = req.method;

  try {
    const supabase = getSupabase();

    // ── HEALTH ──
    if (route === 'health') {
      return res.json({ status: 'ok', service: 'ocean-crm-api', time: new Date().toISOString() });
    }

    // ── LOGIN (público) ──
    if (route === 'auth/login' && method === 'POST') {
      const { email, password } = getBody(req);
      if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña requeridos' });
      }
      const { data: user, error } = await supabase
        .from('usuarios')
        .select('id, nombre, email, password_hash, rol, activo')
        .eq('email', email.toLowerCase().trim())
        .single();

      if (error || !user) return res.status(401).json({ error: 'Credenciales inválidas' });
      if (!user.activo) return res.status(403).json({ error: 'Usuario desactivado' });

      const ok = await bcrypt.compare(password, user.password_hash || '');
      if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

      const token = jwt.sign(
        { id: user.id, email: user.email, rol: user.rol },
        jwtSecret(),
        { expiresIn: '7d' }
      );
      return res.json({
        token,
        user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol }
      });
    }

    // ── A partir de aquí requiere auth ──
    // Excepción: el envío validado de WhatsApp acepta una API key interna (para que Valeria/n8n lo use)
    const internalKey = process.env.INTERNAL_API_KEY;
    const isInternalCall = internalKey && req.headers['x-internal-key'] === internalKey
      && route === 'whatsapp/enviar-validado';

    const session = isInternalCall ? { id: 'valeria', rol: 'agente', email: 'valeria@ocean' } : verifyAuth(req);
    if (!session) return res.status(401).json({ error: 'No autorizado' });

    // ── PERFIL ──
    if (route === 'me' && method === 'GET') {
      return res.json({ user: session });
    }

    // ── CLIENTES: listar ──
    if (route === 'clientes' && method === 'GET') {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .neq('origen', '_sistema_asistente')
        .order('ultima_interaccion', { ascending: false, nullsFirst: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    // ── CLIENTE: detalle completo (historial + etiquetas + documentos) ──
    if (route.match(/^clientes\/[^/]+\/detalle$/) && method === 'GET') {
      const id = route.split('/')[1];
      const [cliente, mensajes, etiquetas, documentos] = await Promise.all([
        supabase.from('clientes').select('*').eq('id', id).single(),
        supabase.from('mensajes').select('rol, contenido, canal, created_at').eq('cliente_id', id).order('created_at', { ascending: true }),
        supabase.from('etiquetas').select('etiqueta, created_at').eq('cliente_id', id),
        supabase.from('documentos').select('*').eq('cliente_id', id).order('created_at', { ascending: false })
      ]);
      if (cliente.error) return res.status(500).json({ error: cliente.error.message });
      return res.json({
        cliente: cliente.data,
        mensajes: mensajes.data || [],
        etiquetas: (etiquetas.data || []).map(e => e.etiqueta),
        documentos: documentos.data || []
      });
    }

    // ── CLIENTES: crear ──
    if (route === 'clientes' && method === 'POST') {
      const b = getBody(req);
      const nuevo = {
        nombre: b.nombre || null,
        telefono: b.telefono || null,
        email: b.email || null,
        empresa: b.empresa || null,
        sector: b.sector || null,
        tamano_empresa: b.tamano_empresa || null,
        servicio_interes: b.servicio_interes || null,
        necesidad: b.necesidad || null,
        presupuesto: b.presupuesto || null,
        urgencia: b.urgencia || null,
        lead_score: b.lead_score || 0,
        etapa: b.etapa || 'nuevo',
        kanban: b.kanban || b.etapa || 'nuevo',
        origen: b.origen || 'crm',
        asignado_a: b.asignado_a || null,
        notas: b.notas || null,
        ubicacion: b.ubicacion || null,
        objetivo_crecimiento: b.objetivo_crecimiento || null,
        prioridad_seguimiento: b.prioridad_seguimiento || 'media'
      };
      const { data, error } = await supabase.from('clientes').insert(nuevo).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    // ── CLIENTES: actualizar (mover en Kanban, editar) ──
    if (route.startsWith('clientes/') && method === 'PUT') {
      const id = route.split('/')[1];
      const updates = { ...getBody(req), updated_at: new Date().toISOString() };
      delete updates.id; delete updates.created_at;
      const { data, error } = await supabase.from('clientes').update(updates).eq('id', id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    // ── CLIENTES: eliminar ──
    if (route.startsWith('clientes/') && method === 'DELETE') {
      const id = route.split('/')[1];
      const { error } = await supabase.from('clientes').delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    }

    // ── DASHBOARD ──
    if (route === 'dashboard' && method === 'GET') {
      const { data: clients, error } = await supabase
        .from('clientes')
        .select('etapa, kanban, lead_score, servicio_interes, presupuesto, urgencia, sector, origen, created_at, ultima_interaccion')
        .neq('origen', '_sistema_asistente');
      if (error) return res.status(500).json({ error: error.message });

      const stages = {}; const servicios = {}; const sectores = {}; const origenes = {};
      let hot = 0; let pipeline = 0; let pipelineGanado = 0; let sumScore = 0;
      const now = Date.now();
      let nuevos7d = 0;
      // Normaliza etapa/kanban a un id de stage canonico
      const aliasStage = {
        nuevo: 'interactuando', interactuando: 'interactuando', interesado: 'interactuando',
        contactado: 'contactado', calificado: 'calificado', cualificado: 'calificado',
        propuesta: 'propuesta', cotizacion: 'propuesta', negociacion: 'negociacion',
        ganado: 'ganado', cerrado: 'ganado', cliente: 'ganado', perdido: 'perdido', descartado: 'perdido'
      };
      // Parsea presupuesto en texto libre a un número en COP (maneja "2 millones", "2M", "2.000.000")
      const parsePresupuesto = (txt) => {
        if (!txt) return 0;
        const s = String(txt).toLowerCase().trim();
        // Extraer el primer número (puede tener . o , como separador)
        const m = s.match(/[\d.,]+/);
        if (!m) return 0;
        let num = parseFloat(m[0].replace(/\.(?=\d{3})/g, '').replace(',', '.')) || 0;
        // Multiplicadores
        if (/mill|\bm\b|millon/.test(s)) num *= 1_000_000;
        else if (/\bk\b|mil/.test(s) && num < 1000) num *= 1000;
        return Math.round(num);
      };
      (clients || []).forEach(c => {
        const raw = (c.kanban || c.etapa || 'nuevo').toLowerCase();
        const st = aliasStage[raw] || 'interactuando';
        stages[st] = (stages[st] || 0) + 1;
        if (c.servicio_interes) servicios[c.servicio_interes] = (servicios[c.servicio_interes] || 0) + 1;
        if (c.sector) sectores[c.sector] = (sectores[c.sector] || 0) + 1;
        if (c.origen) origenes[c.origen] = (origenes[c.origen] || 0) + 1;
        if ((c.lead_score || 0) >= 70 || c.urgencia === 'alta') hot++;
        sumScore += (c.lead_score || 0);
        const val = parsePresupuesto(c.presupuesto);
        if (st === 'ganado') pipelineGanado += val; else pipeline += val;
        if (c.created_at && (now - new Date(c.created_at).getTime()) < 7 * 864e5) nuevos7d++;
      });
      const total = (clients || []).length;
      const ganados = stages['ganado'] || 0;
      const cerrados = ganados + (stages['perdido'] || 0);
      return res.json({
        total, hot, pipeline, pipelineGanado, nuevos7d,
        scorePromedio: total ? Math.round(sumScore / total) : 0,
        tasaConversion: cerrados ? Math.round((ganados / cerrados) * 100) : 0,
        stages, servicios, sectores, origenes
      });
    }

    // ── ANÁLISIS IA DEL PIPELINE (Claude) ──
    if (route === 'ai/analisis' && method === 'GET') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'Falta ANTHROPIC_API_KEY en el entorno' });

      const { data: clients, error } = await supabase
        .from('clientes')
        .select('nombre, empresa, sector, servicio_interes, necesidad, presupuesto, urgencia, lead_score, etapa, kanban, origen, ultima_interaccion, objetivo_crecimiento');
      if (error) return res.status(500).json({ error: error.message });
      if (!clients || clients.length === 0) {
        return res.json({ analisis: null, vacio: true });
      }

      // Resumen compacto para no gastar tokens de más
      const resumen = clients.map(c => ({
        n: c.nombre, emp: c.empresa, sec: c.sector, serv: c.servicio_interes,
        nec: (c.necesidad || '').slice(0, 120), pres: c.presupuesto, urg: c.urgencia,
        score: c.lead_score, etapa: c.kanban || c.etapa, origen: c.origen,
        ult: c.ultima_interaccion
      }));

      const hoy = new Date().toISOString().slice(0, 10);
      const prompt = `Eres analista comercial senior de Ocean Industries, una agencia colombiana de IA y automatización. Hoy es ${hoy}. Analiza este pipeline de ${clients.length} clientes (JSON) y entrega un análisis ACCIONABLE en español, directo y sin relleno.

Datos: ${JSON.stringify(resumen)}

Responde SOLO con un objeto JSON válido (sin markdown, sin backticks) con esta estructura exacta:
{
  "resumen": "2-3 frases sobre el estado general del pipeline",
  "prioridades": [{"cliente": "nombre", "razon": "por qué priorizarlo hoy", "accion": "acción concreta"}],
  "riesgos": [{"señal": "qué detectaste", "detalle": "explicación breve"}],
  "oportunidades": [{"titulo": "oportunidad", "detalle": "explicación breve"}],
  "recomendacion": "la recomendación #1 para esta semana, una frase"
}
Máximo 3 elementos en prioridades, 2 en riesgos, 2 en oportunidades. Usa los nombres reales de los clientes.`;

      try {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1500,
            messages: [{ role: 'user', content: prompt }]
          })
        });
        const out = await r.json();
        if (out.error) return res.status(502).json({ error: 'Error de IA: ' + (out.error.message || 'desconocido') });
        let txt = (out.content || []).map(b => b.text || '').join('').trim();
        txt = txt.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
        let analisis;
        try { analisis = JSON.parse(txt); }
        catch { return res.json({ analisis: { resumen: txt, prioridades: [], riesgos: [], oportunidades: [], recomendacion: '' } }); }
        return res.json({ analisis });
      } catch (e) {
        return res.status(502).json({ error: 'No se pudo conectar con la IA: ' + e.message });
      }
    }

    // ── USUARIOS (solo owner) ──
    if (route === 'usuarios' && method === 'GET') {
      if (session.rol !== 'owner') return res.status(403).json({ error: 'Solo el owner puede ver usuarios' });
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nombre, email, rol, activo, created_at')
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    // ── CONVERSACIONES: lista de chats (estilo WhatsApp Web) ──
    if (route === 'conversaciones' && method === 'GET') {
      const { data: clientes, error: ecli } = await supabase
        .from('clientes')
        .select('id, nombre, telefono, lead_score, kanban, etapa, ultima_interaccion')
        .neq('origen', '_sistema_asistente')
        .order('ultima_interaccion', { ascending: false, nullsFirst: false });
      if (ecli) return res.status(500).json({ error: ecli.message });

      const convos = await Promise.all((clientes || []).map(async (c) => {
        const { data: msgs } = await supabase
          .from('mensajes')
          .select('rol, contenido, created_at')
          .eq('cliente_id', c.id)
          .order('created_at', { ascending: false })
          .limit(1);
        const ultimo = msgs && msgs[0] ? msgs[0] : null;
        return {
          ...c,
          ultimo_mensaje: ultimo ? ultimo.contenido : null,
          ultimo_rol: ultimo ? ultimo.rol : null,
          ultimo_at: ultimo ? ultimo.created_at : c.ultima_interaccion
        };
      }));
      convos.sort((a, b) => new Date(b.ultimo_at || 0) - new Date(a.ultimo_at || 0));
      return res.json(convos);
    }

    // ── MENSAJES de un cliente (para abrir el chat) ──
    if (route.match(/^conversaciones\/[^/]+\/mensajes$/) && method === 'GET') {
      const id = route.split('/')[1];
      const { data, error } = await supabase
        .from('mensajes')
        .select('rol, contenido, canal, created_at')
        .eq('cliente_id', id)
        .order('created_at', { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data || []);
    }

    // ── ENVIAR mensaje de WhatsApp a un cliente (vía Evolution) ──
    if (route === 'whatsapp/enviar' && method === 'POST') {
      const { cliente_id, telefono, mensaje } = getBody(req);
      if (!mensaje || (!cliente_id && !telefono)) {
        return res.status(400).json({ error: 'Faltan datos: mensaje y (cliente_id o telefono)' });
      }
      let numero = telefono;
      let cid = cliente_id;
      if (!numero && cliente_id) {
        const { data: c } = await supabase.from('clientes').select('telefono').eq('id', cliente_id).single();
        numero = c ? c.telefono : null;
      }
      if (!cid && telefono) {
        const { data: c } = await supabase.from('clientes').select('id').eq('telefono', telefono).single();
        cid = c ? c.id : null;
      }
      if (!numero) return res.status(404).json({ error: 'No se encontró el teléfono del cliente' });

      const EVO_URL = process.env.EVOLUTION_URL || 'http://178.156.183.173';
      const EVO_KEY = process.env.EVOLUTION_API_KEY;
      const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE || 'ocean-comercial';
      if (!EVO_KEY) return res.status(500).json({ error: 'Falta EVOLUTION_API_KEY en el entorno' });

      try {
        const evoResp = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
          method: 'POST',
          headers: { 'apikey': EVO_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: numero, text: mensaje })
        });
        const evoData = await evoResp.json().catch(() => ({}));
        if (!evoResp.ok) {
          return res.status(502).json({ error: 'Evolution rechazó el envío', detalle: evoData });
        }
        if (cid) {
          await supabase.from('mensajes').insert({
            cliente_id: cid, rol: 'agente', contenido: mensaje, canal: 'whatsapp'
          });
          await supabase.from('clientes').update({ ultima_interaccion: new Date().toISOString() }).eq('id', cid);
        }
        return res.json({ ok: true, enviado_a: numero, evolution: evoData.key ? evoData.key.id : null });
      } catch (e) {
        return res.status(502).json({ error: 'No se pudo conectar con Evolution: ' + e.message });
      }
    }

    // ── ENVIAR validado: verifica que el número pertenece a un cliente y el nombre coincide ──
    // Diseñado para que Valeria NO pueda enviar a números inventados o a la persona equivocada.
    if (route === 'whatsapp/enviar-validado' && method === 'POST') {
      const { telefono, nombre_esperado, mensaje } = getBody(req);
      if (!telefono || !mensaje) {
        return res.status(400).json({ error: 'Faltan datos', enviado: false, instruccion: 'Necesitas telefono y mensaje.' });
      }
      const num = String(telefono).replace(/\D/g, '');
      // Buscar el cliente por teléfono en el CRM
      const { data: cli } = await supabase
        .from('clientes')
        .select('id, nombre, telefono')
        .eq('telefono', num)
        .maybeSingle();

      if (!cli) {
        return res.json({
          enviado: false,
          motivo: 'numero_no_existe',
          instruccion: `El numero ${num} NO corresponde a ningun cliente en el CRM. NO se envio nada. Verifica el numero con consultar_crm o pregunta a Juan a quien exactamente quiere escribir.`
        });
      }

      // Si se dio un nombre esperado, validar que coincide con el cliente real
      if (nombre_esperado) {
        const real = (cli.nombre || '').toLowerCase().trim();
        const esperado = String(nombre_esperado).toLowerCase().trim();
        // Coincidencia flexible: uno contiene al otro (maneja "Lau" vs "Lau Castro")
        const coincide = real.includes(esperado) || esperado.includes(real) ||
                         real.split(/\s+/)[0] === esperado.split(/\s+/)[0];
        if (!coincide) {
          return res.json({
            enviado: false,
            motivo: 'nombre_no_coincide',
            cliente_real: cli.nombre,
            instruccion: `ALTO: el numero ${num} pertenece a "${cli.nombre}", NO a "${nombre_esperado}". NO se envio nada para evitar escribirle a la persona equivocada. Confirma con Juan: ¿queria escribirle a ${cli.nombre}? Si es otra persona, busca su numero correcto con consultar_crm.`
          });
        }
      }

      // Pasó la validación: enviar
      const EVO_URL = process.env.EVOLUTION_URL || 'http://178.156.183.173';
      const EVO_KEY = process.env.EVOLUTION_API_KEY;
      const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE || 'ocean-comercial';
      if (!EVO_KEY) return res.status(500).json({ enviado: false, error: 'Falta EVOLUTION_API_KEY en el entorno' });

      try {
        const evoResp = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
          method: 'POST',
          headers: { 'apikey': EVO_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: num, text: mensaje })
        });
        const evoData = await evoResp.json().catch(() => ({}));
        if (!evoResp.ok) {
          return res.status(502).json({ enviado: false, error: 'Evolution rechazo el envio', detalle: evoData });
        }
        await supabase.from('mensajes').insert({ cliente_id: cli.id, rol: 'agente', contenido: mensaje, canal: 'whatsapp' });
        await supabase.from('clientes').update({ ultima_interaccion: new Date().toISOString() }).eq('id', cli.id);
        return res.json({
          enviado: true,
          cliente: cli.nombre,
          telefono: num,
          confirmacion: `Mensaje enviado correctamente a ${cli.nombre} (${num}).`
        });
      } catch (e) {
        return res.status(502).json({ enviado: false, error: 'No se pudo conectar con Evolution: ' + e.message });
      }
    }

    // ── IA CONVERSACIONAL: chatear con el CRM ──
    if (route === 'ai/chat' && method === 'POST') {
      const { mensaje, historial } = getBody(req);
      if (!mensaje) return res.status(400).json({ error: 'Falta el mensaje' });
      const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
      if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Falta ANTHROPIC_API_KEY en el entorno' });

      const { data: clientes } = await supabase
        .from('clientes')
        .select('nombre, telefono, sector, servicio_interes, necesidad, presupuesto, lead_score, kanban, etapa, ubicacion, ultima_interaccion')
        .neq('origen', '_sistema_asistente')
        .order('ultima_interaccion', { ascending: false, nullsFirst: false })
        .limit(50);

      const contextoCRM = JSON.stringify(clientes || []);
      const mensajes = [];
      if (Array.isArray(historial)) {
        historial.slice(-6).forEach(h => {
          if (h && h.rol && h.texto) mensajes.push({ role: h.rol === 'user' ? 'user' : 'assistant', content: h.texto });
        });
      }
      mensajes.push({ role: 'user', content: mensaje });

      const sys = `Eres el asistente de inteligencia del CRM de Ocean Industries, una agencia de IA y automatizacion. Juan (el CEO) o su equipo te hacen preguntas sobre sus clientes y leads. Responde en espanol, claro y conciso, como un analista de ventas experto.

Tienes acceso a estos datos reales del CRM (lista de clientes en JSON):
${contextoCRM}

Reglas:
- Responde SOLO con base en estos datos reales. Si te preguntan algo que no esta, dilo.
- Cuando menciones un cliente, incluye su dato relevante (lead score, etapa, necesidad).
- Para preguntas tipo "a quien le hago seguimiento", prioriza leads con score alto o sin interaccion reciente.
- Se directo y accionable. Sugiere proximos pasos cuando tenga sentido.
- Formato chat: parrafos cortos, sin markdown pesado.`;

      try {
        const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1000,
            system: sys,
            messages: mensajes
          })
        });
        const aiData = await aiResp.json();
        if (!aiResp.ok) return res.status(502).json({ error: 'Error de IA', detalle: aiData });
        const texto = (aiData.content || []).map(b => b.text || '').join('\n').trim();
        return res.json({ respuesta: texto || 'No pude generar una respuesta.' });
      } catch (e) {
        return res.status(502).json({ error: 'No se pudo conectar con la IA: ' + e.message });
      }
    }

    // ── SEGUIMIENTOS: clientes que necesitan atención ──
    if (route === 'seguimientos' && method === 'GET') {
      const { data: clientes, error } = await supabase
        .from('clientes')
        .select('id, nombre, telefono, lead_score, etapa, kanban, necesidad, ultima_interaccion')
        .neq('origen', '_sistema_asistente')
        .order('ultima_interaccion', { ascending: true, nullsFirst: true });
      if (error) return res.status(500).json({ error: error.message });
      const ahora = Date.now();
      const seguimientos = (clientes || []).map(c => {
        const dias = c.ultima_interaccion ? Math.floor((ahora - new Date(c.ultima_interaccion)) / 86400000) : 999;
        let prioridad = 'baja';
        if ((c.lead_score || 0) >= 60 && dias >= 2) prioridad = 'alta';
        else if ((c.lead_score || 0) >= 40 || dias >= 5) prioridad = 'media';
        return { ...c, dias_sin_contacto: dias, prioridad };
      }).filter(c => c.prioridad !== 'baja' || c.dias_sin_contacto >= 3);
      return res.json(seguimientos);
    }

    // ── CAMPAÑAS: webhook n8n ──
    if (route === 'campanas' && method === 'POST') {
      const b = getBody(req);
      const webhook = process.env.N8N_CAMPAIGN_WEBHOOK;
      if (!webhook) return res.status(500).json({ error: 'Webhook de campañas no configurado' });
      try {
        const r = await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...b, origen: 'ocean-crm', por: session.email })
        });
        const data = await r.json().catch(() => ({}));
        return res.json({ ok: true, mensaje: 'Campaña enviada al motor de Valeria', n8n: data });
      } catch (e) {
        return res.status(502).json({ error: 'No se pudo conectar con el motor de campañas' });
      }
    }

    return res.status(404).json({ error: `Ruta no encontrada: ${method} /${route}` });

  } catch (e) {
    console.error('Error en API:', e);
    return res.status(500).json({ error: 'Error interno del servidor', detail: e.message });
  }
}
