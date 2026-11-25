// Disegni cartoon in canvas: personaggi, oggetti, scenario.
const Art = (() => {
  const TAU = Math.PI * 2;

  function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); }
  function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
  function outline(ctx, w = 3) { ctx.lineWidth = w; ctx.strokeStyle = '#2b1a10'; ctx.stroke(); }

  function shadow(ctx, x, y, rx, ry) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ell(ctx, x, y, rx, ry); ctx.fill();
  }

  // ---------- CICCIO ----------
  // s: {dir: -1|1, t, moving, sprint, stun, eat (0..1), look:{x,y}}
  // Aspetto: barba scura, berretto di lana col pon pon, maglietta grigia con maniche nere,
  // jeans corti strappati, calzini bianchi e scarpe nere con la suola rossa.
  function ciccio(ctx, x, y, r, s) {
    const t = s.t || 0;
    const bob = s.moving ? Math.abs(Math.sin(t * (s.sprint ? 18 : 11))) * r * 0.08 : Math.sin(t * 2) * r * 0.02;
    const squash = 1 + (s.moving ? Math.sin(t * (s.sprint ? 36 : 22)) * 0.03 : 0);
    shadow(ctx, x, y + r * 0.95, r * 0.95, r * 0.3);
    ctx.save();
    ctx.translate(x, y - bob);
    ctx.scale(s.dir < 0 ? -1 : 1, 1);
    ctx.scale(1 / squash, squash);
    const SKIN = '#f3c3a0', BEARD = '#3a2619', TEE = '#555a63', SLEEVE = '#1d1e22', DENIM = '#7f9cc2';

    // gambe: jeans corti, calzini bianchi, scarpe nere con suola rossa
    const legSw = s.moving ? Math.sin(t * (s.sprint ? 18 : 11)) * r * 0.18 : 0;
    [[-0.36, legSw], [0.36, -legSw]].forEach(([lx, sw]) => {
      const px = lx * r + sw;
      ctx.fillStyle = SKIN; ctx.fillRect(px - r * 0.11, r * 0.7, r * 0.22, r * 0.18);
      ctx.fillStyle = '#fff'; ctx.fillRect(px - r * 0.11, r * 0.84, r * 0.22, r * 0.07);
      ctx.fillStyle = '#c8282d'; ell(ctx, px + r * 0.04, r * 0.99, r * 0.21, r * 0.09); ctx.fill();
      ctx.fillStyle = '#151515'; ell(ctx, px + r * 0.04, r * 0.94, r * 0.2, r * 0.1); ctx.fill(); outline(ctx, 2);
      ctx.fillStyle = '#fff'; circ(ctx, px + r * 0.06, r * 0.92, r * 0.03); ctx.fill();
    });

    // braccia: maniche nere raglan e mani
    const armSw = s.moving ? Math.sin(t * (s.sprint ? 18 : 11) + 1.5) * 0.5 : Math.sin(t * 3) * 0.1;
    [[-1, 0.4 + armSw], [1, -0.4 - armSw]].forEach(([side, rot]) => {
      ctx.save(); ctx.translate(side * r * 0.88, -r * 0.05); ctx.rotate(rot);
      ctx.fillStyle = SKIN; ell(ctx, 0, r * 0.36, r * 0.15, r * 0.2); ctx.fill(); outline(ctx, 2.5);
      ctx.fillStyle = SLEEVE; ell(ctx, 0, r * 0.12, r * 0.2, r * 0.24); ctx.fill(); outline(ctx, 2.5);
      if (side < 0) { ctx.fillStyle = '#111'; ctx.fillRect(-r * 0.14, r * 0.32, r * 0.28, r * 0.06); } // elastico al polso
      ctx.restore();
    });

    // corpo: maglietta grigia larga + jeans sotto
    ctx.save();
    ell(ctx, 0, 0, r, r * 0.95); ctx.clip();
    ctx.fillStyle = SKIN; ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.fillStyle = TEE; ctx.fillRect(-r, -r * 0.12, r * 2, r * 0.75);
    // spalle nere (raglan)
    ctx.fillStyle = SLEEVE;
    ctx.beginPath(); ctx.moveTo(-r, -r * 0.12); ctx.lineTo(-r * 0.45, -r * 0.12); ctx.lineTo(-r, r * 0.35); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(r, -r * 0.12); ctx.lineTo(r * 0.45, -r * 0.12); ctx.lineTo(r, r * 0.35); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ell(ctx, -r * 0.2, r * 0.25, r * 0.35, r * 0.2); ctx.fill();
    // jeans
    ctx.fillStyle = DENIM; ctx.fillRect(-r, r * 0.6, r * 2, r * 0.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.72); ctx.lineTo(-r * 0.3, r * 0.74); ctx.moveTo(-r * 0.48, r * 0.78); ctx.lineTo(-r * 0.32, r * 0.79);
    ctx.moveTo(r * 0.3, r * 0.75); ctx.lineTo(r * 0.5, r * 0.73); ctx.stroke();
    ctx.restore();
    ell(ctx, 0, 0, r, r * 0.95); outline(ctx, 3);
    // girocollo
    ctx.strokeStyle = SLEEVE; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, -r * 0.2, r * 0.32, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();

    // barba (attorno alla bocca e sulle guance)
    ctx.fillStyle = BEARD;
    ctx.beginPath();
    ctx.moveTo(-r * 0.72, -r * 0.45);
    ctx.quadraticCurveTo(-r * 0.75, r * 0.05, -r * 0.3, r * 0.08);
    ctx.quadraticCurveTo(0, r * 0.2, r * 0.32, r * 0.08);
    ctx.quadraticCurveTo(r * 0.78, r * 0.05, r * 0.75, -r * 0.45);
    ctx.quadraticCurveTo(r * 0.6, -r * 0.2, r * 0.35, -r * 0.28);
    ctx.quadraticCurveTo(0, -r * 0.36, -r * 0.33, -r * 0.28);
    ctx.quadraticCurveTo(-r * 0.6, -r * 0.2, -r * 0.72, -r * 0.45);
    ctx.closePath(); ctx.fill();
    // baffi
    ctx.beginPath(); ell(ctx, -r * 0.12, -r * 0.3, r * 0.2, r * 0.07, 0.15); ctx.fill();
    ell(ctx, r * 0.18, -r * 0.3, r * 0.2, r * 0.07, -0.15); ctx.fill();

    // guance rosse
    ctx.fillStyle = 'rgba(235,110,100,0.5)';
    ell(ctx, -r * 0.55, -r * 0.48, r * 0.13, r * 0.08); ctx.fill();
    ell(ctx, r * 0.6, -r * 0.48, r * 0.13, r * 0.08); ctx.fill();

    // occhi marroni
    const lx = s.look ? s.look.x : 1, ly = s.look ? s.look.y : 0;
    const EY = -r * 0.56;
    if (s.stun) {
      ctx.strokeStyle = '#2b1a10'; ctx.lineWidth = 2;
      [-0.28, 0.32].forEach(ex => {
        ctx.beginPath();
        for (let a = 0; a < 12; a += 0.3) {
          const rr = a * r * 0.011;
          const px = ex * r + Math.cos(a + t * 8) * rr, py = EY + Math.sin(a + t * 8) * rr;
          a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
      });
    } else {
      [-0.28, 0.32].forEach(ex => {
        ctx.fillStyle = '#fff'; ell(ctx, ex * r, EY, r * 0.15, r * 0.14); ctx.fill(); outline(ctx, 2);
        ctx.fillStyle = '#4a2c18';
        circ(ctx, ex * r + Math.abs(lx) * r * 0.05, EY + ly * r * 0.04, r * 0.08); ctx.fill();
        ctx.fillStyle = '#111'; circ(ctx, ex * r + Math.abs(lx) * r * 0.05, EY + ly * r * 0.04, r * 0.04); ctx.fill();
      });
      // sopracciglia folte
      ctx.strokeStyle = BEARD; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-r * 0.45, -r * 0.76); ctx.lineTo(-r * 0.13, -r * 0.71); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r * 0.5, -r * 0.76); ctx.lineTo(r * 0.18, -r * 0.71); ctx.stroke();
    }

    // bocca dentro la barba
    const open = s.eat ? 0.2 + Math.abs(Math.sin(t * 25)) * 0.16 : (s.moving ? 0.13 : 0.08 + Math.sin(t * 4) * 0.02);
    const MY = -r * 0.13;
    ctx.fillStyle = '#7a1f1f';
    ell(ctx, r * 0.03, MY, r * 0.24, r * open); ctx.fill(); outline(ctx, 2);
    ctx.save(); ell(ctx, r * 0.03, MY, r * 0.24, r * open); ctx.clip();
    ctx.fillStyle = '#fff'; ctx.fillRect(-r * 0.18, MY - r * open, r * 0.42, r * 0.06);
    ctx.fillStyle = '#e66'; ell(ctx, r * 0.03, MY + r * open, r * 0.14, r * 0.08); ctx.fill();
    ctx.restore();
    if (!s.stun) {
      const dl = (t * 0.8) % 1;
      ctx.fillStyle = 'rgba(160,210,255,0.9)';
      ell(ctx, r * 0.2, MY + r * open + dl * r * 0.2, r * 0.045, r * (0.05 + dl * 0.05)); ctx.fill();
    }

    // berretto di lana con risvolto a coste e pon pon
    const HAT = '#d1392f', HAT2 = '#a82a22';
    ctx.fillStyle = HAT;
    ctx.beginPath();
    ctx.moveTo(-r * 0.74, -r * 0.78);
    ctx.quadraticCurveTo(-r * 0.72, -r * 1.42, 0, -r * 1.45);
    ctx.quadraticCurveTo(r * 0.72, -r * 1.42, r * 0.74, -r * 0.78);
    ctx.closePath(); ctx.fill(); outline(ctx, 2.5);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(i * r * 0.22, -r * 0.92); ctx.quadraticCurveTo(i * r * 0.18, -r * 1.25, i * r * 0.1, -r * 1.4); ctx.stroke();
    }
    // risvolto
    ctx.fillStyle = HAT2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.8, -r * 0.72); ctx.quadraticCurveTo(0, -r * 0.88, r * 0.8, -r * 0.72);
    ctx.lineTo(r * 0.78, -r * 0.94); ctx.quadraticCurveTo(0, -r * 1.08, -r * 0.78, -r * 0.94);
    ctx.closePath(); ctx.fill(); outline(ctx, 2.5);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5;
    for (let i = -6; i <= 6; i++) {
      const xx = i * r * 0.12;
      ctx.beginPath(); ctx.moveTo(xx, -r * 0.78 - (1 - Math.abs(i) / 7) * r * 0.08); ctx.lineTo(xx, -r * 0.97 - (1 - Math.abs(i) / 7) * r * 0.08); ctx.stroke();
    }
    // pon pon che ondeggia
    const pp = s.moving ? Math.sin(t * (s.sprint ? 18 : 11)) * r * 0.06 : 0;
    ctx.fillStyle = '#f4f0e6';
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7;
      circ(ctx, pp + Math.cos(a) * r * 0.1, -r * 1.52 + Math.sin(a) * r * 0.1, r * 0.1); ctx.fill();
    }
    circ(ctx, pp, -r * 1.52, r * 0.15); ctx.fill(); outline(ctx, 2);

    // sudore in sprint
    if (s.sprint) {
      ctx.fillStyle = 'rgba(130,200,255,0.9)';
      for (let i = 0; i < 2; i++) {
        const k = (t * 3 + i * 0.5) % 1;
        ell(ctx, -r * (0.85 + k * 0.4), -r * (0.6 - k * 0.3) - i * r * 0.3, r * 0.06, r * 0.1); ctx.fill();
      }
    }
    ctx.restore();

    // stelline stordito
    if (s.stun) {
      for (let i = 0; i < 3; i++) {
        const a = t * 4 + i * TAU / 3;
        star(ctx, x + Math.cos(a) * r * 0.8, y - r * 1.6 + Math.sin(a) * r * 0.2, r * 0.16, '#ffd84a');
      }
    }
  }

  function star(ctx, x, y, r, col) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.45 : r;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fillStyle = col; ctx.fill(); outline(ctx, 1.5);
  }

  // ---------- TUK (tucano) ----------
  // s: {dir, t, moving, alpha, smoking}
  function tuki(ctx, x, y, r, s) {
    const t = s.t || 0;
    const hop = s.moving ? Math.abs(Math.sin(t * 14)) * r * 0.25 : Math.sin(t * 2.5) * r * 0.03;
    shadow(ctx, x, y + r * 0.85, r * 0.8 * (1 - hop / (r * 0.6)), r * 0.25);
    ctx.save();
    ctx.globalAlpha = s.alpha == null ? 1 : s.alpha;
    ctx.translate(x, y - hop);
    ctx.scale(s.dir < 0 ? -1 : 1, 1);

    // zampe
    ctx.strokeStyle = '#e88a1a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    const lg = s.moving ? Math.sin(t * 14) * r * 0.15 : 0;
    ctx.beginPath(); ctx.moveTo(-r * 0.2, r * 0.6); ctx.lineTo(-r * 0.25 + lg, r * 0.9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 0.15, r * 0.6); ctx.lineTo(r * 0.1 - lg, r * 0.9); ctx.stroke();

    // coda
    ctx.fillStyle = '#151515';
    ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.2); ctx.lineTo(-r * 1.25, r * 0.65); ctx.lineTo(-r * 1.05, r * 0.85); ctx.lineTo(-r * 0.45, r * 0.5); ctx.closePath();
    ctx.fill(); outline(ctx, 2);

    // corpo
    ctx.fillStyle = '#1b1b1b';
    ell(ctx, 0, r * 0.1, r * 0.75, r * 0.72); ctx.fill(); outline(ctx, 3);
    // pettorina bianco-gialla
    ctx.fillStyle = '#fff6d0';
    ell(ctx, r * 0.3, -r * 0.05, r * 0.38, r * 0.45, -0.3); ctx.fill();
    ctx.fillStyle = '#e53b2f';
    ell(ctx, r * 0.2, r * 0.48, r * 0.28, r * 0.1, -0.2); ctx.fill();

    // ala
    const flap = s.moving ? Math.sin(t * 20) * 0.6 : Math.sin(t * 2) * 0.1;
    ctx.save(); ctx.translate(-r * 0.15, r * 0.05); ctx.rotate(-0.3 + flap);
    ctx.fillStyle = '#0c0c0c'; ell(ctx, -r * 0.2, r * 0.15, r * 0.45, r * 0.25, 0.5); ctx.fill(); outline(ctx, 2);
    ctx.restore();

    // occhio con contorno azzurro
    ctx.fillStyle = '#4fc3f7'; circ(ctx, r * 0.28, -r * 0.35, r * 0.2); ctx.fill(); outline(ctx, 2);
    ctx.fillStyle = '#fff'; circ(ctx, r * 0.3, -r * 0.36, r * 0.11); ctx.fill();
    ctx.fillStyle = '#111'; circ(ctx, r * 0.34, -r * 0.36, r * 0.065); ctx.fill();
    // palpebra mezza chiusa da duro
    ctx.fillStyle = '#4fc3f7';
    ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.36, r * 0.12, Math.PI, TAU); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(r * 0.16, -r * 0.37); ctx.lineTo(r * 0.44, -r * 0.37); ctx.stroke();

    // becco enorme
    const g = ctx.createLinearGradient(r * 0.4, -r * 0.6, r * 1.7, -r * 0.1);
    g.addColorStop(0, '#9be05a'); g.addColorStop(0.25, '#ffd23a'); g.addColorStop(0.7, '#ff8c1a'); g.addColorStop(1, '#e53b2f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(r * 0.42, -r * 0.55);
    ctx.quadraticCurveTo(r * 1.3, -r * 0.75, r * 1.75, -r * 0.2);
    ctx.quadraticCurveTo(r * 1.2, -r * 0.05, r * 0.45, -r * 0.05);
    ctx.closePath(); ctx.fill(); outline(ctx, 2.5);
    ctx.strokeStyle = 'rgba(43,26,16,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(r * 0.48, -r * 0.26); ctx.quadraticCurveTo(r * 1.2, -r * 0.28, r * 1.7, -r * 0.2); ctx.stroke();
    ctx.fillStyle = '#111'; ell(ctx, r * 1.68, -r * 0.24, r * 0.08, r * 0.06); ctx.fill();

    // sigaretta
    ctx.save();
    ctx.translate(r * 0.95, -r * 0.15); ctx.rotate(0.35);
    ctx.fillStyle = '#f0f0f0'; ctx.fillRect(0, -r * 0.06, r * 0.65, r * 0.12);
    ctx.fillStyle = '#e09a4a'; ctx.fillRect(0, -r * 0.06, r * 0.18, r * 0.12);
    const glow = 0.6 + Math.sin(t * 9) * 0.4;
    ctx.fillStyle = `rgb(255,${Math.floor(80 + glow * 80)},30)`;
    ctx.fillRect(r * 0.6, -r * 0.06, r * 0.08, r * 0.12);
    ctx.fillStyle = 'rgba(255,140,40,' + (0.25 * glow) + ')';
    circ(ctx, r * 0.66, 0, r * 0.15); ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  // punta della sigaretta (per il fumo), in coordinate mondo
  function tukiCigTip(x, y, r, dir) {
    return { x: x + dir * r * 1.55, y: y - r * 0.0 };
  }

  // ---------- OGGETTI ----------
  function cigarette(ctx, x, y, t, scale = 1) {
    const b = Math.sin(t * 3 + x) * 3;
    ctx.save(); ctx.translate(x, y + b); ctx.scale(scale, scale);
    // alone
    ctx.fillStyle = 'rgba(255,240,150,0.35)'; circ(ctx, 0, 0, 20 + Math.sin(t * 5) * 2); ctx.fill();
    shadow(ctx, 0, 14 - b, 14, 4);
    ctx.rotate(-0.5);
    ctx.fillStyle = '#f7f7f7'; ctx.fillRect(-16, -4, 32, 8);
    ctx.strokeStyle = '#2b1a10'; ctx.lineWidth = 2; ctx.strokeRect(-16, -4, 32, 8);
    ctx.fillStyle = '#e09a4a'; ctx.fillRect(-16, -4, 10, 8);
    ctx.fillStyle = '#c47a30'; ctx.fillRect(-13, -2, 2, 2); ctx.fillRect(-10, 1, 2, 2);
    ctx.fillStyle = '#ff6a1a'; ctx.fillRect(13, -4, 3, 8);
    ctx.restore();
    // filo di fumo
    ctx.strokeStyle = 'rgba(200,200,200,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const py = y + b - 10 - i * 4, px = x + 12 + Math.sin(t * 4 + i) * 3;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
  }

  function snack(ctx, x, y, kind, t) {
    const b = Math.sin(t * 3 + y) * 2;
    shadow(ctx, x, y + 14, 15, 5);
    ctx.save(); ctx.translate(x, y + b);
    if (kind === 0) { // ciambella
      ctx.fillStyle = '#d99a52'; circ(ctx, 0, 0, 16); ctx.fill(); outline(ctx, 2);
      ctx.fillStyle = '#ff7fb5';
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
      const cols = ['#fff', '#4fc3f7', '#ffd23a', '#7ed957'];
      for (let i = 0; i < 10; i++) {
        const a = i * 2.4, rr = 9 + (i % 3);
        ctx.fillStyle = cols[i % 4]; ctx.fillRect(Math.cos(a) * rr - 1.5, Math.sin(a) * rr - 1, 3, 2);
      }
      ctx.fillStyle = '#5aa83a'; circ(ctx, 0, 0, 5); ctx.fill(); outline(ctx, 2);
    } else if (kind === 1) { // panino
      ctx.fillStyle = '#e0a050'; ell(ctx, 0, -5, 17, 10); ctx.fill(); outline(ctx, 2);
      ctx.fillStyle = '#5bc236'; ctx.fillRect(-18, 1, 36, 4);
      ctx.fillStyle = '#7a3e1d'; ctx.fillRect(-16, 4, 32, 5);
      ctx.fillStyle = '#ffd23a'; ctx.fillRect(-15, 2, 30, 2);
      ctx.fillStyle = '#d08a40'; ell(ctx, 0, 11, 16, 5); ctx.fill(); outline(ctx, 2);
      ctx.fillStyle = '#fff6d0';
      for (let i = -2; i <= 2; i++) { ell(ctx, i * 5, -9 + Math.abs(i), 1.5, 1); ctx.fill(); }
    } else { // pizza
      ctx.fillStyle = '#ffd36b';
      ctx.beginPath(); ctx.moveTo(0, 16); ctx.lineTo(-15, -12); ctx.quadraticCurveTo(0, -18, 15, -12); ctx.closePath();
      ctx.fill(); outline(ctx, 2);
      ctx.fillStyle = '#e8443a';
      circ(ctx, -4, -6, 3.5); ctx.fill(); circ(ctx, 5, -3, 3.5); ctx.fill(); circ(ctx, 0, 6, 3); ctx.fill();
      ctx.fillStyle = '#c47a30'; ctx.beginPath(); ctx.moveTo(-15, -12); ctx.quadraticCurveTo(0, -18, 15, -12); ctx.lineWidth = 5; ctx.strokeStyle = '#c47a30'; ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- SCENARIO ----------
  function palm(ctx, x, y, r, seed) {
    ctx.save(); ctx.translate(x, y);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = seed + i * TAU / n;
      ctx.save(); ctx.rotate(a);
      ctx.fillStyle = i % 2 ? '#2f8f3a' : '#3aa346';
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(r * 0.6, -r * 0.35, r * 1.15, 0);
      ctx.quadraticCurveTo(r * 0.6, r * 0.35, 0, 0);
      ctx.fill(); outline(ctx, 2);
      ctx.strokeStyle = 'rgba(20,60,20,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 1.1, 0); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = '#8a5a2b'; circ(ctx, 0, 0, r * 0.22); ctx.fill(); outline(ctx, 2);
    ctx.fillStyle = '#6b3f1a';
    circ(ctx, -r * 0.12, r * 0.1, r * 0.09); ctx.fill(); circ(ctx, r * 0.12, r * 0.08, r * 0.09); ctx.fill();
    ctx.restore();
  }

  function tree(ctx, x, y, r) {
    ctx.fillStyle = '#2d7a33'; circ(ctx, x, y, r); ctx.fill(); outline(ctx, 3);
    ctx.fillStyle = '#3c9a40';
    circ(ctx, x - r * 0.25, y - r * 0.25, r * 0.6); ctx.fill();
    ctx.fillStyle = '#56b852';
    circ(ctx, x - r * 0.35, y - r * 0.38, r * 0.3); ctx.fill();
    ctx.fillStyle = '#e8443a';
    circ(ctx, x + r * 0.4, y + r * 0.1, r * 0.09); ctx.fill();
    circ(ctx, x + r * 0.1, y + r * 0.45, r * 0.09); ctx.fill();
  }

  function rock(ctx, x, y, r) {
    ctx.fillStyle = '#8f8f9a';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8, rr = r * (0.88 + ((i * 37) % 10) / 60);
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill(); outline(ctx, 3);
    ctx.fillStyle = '#b4b4bf'; ell(ctx, x - r * 0.25, y - r * 0.3, r * 0.35, r * 0.2, -0.4); ctx.fill();
  }

  function bush(ctx, x, y, r, alpha, t) {
    ctx.save(); ctx.globalAlpha = alpha;
    const wob = Math.sin(t * 2 + x) * 1.5;
    ctx.fillStyle = '#1f7a2e';
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = i * TAU / 9;
      ctx.moveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
      ctx.arc(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.42 + wob, 0, TAU);
    }
    ctx.fill();
    ctx.fillStyle = '#2e9a3c'; circ(ctx, x, y, r * 0.72); ctx.fill();
    ctx.fillStyle = '#47b54d';
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3 + 0.5;
      circ(ctx, x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4, r * 0.18); ctx.fill();
    }
    ctx.fillStyle = '#ffeb7a';
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + 0.2; circ(ctx, x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, 3); ctx.fill();
    }
    ctx.restore();
  }

  function table(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x + 6, y + 8, w, h);
    ctx.fillStyle = '#a5683a'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#7a4a24'; ctx.lineWidth = 2;
    const horiz = w > h;
    const n = 4;
    for (let i = 1; i < n; i++) {
      ctx.beginPath();
      if (horiz) { ctx.moveTo(x, y + h * i / n); ctx.lineTo(x + w, y + h * i / n); }
      else { ctx.moveTo(x + w * i / n, y); ctx.lineTo(x + w * i / n, y + h); }
      ctx.stroke();
    }
    ctx.lineWidth = 3; ctx.strokeStyle = '#2b1a10'; ctx.strokeRect(x, y, w, h);
    // tovaglia a quadri
    ctx.fillStyle = 'rgba(230,60,50,0.85)';
    const cx = x + w / 2, cy = y + h / 2, s = Math.min(w, h) * 0.6;
    ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    const q = s / 4;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) ctx.fillRect(cx - s / 2 + i * q, cy - s / 2 + j * q, q, q);
  }

  // terreno pre-renderizzato
  function ground(W, H, rand) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#7cc45a'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(110,180,75,0.7)' : 'rgba(140,205,95,0.7)';
      const x = rand() * W, y = rand() * H, r = 40 + rand() * 110;
      g.beginPath(); g.ellipse(x, y, r, r * 0.6, rand() * 3, 0, TAU); g.fill();
    }
    // sentiero di sabbia
    g.strokeStyle = 'rgba(230,205,140,0.85)'; g.lineWidth = 70; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, H * 0.5);
    g.bezierCurveTo(W * 0.3, H * 0.15, W * 0.6, H * 0.9, W, H * 0.45); g.stroke();
    g.strokeStyle = 'rgba(210,180,115,0.5)'; g.lineWidth = 50; g.stroke();
    // ciuffi d'erba
    g.strokeStyle = 'rgba(50,120,40,0.7)'; g.lineWidth = 2;
    for (let i = 0; i < 700; i++) {
      const x = rand() * W, y = rand() * H;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y - 7); g.moveTo(x, y); g.lineTo(x + 2, y - 8); g.stroke();
    }
    // fiori
    const fc = ['#fff', '#ffeb7a', '#ff8fc8', '#ff7043'];
    for (let i = 0; i < 160; i++) {
      g.fillStyle = fc[i % 4];
      g.beginPath(); g.arc(rand() * W, rand() * H, 2.5, 0, TAU); g.fill();
    }
    // bordo: staccionata
    g.fillStyle = '#9a6a3a';
    for (let x = 0; x < W; x += 30) { g.fillRect(x, 0, 22, 18); g.fillRect(x, H - 18, 22, 18); }
    for (let y = 0; y < H; y += 30) { g.fillRect(0, y, 18, 22); g.fillRect(W - 18, y, 18, 22); }
    g.strokeStyle = '#2b1a10'; g.lineWidth = 4; g.strokeRect(2, 2, W - 4, H - 4);
    return c;
  }

  return { ciccio, tuki, tukiCigTip, cigarette, snack, palm, tree, rock, bush, table, ground, star, circ, ell };
})();
