/* ==========================================================================
   annotate.js — rabiscar sobre a tela de quem está transmitindo
   --------------------------------------------------------------------------
   Como o Slack: qualquer um na sala pode desenhar sobre a transmissão, todos
   veem, e o traço some sozinho depois de alguns segundos.

   Os pontos são normalizados (0..1) em relação ao QUADRO DE VÍDEO, não ao
   elemento — assim o rabisco cai no mesmo lugar mesmo que cada pessoa esteja
   com a janela num tamanho diferente, ou com barras pretas nas laterais.

   Os traços vão pelo socket, não pelo WebRTC: são poucos bytes e assim
   funcionam mesmo antes da conexão P2P terminar de subir.
   ========================================================================== */

'use strict';

const ANNOT_COLORS = ['#ff3b5c', '#ffd166', '#4ade80', '#38bdf8', '#c084fc', '#ffffff'];
const ANNOT_TOOLS = {
  caneta:     { width: 1,   alpha: 1,   cap: 'round' },
  marcador:   { width: 3.2, alpha: 0.38, cap: 'round' },
  seta:       { width: 1.2, alpha: 1,   cap: 'round' },
};

const Annot = {
  socket: null,
  layers: new Map(),      // targetId -> { el, canvas, ctx, strokes: Map, drawing }
  tool: 'caneta',
  color: '#ff3b5c',
  size: 4,
  active: null,           // targetId onde o modo desenho está ligado
  raf: 0,

  init(socket) {
    this.socket = socket;
    this.color = Settings.get('annotColor');
    this.size = Settings.get('annotSize');

    socket.on('annot:draw', (p) => this.applyRemote(p));
    socket.on('annot:clear', (p) => this.clear(p.target, { broadcast: false, by: p.by }));

    this.loop();
  },

  /* -------------------------------------------------------- camadas --- */

  /** Garante que o tile tenha uma camada de desenho e devolve ela. */
  attach(tileEl, targetId) {
    let layer = this.layers.get(targetId);
    if (layer && layer.el.isConnected && layer.el.parentElement === tileEl) return layer;

    if (layer) layer.el.remove();

    const el = document.createElement('div');
    el.className = 'annot-layer';
    const canvas = document.createElement('canvas');
    canvas.className = 'annot-canvas';
    el.appendChild(canvas);
    tileEl.appendChild(el);

    layer = {
      el, canvas,
      ctx: canvas.getContext('2d'),
      strokes: new Map(),
      current: null,
      pending: [],
      lastSend: 0,
      targetId,
    };
    this.layers.set(targetId, layer);
    this.wire(layer);
    return layer;
  },

  detach(targetId) {
    const layer = this.layers.get(targetId);
    if (!layer) return;
    layer.el.remove();
    this.layers.delete(targetId);
    if (this.active === targetId) this.active = null;
  },

  detachAll() {
    for (const id of [...this.layers.keys()]) this.detach(id);
  },

  /* ---------------------------------------------------- modo desenho -- */

  setActive(targetId) {
    // Só uma tela por vez aceita rabisco.
    for (const [id, layer] of this.layers) {
      const on = id === targetId;
      layer.el.classList.toggle('drawing', on);
    }
    this.active = targetId;
  },

  isActive(targetId) { return this.active === targetId; },

  /* -------------------------------------------------------- geometria - */

  /**
   * Retângulo que o vídeo realmente ocupa dentro do tile.
   * Com object-fit: contain sobra barra preta, e é preciso descontá-la.
   */
  contentRect(layer) {
    const el = layer.el;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const video = el.parentElement && el.parentElement.querySelector('video');

    if (!video || !video.videoWidth || !video.videoHeight || video.classList.contains('hidden')) {
      return { x: 0, y: 0, w, h };
    }
    const scale = Math.min(w / video.videoWidth, h / video.videoHeight);
    const dw = video.videoWidth * scale;
    const dh = video.videoHeight * scale;
    return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
  },

  toNorm(layer, clientX, clientY) {
    const box = layer.el.getBoundingClientRect();
    const r = this.contentRect(layer);
    return [
      (clientX - box.left - r.x) / r.w,
      (clientY - box.top - r.y) / r.h,
    ];
  },

  /* ------------------------------------------------------- interação -- */

  wire(layer) {
    const el = layer.el;

    el.addEventListener('pointerdown', (e) => {
      if (!el.classList.contains('drawing') || e.button !== 0) return;
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch {}

      const stroke = {
        id: Math.random().toString(36).slice(2, 11),
        by: 'me',
        tool: this.tool,
        color: this.color,
        size: this.size,
        pts: [this.toNorm(layer, e.clientX, e.clientY)],
        born: performance.now(),
      };
      layer.current = stroke;
      layer.strokes.set(stroke.id, stroke);
      layer.pending = [...stroke.pts];
      layer.lastSend = 0;
      this.flush(layer, false);
    });

    el.addEventListener('pointermove', (e) => {
      const stroke = layer.current;
      if (!stroke) return;
      const pt = this.toNorm(layer, e.clientX, e.clientY);

      // A seta só tem começo e fim: o resto do arrasto move a ponta.
      if (stroke.tool === 'seta') stroke.pts[1] = pt;
      else stroke.pts.push(pt);

      layer.pending.push(pt);
      stroke.born = performance.now();

      const now = performance.now();
      if (now - layer.lastSend > 55) this.flush(layer, false);
    });

    const finish = (e) => {
      if (!layer.current) return;
      try { el.releasePointerCapture(e.pointerId); } catch {}
      this.flush(layer, true);
      layer.current = null;
    };
    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', finish);
    el.addEventListener('pointerleave', finish);
  },

  /** Manda para os outros só os pontos novos desde o último envio. */
  flush(layer, end) {
    const stroke = layer.current;
    if (!stroke || !this.socket) return;

    const payload = {
      target: layer.targetId === 'local' ? Voice.sid : layer.targetId,
      id: stroke.id,
      tool: stroke.tool,
      color: stroke.color,
      size: stroke.size,
      end: !!end,
    };
    // Na seta mandamos os dois pontos sempre; é barato e evita remontagem.
    payload.pts = stroke.tool === 'seta' ? stroke.pts : layer.pending;
    payload.replace = stroke.tool === 'seta';

    this.socket.emit('annot:draw', payload);
    layer.pending = [];
    layer.lastSend = performance.now();
  },

  /* ------------------------------------------------------- recepção --- */

  applyRemote(p) {
    // 'target' é o sid de quem transmite. Para quem transmite, é a sua
    // própria tela — que localmente vive na camada 'local'.
    const targetId = p.target === Voice.sid ? 'local' : p.target;
    const layer = this.layers.get(targetId);
    if (!layer) return;

    let stroke = layer.strokes.get(p.id);
    if (!stroke) {
      stroke = {
        id: p.id, by: p.from, tool: p.tool || 'caneta',
        color: p.color || '#ff3b5c', size: p.size || 4, pts: [],
        born: performance.now(),
      };
      layer.strokes.set(p.id, stroke);
    }
    if (p.replace) stroke.pts = p.pts || [];
    else stroke.pts.push(...(p.pts || []));
    stroke.born = performance.now();
  },

  clear(targetId, { broadcast = true } = {}) {
    const id = targetId === Voice.sid ? 'local' : targetId;
    const layer = this.layers.get(id);
    if (layer) {
      layer.strokes.clear();
      layer.current = null;
    }
    if (broadcast && this.socket) {
      this.socket.emit('annot:clear', { target: targetId === 'local' ? Voice.sid : targetId });
    }
  },

  /* -------------------------------------------------------- desenho --- */

  loop() {
    const tick = () => {
      const fade = Number(Settings.get('annotFade')) || 0;
      const now = performance.now();

      for (const layer of this.layers.values()) {
        if (!layer.el.isConnected) continue;
        this.render(layer, now, fade);
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  },

  render(layer, now, fade) {
    const { canvas, ctx, el } = layer;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;

    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const r = this.contentRect(layer);
    const px = (p) => [r.x + p[0] * r.w, r.y + p[1] * r.h];

    for (const [id, stroke] of layer.strokes) {
      let alpha = 1;
      if (fade > 0) {
        const age = (now - stroke.born) / 1000;
        if (age > fade) { layer.strokes.delete(id); continue; }
        // Só começa a sumir no último terço da vida.
        const fadeStart = fade * 0.65;
        if (age > fadeStart) alpha = 1 - (age - fadeStart) / (fade - fadeStart);
      }

      const spec = ANNOT_TOOLS[stroke.tool] || ANNOT_TOOLS.caneta;
      ctx.globalAlpha = alpha * spec.alpha;
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.size * spec.width;
      ctx.lineCap = spec.cap;
      ctx.lineJoin = 'round';

      if (stroke.tool === 'seta') this.drawArrow(ctx, stroke, px);
      else this.drawFree(ctx, stroke, px);
    }
    ctx.globalAlpha = 1;
  },

  drawFree(ctx, stroke, px) {
    const pts = stroke.pts;
    if (!pts.length) return;
    if (pts.length === 1) {
      const [x, y] = px(pts[0]);
      ctx.beginPath();
      ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    let [x, y] = px(pts[0]);
    ctx.moveTo(x, y);
    // Curva por pontos médios: tira o serrilhado do traço à mão.
    for (let i = 1; i < pts.length - 1; i++) {
      const [cx, cy] = px(pts[i]);
      const [nx, ny] = px(pts[i + 1]);
      ctx.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
    }
    const [lx, ly] = px(pts[pts.length - 1]);
    ctx.lineTo(lx, ly);
    ctx.stroke();
  },

  drawArrow(ctx, stroke, px) {
    if (stroke.pts.length < 2) return;
    const [x1, y1] = px(stroke.pts[0]);
    const [x2, y2] = px(stroke.pts[1]);
    const head = Math.max(12, ctx.lineWidth * 3.5);
    const ang = Math.atan2(y2 - y1, x2 - x1);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 - Math.cos(ang) * head * 0.6, y2 - Math.sin(ang) * head * 0.6);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(ang - Math.PI / 7), y2 - head * Math.sin(ang - Math.PI / 7));
    ctx.lineTo(x2 - head * Math.cos(ang + Math.PI / 7), y2 - head * Math.sin(ang + Math.PI / 7));
    ctx.closePath();
    ctx.fill();
  },

  /* --------------------------------------------------------- barra ---- */

  /** Monta a barrinha de ferramentas dentro de um tile. */
  toolbar(targetId, onChange) {
    const bar = document.createElement('div');
    bar.className = 'annot-bar';

    const tools = [
      ['caneta', 'pen', 'Caneta'],
      ['marcador', 'highlighter', 'Marcador'],
      ['seta', 'arrow', 'Seta'],
    ];
    for (const [id, ico, title] of tools) {
      const b = document.createElement('button');
      b.innerHTML = icon(ico, 16);
      b.title = title;
      b.classList.toggle('on', this.tool === id);
      b.onclick = (e) => { e.stopPropagation(); this.tool = id; onChange(); };
      bar.appendChild(b);
    }

    bar.appendChild(Object.assign(document.createElement('span'), { className: 'sep' }));

    for (const c of ANNOT_COLORS) {
      const b = document.createElement('button');
      b.className = 'swatch' + (this.color === c ? ' on' : '');
      b.style.background = c;
      b.title = 'Cor';
      b.onclick = (e) => {
        e.stopPropagation();
        this.color = c;
        Settings.set('annotColor', c);
        onChange();
      };
      bar.appendChild(b);
    }

    bar.appendChild(Object.assign(document.createElement('span'), { className: 'sep' }));

    const clear = document.createElement('button');
    clear.innerHTML = icon('trash', 16);
    clear.title = 'Apagar tudo';
    clear.onclick = (e) => { e.stopPropagation(); this.clear(targetId); };
    bar.appendChild(clear);

    const close = document.createElement('button');
    close.innerHTML = icon('x', 16);
    close.title = 'Sair do modo caneta';
    close.onclick = (e) => { e.stopPropagation(); this.setActive(null); onChange(); };
    bar.appendChild(close);

    return bar;
  },
};

window.Annot = Annot;
window.ANNOT_COLORS = ANNOT_COLORS;
