import React, { useEffect, useRef, useState } from "react";

const WIDTH = 960;
const HEIGHT = 640;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;
const ARENA_R = 258;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function len(x, y) {
  return Math.hypot(x, y);
}

function normalize(x, y) {
  const l = len(x, y) || 1;
  return { x: x / l, y: y / l, l };
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

function distPointToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(px - ax, py - ay);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(px - bx, py - by);
  const t = c1 / c2;
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function worldToScreen(x, y) {
  return { x: CX + x, y: CY + y };
}

function makeGame() {
  return {
    running: true,
    over: false,
    wonMoment: false,
    time: 0,
    lastFrame: 0,
    lastUi: 0,
    score: 0,
    kills: 0,
    shots: 0,
    hits: 0,
    combo: 0,
    nextId: 2,
    spawnTimer: 0,
    cooldown: 0,
    shake: 0,
    keys: {},
    pointer: { x: 120, y: 0, active: false, down: false },
    player: {
      x: 0,
      y: 120,
      r: 14,
      speed: 238,
      aimX: 1,
      aimY: 0,
    },
    crocs: [
      {
        id: 1,
        x: -170,
        y: -70,
        angle: 0,
        hp: 5,
        maxHp: 5,
        alive: true,
        wobble: 0,
      },
    ],
    arrows: [],
    particles: [],
  };
}

function spawnCroc(g) {
  const alive = g.crocs.filter((c) => c.alive);
  let x;
  let y;
  let angle;

  if (alive.length > 0) {
    const tail = alive[alive.length - 1];
    angle = tail.angle;
    x = tail.x - Math.cos(tail.angle) * 70;
    y = tail.y - Math.sin(tail.angle) * 70;
    const d = len(x, y);
    if (d > ARENA_R - 38) {
      x *= (ARENA_R - 38) / d;
      y *= (ARENA_R - 38) / d;
    }
  } else {
    const a = Math.random() * Math.PI * 2;
    x = Math.cos(a) * (ARENA_R - 50);
    y = Math.sin(a) * (ARENA_R - 50);
    angle = a + Math.PI;
  }

  g.crocs.push({
    id: g.nextId++,
    x,
    y,
    angle,
    hp: 5,
    maxHp: 5,
    alive: true,
    wobble: Math.random() * 10,
  });
}

function burst(g, x, y, count = 12, force = 120, type = "spark") {
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const speed = force * (0.35 + Math.random() * 0.8);
    g.particles.push({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: 0.35 + Math.random() * 0.55,
      maxLife: 0.9,
      r: 2 + Math.random() * 4,
      type,
    });
  }
}

function fireArrow(g) {
  if (g.over || g.cooldown > 0) return;
  const p = g.player;
  const aim = normalize(p.aimX, p.aimY);
  g.arrows.push({
    x: p.x + aim.x * 22,
    y: p.y + aim.y * 22,
    vx: aim.x * 520,
    vy: aim.y * 520,
    angle: Math.atan2(aim.y, aim.x),
    life: 1.35,
  });
  g.cooldown = 0.32;
  g.shots += 1;
}

