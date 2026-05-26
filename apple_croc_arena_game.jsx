import React, { useEffect, useRef, useState } from "react";

const WIDTH = 960;
const HEIGHT = 640;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;
const ARENA_R = 258;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(x, y) {
  return Math.hypot(x, y);
}

function normalize(x, y) {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l, l };
}

function lerpAngle(a, b, t) {
  const d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
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
    over: false,
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
    pointer: { x: 120, y: 0, active: false },
    touch: {
      activePointers: new Map(),
      movePointerId: null,
      firePointerId: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      moveX: 0,
      moveY: 0,
      autoFire: false,
    },
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

function updateTouchMove(g) {
  const t = g.touch;
  const dx = t.currentX - t.startX;
  const dy = t.currentY - t.startY;
  const v = normalize(dx, dy);

  if (v.l < 8) {
    t.moveX = 0;
    t.moveY = 0;
    return;
  }

  const strength = clamp(v.l / 60, 0, 1);
  t.moveX = v.x * strength;
  t.moveY = v.y * strength;
  g.player.aimX = v.x;
  g.player.aimY = v.y;
}

function clearTouchMove(g) {
  const t = g.touch;
  t.movePointerId = null;
  t.startX = 0;
  t.startY = 0;
  t.currentX = 0;
  t.currentY = 0;
  t.moveX = 0;
  t.moveY = 0;
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
    const d = distance(x, y);
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

  if (g.touch.movePointerId !== null) {
    mx = g.touch.moveX;
    my = g.touch.moveY;
  }

  if (g.touch.autoFire) {
    fireArrow(g);
  }

  const move = normalize(mx, my);
  const isMoving = Math.abs(mx) > 0.001 || Math.abs(my) > 0.001;
  if (isMoving) {
    const strength = clamp(Math.hypot(mx, my), 0, 1);
    p.x += move.x * p.speed * strength * dt;
    p.y += move.y * p.speed * strength * dt;

    if (g.touch.movePointerId !== null) {
      p.aimX = move.x;
      p.aimY = move.y;
    }
  }

  if (g.pointer.active && g.touch.movePointerId === null) {
    const aim = normalize(g.pointer.x - p.x, g.pointer.y - p.y);
    if (aim.l > 8) {
      p.aimX = aim.x;
      p.aimY = aim.y;
    }
  }

  const pd = distance(p.x, p.y);
  if (pd > ARENA_R - p.r - 4) {
    p.x *= (ARENA_R - p.r - 4) / pd;
    p.y *= (ARENA_R - p.r - 4) / pd;
  }

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

    const cd = distance(c.x, c.y);
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
    if (distance(arrow.x, arrow.y) > ARENA_R - 4 || arrow.life <= 0) {
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

function roundedRect(ctx, x, y, w, h, r) {
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
  const shakeX = (Math.random() - 0.5) * g.shake * 7;
  const shakeY = (Math.random() - 0.5) * g.shake * 7;
  ctx.save();
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

  ctx.restore();

  ctx.save();
  roundedRect(ctx, s.x - 23, s.y - 34, 46, 6, 4);
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fill();
  roundedRect(ctx, s.x - 23, s.y - 34, 46 * hpRatio, 6, 4);
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

function drawVirtualJoystick(ctx, g) {
  const t = g.touch;
  if (t.movePointerId === null) return;

  const base = worldToScreen(t.startX, t.startY);
  const knob = worldToScreen(t.currentX, t.currentY);
  const dx = knob.x - base.x;
  const dy = knob.y - base.y;
  const d = Math.hypot(dx, dy) || 1;
  const maxR = 54;
  const kx = base.x + (dx / d) * Math.min(d, maxR);
  const ky = base.y + (dy / d) * Math.min(d, maxR);

  ctx.save();
  ctx.globalAlpha = 0.76;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0, 122, 255, 0.32)";
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.beginPath();
  ctx.arc(base.x, base.y, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(0, 122, 255, 0.28)";
  ctx.beginPath();
  ctx.arc(kx, ky, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function renderGame(ctx, g) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, "#f5f5f7");
  bg.addColorStop(0.52, "#eef2ff");
  bg.addColorStop(1, "#f7efe2");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawArena(ctx, g);

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

  drawVirtualJoystick(ctx, g);

  ctx.save();
  ctx.font = "600 13px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  ctx.fillStyle = "rgba(29,29,31,0.46)";
  ctx.textAlign = "center";
  ctx.fillText("单指拖动移动，第二根手指射箭", CX, CY + ARENA_R + 34);
  ctx.restore();
}

const styles = `
:root {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", sans-serif;
  color: #1d1d1f;
  background: #f5f5f7;
}

html,
body,
#root {
  margin: 0;
  width: 100%;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
  overscroll-behavior: none;
  -webkit-overflow-scrolling: auto;
}

* {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

button,
canvas,
.game-page,
.game-shell,
.game-header,
.game-stats,
.game-stage-wrap,
.game-stage,
.game-canvas,
.game-help {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.game-page,
.game-stage,
.game-canvas,
canvas {
  touch-action: none;
  overscroll-behavior: contain;
}

button {
  font: inherit;
}

.game-page {
  min-height: 100svh;
  width: 100%;
  display: flex;
  overflow: hidden;
  background:
    radial-gradient(circle at 12% 0%, rgba(0, 122, 255, 0.16), transparent 30%),
    radial-gradient(circle at 88% 10%, rgba(255, 149, 0, 0.16), transparent 30%),
    linear-gradient(135deg, #f5f5f7 0%, #eef2ff 52%, #f7efe2 100%);
}

.game-shell {
  width: 100%;
  max-width: 1120px;
  height: 100svh;
  margin: 0 auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

.game-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.70);
  box-shadow: 0 18px 56px rgba(15, 23, 42, 0.10);
  backdrop-filter: blur(24px);
}

.game-kicker {
  display: inline-flex;
  margin-bottom: 5px;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.48);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.game-title {
  margin: 0;
  color: #111114;
  font-size: clamp(26px, 3.5vw, 40px);
  line-height: 1;
  font-weight: 800;
  letter-spacing: -0.05em;
}

.game-subtitle {
  margin: 7px 0 0;
  max-width: 760px;
  color: rgba(0, 0, 0, 0.56);
  font-size: 14px;
  line-height: 1.45;
  font-weight: 500;
}

.subtitle-short {
  display: none;
}

.restart-button {
  flex: 0 0 auto;
  border: 0;
  border-radius: 18px;
  padding: 11px 16px;
  color: white;
  background: #007aff;
  box-shadow: 0 12px 24px rgba(0, 122, 255, 0.25);
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

.restart-button:active {
  transform: scale(0.98);
}

.game-stats {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}

.stat-card {
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 20px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.68);
  box-shadow: 0 12px 34px rgba(15, 23, 42, 0.07);
  backdrop-filter: blur(18px);
}

.stat-label {
  color: rgba(0, 0, 0, 0.42);
  font-size: 11px;
  line-height: 1;
  font-weight: 800;
}

.stat-value {
  margin-top: 5px;
  color: #111114;
  font-size: 21px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.game-stage-wrap {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.game-stage {
  position: relative;
  width: min(100%, 960px, 118svh);
  aspect-ratio: 3 / 2;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 34px;
  background: rgba(255, 255, 255, 0.55);
  box-shadow: 0 30px 90px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(24px);
}

.game-canvas {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
  border: 0;
  background: #f5f5f7;
}

.game-help {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  color: rgba(0, 0, 0, 0.56);
  font-size: 12px;
  line-height: 1.35;
}

.help-item {
  border: 1px solid rgba(255, 255, 255, 0.70);
  border-radius: 18px;
  padding: 9px 11px;
  background: rgba(255, 255, 255, 0.56);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
  backdrop-filter: blur(16px);
}

.help-title {
  color: rgba(0, 0, 0, 0.82);
  font-weight: 800;
}

.game-over-backdrop {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: rgba(255, 255, 255, 0.40);
  backdrop-filter: blur(7px);
}

.game-over-panel {
  width: min(92%, 420px);
  border: 1px solid rgba(255, 255, 255, 0.90);
  border-radius: 30px;
  padding: 24px;
  text-align: center;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(28px);
}

.game-over-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin: 0 auto 12px;
  border-radius: 18px;
  background: rgba(255, 69, 58, 0.10);
  font-size: 30px;
}

.game-over-title {
  margin: 0;
  font-size: 25px;
  font-weight: 850;
  letter-spacing: -0.04em;
}

.game-over-text {
  margin: 9px 0 0;
  color: rgba(0, 0, 0, 0.58);
  font-size: 14px;
  line-height: 1.5;
  font-weight: 500;
}

@media (max-width: 768px) {
  .game-shell {
    height: 100svh;
    padding: 8px;
    gap: 6px;
  }

  .game-header {
    padding: 9px 10px;
    border-radius: 22px;
    gap: 8px;
  }

  .game-kicker {
    display: none;
  }

  .game-title {
    font-size: 22px;
    line-height: 1.06;
    letter-spacing: -0.045em;
  }

  .game-subtitle {
    margin-top: 3px;
    font-size: 12px;
    line-height: 1.2;
  }

  .subtitle-full {
    display: none;
  }

  .subtitle-short {
    display: inline;
  }

  .restart-button {
    border-radius: 14px;
    padding: 8px 10px;
    font-size: 12px;
    white-space: nowrap;
  }

  .game-stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }

  .mobile-hide {
    display: none;
  }

  .stat-card {
    border-radius: 14px;
    padding: 7px 8px;
  }

  .stat-label {
    font-size: 10px;
  }

  .stat-value {
    margin-top: 4px;
    font-size: 15px;
    line-height: 1;
  }

  .game-stage {
    width: min(100%, 102svh);
    border-radius: 24px;
  }

  .game-help {
    grid-template-columns: 1fr;
    gap: 0;
    font-size: 11px;
    line-height: 1.25;
  }

  .help-item {
    padding: 7px 9px;
    border-radius: 14px;
  }

  .desktop-help {
    display: none;
  }

  .game-over-panel {
    border-radius: 24px;
    padding: 18px;
  }

  .game-over-title {
    font-size: 22px;
  }
}
`;

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

  const isTouch = (event) => event.pointerType === "touch";

  const handlePointerDown = (event) => {
    const canvas = event.currentTarget;
    canvas.setPointerCapture?.(event.pointerId);

    const p = getPointerWorld(event);
    const g = gameRef.current;

    if (isTouch(event)) {
      event.preventDefault();
      const t = g.touch;
      t.activePointers.set(event.pointerId, p);

      if (t.movePointerId === null) {
        t.movePointerId = event.pointerId;
        t.startX = p.x;
        t.startY = p.y;
        t.currentX = p.x;
        t.currentY = p.y;
        t.moveX = 0;
        t.moveY = 0;
        return;
      }

      if (t.firePointerId === null && event.pointerId !== t.movePointerId) {
        t.firePointerId = event.pointerId;
        t.autoFire = true;
        fireArrow(g);
      }
      return;
    }

    g.pointer.x = p.x;
    g.pointer.y = p.y;
    g.pointer.active = true;
    fireArrow(g);
  };

  const handlePointerMove = (event) => {
    const p = getPointerWorld(event);
    const g = gameRef.current;

    if (isTouch(event)) {
      event.preventDefault();
      const t = g.touch;
      t.activePointers.set(event.pointerId, p);

      if (event.pointerId === t.movePointerId) {
        t.currentX = p.x;
        t.currentY = p.y;
        updateTouchMove(g);
      }
      return;
    }

    g.pointer.x = p.x;
    g.pointer.y = p.y;
    g.pointer.active = true;
  };

  const handlePointerUp = (event) => {
    const g = gameRef.current;

    if (isTouch(event)) {
      event.preventDefault();
      const t = g.touch;
      t.activePointers.delete(event.pointerId);

      if (event.pointerId === t.movePointerId) {
        clearTouchMove(g);
      }

      if (event.pointerId === t.firePointerId) {
        t.firePointerId = null;
        t.autoFire = false;
      }
      return;
    }

    g.pointer.active = false;
  };

  const accuracy = ui.shots ? Math.round((ui.hits / ui.shots) * 100) : 0;

  return (
    <div className="game-page">
      <style>{styles}</style>
      <div className="game-shell">
        <header className="game-header">
          <div>
            <div className="game-kicker">Apple-style mini game</div>
            <h1 className="game-title">鳄影斗兽场</h1>
            <p className="game-subtitle">
              <span className="subtitle-full">
                你被困在圆形斗兽场中。鳄鱼会越来越多，并沿着头鳄的尾迹组成追击链。射中同一只鳄鱼 5 次即可击杀。
              </span>
              <span className="subtitle-short">逃离鳄鱼，5箭击杀一只。</span>
            </p>
          </div>
          <button className="restart-button" onClick={reset} type="button">
            重新开始
          </button>
        </header>

        <section className="game-stats" aria-label="游戏状态">
          <Stat label="分数" value={ui.score} />
          <Stat label="时间" value={`${ui.time.toFixed(1)}s`} />
          <Stat label="鳄鱼" value={ui.crocs} />
          <Stat label="击杀" value={ui.kills} />
          <Stat label="命中" value={`${accuracy}%`} className="mobile-hide" />
          <Stat label="箭矢" value={ui.shots} className="mobile-hide" />
        </section>

        <main className="game-stage-wrap">
          <div className="game-stage">
            <canvas
              ref={canvasRef}
              className="game-canvas"
              width={WIDTH}
              height={HEIGHT}
              tabIndex={-1}
              onContextMenu={(event) => event.preventDefault()}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />

            {ui.over && (
              <div className="game-over-backdrop">
                <div className="game-over-panel">
                  <div className="game-over-icon">🐊</div>
                  <h2 className="game-over-title">你被鳄鱼吃掉了</h2>
                  <p className="game-over-text">
                    本局得分 {ui.score}，击杀 {ui.kills} 只鳄鱼，坚持 {ui.time.toFixed(1)} 秒。
                  </p>
                  <button className="restart-button" onClick={reset} type="button">
                    再来一局
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>

        <footer className="game-help">
          <div className="help-item">
            <span className="help-title">手机：</span>单指拖动移动，第二根手指点击或按住射箭。
          </div>
          <div className="help-item desktop-help">
            <span className="help-title">电脑：</span>WASD / 方向键移动，鼠标瞄准，点击或空格射箭。
          </div>
          <div className="help-item desktop-help">
            <span className="help-title">规则：</span>碰到鳄鱼头部、身体或尾巴都会失败。
          </div>
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, value, className = "" }) {
  return (
    <div className={`stat-card ${className}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