function updateGame(g, dt) {
  if (g.over) {
    g.shake = Math.max(0, g.shake - dt * 8);
    return;
  }

  g.time += dt;
  g.cooldown = Math.max(0, g.cooldown - dt);
  g.shake = Math.max(0, g.shake - dt * 7);

  const p = g.player;
  let mx = 0;
  let my = 0;

  if (g.keys.ArrowUp || g.keys.w || g.keys.W) my -= 1;
  if (g.keys.ArrowDown || g.keys.s || g.keys.S) my += 1;
  if (g.keys.ArrowLeft || g.keys.a || g.keys.A) mx -= 1;
  if (g.keys.ArrowRight || g.keys.d || g.keys.D) mx += 1;

  if (mx === 0 && my === 0 && g.pointer.down) {
    const toPointer = normalize(g.pointer.x - p.x, g.pointer.y - p.y);
    if (toPointer.l > 16) {
      mx = toPointer.x;
      my = toPointer.y;
    }
  }

  const move = normalize(mx, my);
  if (mx !== 0 || my !== 0) {
    p.x += move.x * p.speed * dt;
    p.y += move.y * p.speed * dt;
  }

  if (g.pointer.active) {
    const aim = normalize(g.pointer.x - p.x, g.pointer.y - p.y);
    if (aim.l > 8) {
      p.aimX = aim.x;
      p.aimY = aim.y;
    }
  } else if (mx !== 0 || my !== 0) {
    p.aimX = move.x;
    p.aimY = move.y;
  }

  const pd = len(p.x, p.y);
  if (pd > ARENA_R - p.r - 4) {
    p.x *= (ARENA_R - p.r - 4) / pd;
    p.y *= (ARENA_R - p.r - 4) / pd;
  }

  const alive = g.crocs.filter((c) => c.alive);
  g.spawnTimer += dt;
  const spawnEvery = clamp(5.5 - g.time * 0.035, 2.15, 5.5);
  if (g.spawnTimer >= spawnEvery) {
    g.spawnTimer = 0;
    spawnCroc(g);
  }

  const chain = g.crocs.filter((c) => c.alive);
  const leaderSpeed = 98 + Math.min(78, g.time * 1.8) + chain.length * 2.4;
  const spacing = 58;

  chain.forEach((c, index) => {
    c.wobble += dt * (4.5 + index * 0.08);
    let tx;
    let ty;
    let speed;

    if (index === 0) {
      tx = p.x;
      ty = p.y;
      speed = leaderSpeed;
    } else {
      const prev = chain[index - 1];
      tx = prev.x - Math.cos(prev.angle) * spacing;
      ty = prev.y - Math.sin(prev.angle) * spacing;
      speed = leaderSpeed * 1.16;
    }

    const dx = tx - c.x;
    const dy = ty - c.y;
    const d = Math.hypot(dx, dy) || 1;
    const desiredAngle = Math.atan2(dy, dx);
    c.angle = lerpAngle(c.angle, desiredAngle, clamp(dt * 6, 0, 1));

    if (d > 2) {
      const step = Math.min(d, speed * dt);
      c.x += (dx / d) * step;
      c.y += (dy / d) * step;
    }

    const cd = len(c.x, c.y);
    if (cd > ARENA_R - 22) {
      c.x *= (ARENA_R - 22) / cd;
      c.y *= (ARENA_R - 22) / cd;
    }
  });

  const nextArrows = [];
  for (const arrow of g.arrows) {
    arrow.life -= dt;
    arrow.x += arrow.vx * dt;
    arrow.y += arrow.vy * dt;

    let consumed = false;
    if (len(arrow.x, arrow.y) > ARENA_R - 4 || arrow.life <= 0) {
      consumed = true;
    }

    if (!consumed) {
      for (const c of g.crocs) {
        if (!c.alive) continue;
        const ca = Math.cos(c.angle);
        const sa = Math.sin(c.angle);
        const ax = c.x + ca * 26;
        const ay = c.y + sa * 26;
        const bx = c.x - ca * 34;
        const by = c.y - sa * 34;
        const bodyHit = distPointToSegment(arrow.x, arrow.y, ax, ay, bx, by) < 17;
        if (bodyHit) {
          c.hp -= 1;
          g.hits += 1;
          g.score += 15;
          g.combo += 1;
          consumed = true;
          burst(g, arrow.x, arrow.y, 8, 95, "spark");
          if (c.hp <= 0) {
            c.alive = false;
            g.kills += 1;
            g.score += 120 + g.combo * 5;
            g.shake = 0.65;
            burst(g, c.x, c.y, 26, 160, "croc");
          }
          break;
        }
      }
    }

    if (!consumed) nextArrows.push(arrow);
  }
  g.arrows = nextArrows;

  for (const c of g.crocs) {
    if (!c.alive) continue;
    const ca = Math.cos(c.angle);
    const sa = Math.sin(c.angle);
    const headX = c.x + ca * 26;
    const headY = c.y + sa * 26;
    const tailX = c.x - ca * 36;
    const tailY = c.y - sa * 36;
    const body = distPointToSegment(p.x, p.y, headX, headY, tailX, tailY);
    const head = Math.hypot(p.x - headX, p.y - headY);
    if (body < p.r + 14 || head < p.r + 16) {
      g.over = true;
      g.running = false;
      g.shake = 1;
      burst(g, p.x, p.y, 34, 200, "bite");
      break;
    }
  }

  const nextParticles = [];
  for (const particle of g.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.985;
    particle.vy *= 0.985;
    if (particle.life > 0) nextParticles.push(particle);
  }
  g.particles = nextParticles;
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawArena(ctx, g) {
  ctx.save();

  const shakeX = (Math.random() - 0.5) * g.shake * 7;
  const shakeY = (Math.random() - 0.5) * g.shake * 7;
  ctx.translate(shakeX, shakeY);

  ctx.shadowColor = "rgba(15, 23, 42, 0.16)";
  ctx.shadowBlur = 38;
  ctx.shadowOffsetY = 22;
  ctx.beginPath();
  ctx.arc(CX, CY, ARENA_R + 14, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.86)";
  ctx.fill();
  ctx.shadowColor = "transparent";

  const arenaGradient = ctx.createRadialGradient(CX - 60, CY - 80, 40, CX, CY, ARENA_R);
  arenaGradient.addColorStop(0, "#fffaf0");
  arenaGradient.addColorStop(0.72, "#f3e2bd");
  arenaGradient.addColorStop(1, "#dfc28d");

  ctx.beginPath();
  ctx.arc(CX, CY, ARENA_R, 0, Math.PI * 2);
  ctx.fillStyle = arenaGradient;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(CX, CY, ARENA_R, 0, Math.PI * 2);
  ctx.clip();

  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = "#caa66a";
  ctx.lineWidth = 1;
  for (let r = 60; r < ARENA_R; r += 44) {
    ctx.beginPath();
    ctx.arc(CX, CY, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.lineTo(CX + Math.cos(a) * ARENA_R, CY + Math.sin(a) * ARENA_R);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(255,255,255,0.23)";
  for (let i = 0; i < 88; i += 1) {
    const a = (i * 2.399 + g.time * 0.03) % (Math.PI * 2);
    const r = 20 + ((i * 39) % (ARENA_R - 36));
    ctx.beginPath();
    ctx.arc(CX + Math.cos(a) * r, CY + Math.sin(a) * r, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.lineWidth = 15;
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.beginPath();
  ctx.arc(CX, CY, ARENA_R + 7, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(106, 78, 39, 0.33)";
  ctx.beginPath();
  ctx.arc(CX, CY, ARENA_R + 1, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawArrow(ctx, arrow) {
  const s = worldToScreen(arrow.x, arrow.y);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(arrow.angle);
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(56, 39, 25, 0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.lineTo(14, 0);
  ctx.stroke();

  ctx.fillStyle = "rgba(56, 39, 25, 0.95)";
  ctx.beginPath();
  ctx.moveTo(17, 0);
  ctx.lineTo(8, -5);
  ctx.lineTo(10, 0);
  ctx.lineTo(8, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCroc(ctx, c) {
  const s = worldToScreen(c.x, c.y);
  const hpRatio = Math.max(0, c.hp / c.maxHp);

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(c.angle);
  ctx.shadowColor = "rgba(9, 51, 35, 0.22)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 7;

  const bodyGradient = ctx.createLinearGradient(-38, -18, 34, 18);
  bodyGradient.addColorStop(0, "#2f7d4a");
  bodyGradient.addColorStop(0.55, "#42a568");
  bodyGradient.addColorStop(1, "#17643f");

  ctx.fillStyle = bodyGradient;
  ctx.beginPath();
  ctx.moveTo(-42, 0);
  ctx.quadraticCurveTo(-27, -15, 13, -15);
  ctx.quadraticCurveTo(42, -16, 45, 0);
  ctx.quadraticCurveTo(42, 16, 13, 15);
  ctx.quadraticCurveTo(-27, 15, -42, 0);
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.fillStyle = "#185b3a";
  ctx.beginPath();
  ctx.moveTo(-42, 0);
  ctx.lineTo(-65, -9);
  ctx.lineTo(-58, 0);
  ctx.lineTo(-65, 9);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.18)";
  for (let i = -24; i < 22; i += 13) {
    ctx.beginPath();
    ctx.ellipse(i, -2, 3.4, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#0f3f2a";
  ctx.beginPath();
  ctx.ellipse(34, 0, 18, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.arc(38, -6, 3.1, 0, Math.PI * 2);
  ctx.arc(38, 6, 3.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#061f17";
  ctx.beginPath();
  ctx.arc(39, -6, 1.35, 0, Math.PI * 2);
  ctx.arc(39, 6, 1.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(48 - i * 8, -14);
    ctx.lineTo(44 - i * 8, -7);
    ctx.lineTo(40 - i * 8, -14);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(48 - i * 8, 14);
    ctx.lineTo(44 - i * 8, 7);
    ctx.lineTo(40 - i * 8, 14);
    ctx.fill();
  }

  ctx.restore();

  const hpX = s.x - 23;
  const hpY = s.y - 34;
  ctx.save();
  drawRoundedRect(ctx, hpX, hpY, 46, 6, 4);
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fill();
  drawRoundedRect(ctx, hpX, hpY, 46 * hpRatio, 6, 4);
  ctx.fillStyle = hpRatio > 0.45 ? "#34c759" : "#ff9f0a";
  ctx.fill();
  ctx.restore();
}

function drawPlayer(ctx, g) {
  const p = g.player;
  const s = worldToScreen(p.x, p.y);
  const aimAngle = Math.atan2(p.aimY, p.aimX);

  ctx.save();
  ctx.strokeStyle = "rgba(0, 122, 255, 0.18)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 9]);
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(s.x + p.aimX * 58, s.y + p.aimY * 58);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(aimAngle);
  ctx.shadowColor = "rgba(0, 0, 0, 0.18)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 5;

  ctx.strokeStyle = "#7a4b24";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(11, 0, 16, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(32, 32, 35, 0.82)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(-8, 17);
  ctx.moveTo(0, 3);
  ctx.lineTo(-11, -14);
  ctx.stroke();

  ctx.fillStyle = "#007aff";
  ctx.beginPath();
  ctx.ellipse(0, 3, 9, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffe0b2";
  ctx.beginPath();
  ctx.arc(4, -13, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1d1d1f";
  ctx.beginPath();
  ctx.arc(7, -15, 2.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawParticles(ctx, g) {
  for (const p of g.particles) {
    const s = worldToScreen(p.x, p.y);
    const alpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (p.type === "croc") ctx.fillStyle = "#34c759";
    else if (p.type === "bite") ctx.fillStyle = "#ff453a";
    else ctx.fillStyle = "#ffcc00";
    ctx.beginPath();
    ctx.arc(s.x, s.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function renderGame(ctx, g) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, "#f5f5f7");
  bg.addColorStop(0.52, "#eef2ff");
  bg.addColorStop(1, "#f7efe2");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  drawArena(ctx, g);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(CX, CY, ARENA_R, 0, Math.PI * 2);
  ctx.clip();

  drawParticles(ctx, g);
  for (const arrow of g.arrows) drawArrow(ctx, arrow);

  const aliveCrocs = g.crocs.filter((c) => c.alive);
  for (let i = aliveCrocs.length - 1; i >= 0; i -= 1) drawCroc(ctx, aliveCrocs[i]);
  drawPlayer(ctx, g);

  ctx.restore();

  ctx.save();
  ctx.font = "600 13px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  ctx.fillStyle = "rgba(29,29,31,0.56)";
  ctx.textAlign = "center";
  ctx.fillText("斗兽场边界会把你挡回来，但鳄鱼身体碰到你就结束", CX, CY + ARENA_R + 34);
  ctx.restore();
}

export default function AppleCrocArenaGame() {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const gameRef = useRef(makeGame());
  const [ui, setUi] = useState({
    over: false,
    score: 0,
    kills: 0,
    crocs: 1,
    time: 0,
    shots: 0,
    hits: 0,
  });

  const syncUi = () => {
    const g = gameRef.current;
    setUi({
      over: g.over,
      score: g.score,
      kills: g.kills,
      crocs: g.crocs.filter((c) => c.alive).length,
      time: g.time,
      shots: g.shots,
      hits: g.hits,
    });
  };

  const reset = () => {
    gameRef.current = makeGame();
    syncUi();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let disposed = false;

    const resizeBacking = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(WIDTH * dpr);
      canvas.height = Math.floor(HEIGHT * dpr);
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resizeBacking();
    window.addEventListener("resize", resizeBacking);

    const keyDown = (event) => {
      const g = gameRef.current;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
        event.preventDefault();
      }
      if (event.key === " " || event.key === "Spacebar") fireArrow(g);
      if (event.key === "Enter" && g.over) reset();
      g.keys[event.key] = true;
    };

    const keyUp = (event) => {
      gameRef.current.keys[event.key] = false;
    };

    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);

    const loop = (now) => {
      if (disposed) return;
      const g = gameRef.current;
      const dt = g.lastFrame ? Math.min(0.033, (now - g.lastFrame) / 1000) : 0;
      g.lastFrame = now;

      updateGame(g, dt);
      renderGame(ctx, g);

      if (now - g.lastUi > 120) {
        g.lastUi = now;
        syncUi();
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resizeBacking);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  }, []);

  const getPointerWorld = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH - CX,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT - CY,
    };
  };

  const onPointerMove = (event) => {
    const p = getPointerWorld(event);
    const g = gameRef.current;
    g.pointer.x = p.x;
    g.pointer.y = p.y;
    g.pointer.active = true;
  };

  const onPointerDown = (event) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const p = getPointerWorld(event);
    const g = gameRef.current;
    g.pointer.x = p.x;
    g.pointer.y = p.y;
    g.pointer.active = true;
    g.pointer.down = true;
    fireArrow(g);
  };

  const onPointerUp = (event) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    gameRef.current.pointer.down = false;
  };

  const accuracy = ui.shots ? Math.round((ui.hits / ui.shots) * 100) : 0;

  return (
    <div className="min-h-screen w-full bg-[#f5f5f7] p-4 text-[#1d1d1f] sm:p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div className="flex flex-col justify-between gap-4 rounded-[2rem] border border-white/70 bg-white/70 p-5 shadow-[0_22px_70px_rgba(15,23,42,0.10)] backdrop-blur-2xl sm:flex-row sm:items-center">
          <div>
            <div className="mb-2 inline-flex rounded-full bg-black/5 px-3 py-1 text-xs font-semibold text-black/50">
              Apple-style mini game
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-4xl">鳄影斗兽场</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55 sm:text-base">
              你被困在圆形斗兽场中。鳄鱼会越来越多，并沿着头鳄的尾迹组成追击链。射中同一只鳄鱼 5 次即可击杀。
            </p>
          </div>
          <button
            onClick={reset}
            className="rounded-2xl bg-[#007aff] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:scale-[1.02] active:scale-[0.98]"
          >
            重新开始
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Stat label="分数" value={ui.score} />
          <Stat label="存活时间" value={`${ui.time.toFixed(1)}s`} />
          <Stat label="鳄鱼" value={ui.crocs} />
          <Stat label="击杀" value={ui.kills} />
          <Stat label="命中率" value={`${accuracy}%`} />
          <Stat label="箭矢" value={ui.shots} />
        </div>

        <div className="relative overflow-hidden rounded-[2.4rem] border border-white/80 bg-white/55 p-3 shadow-[0_30px_90px_rgba(15,23,42,0.16)] backdrop-blur-2xl">
          <canvas
            ref={canvasRef}
            width={WIDTH}
            height={HEIGHT}
            onPointerMove={onPointerMove}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="block aspect-[3/2] w-full touch-none rounded-[2rem] bg-white"
          />

          {ui.over && (
            <div className="absolute inset-3 flex items-center justify-center rounded-[2rem] bg-white/45 backdrop-blur-sm">
              <div className="w-[min(92%,420px)] rounded-[2rem] border border-white/90 bg-white/82 p-6 text-center shadow-2xl shadow-black/10 backdrop-blur-2xl">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-3xl">
                  🐊
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">你被鳄鱼吃掉了</h2>
                <p className="mt-2 text-sm leading-6 text-black/55">
                  本局得分 {ui.score}，击杀 {ui.kills} 只鳄鱼，坚持 {ui.time.toFixed(1)} 秒。
                </p>
                <button
                  onClick={reset}
                  className="mt-5 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:scale-[1.02] active:scale-[0.98]"
                >
                  再来一局
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-3 text-sm text-black/56 sm:grid-cols-3">
          <Hint title="移动" text="WASD 或方向键控制人物逃跑。按住鼠标/触屏也可朝目标方向移动。" />
          <Hint title="射击" text="鼠标移动瞄准，点击或按空格射箭。每只鳄鱼需要命中 5 次。" />
          <Hint title="规则" text="斗兽场边界不会致命，但碰到鳄鱼头部、身体或尾巴都会立刻失败。" />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-3xl border border-white/70 bg-white/70 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.07)] backdrop-blur-xl">
      <div className="text-xs font-semibold text-black/42">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function Hint({ title, text }) {
  return (
    <div className="rounded-3xl border border-white/70 bg-white/60 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
      <div className="font-semibold text-black/80">{title}</div>
      <p className="mt-1 leading-6">{text}</p>
    </div>
  );
}
