(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const screens = [...document.querySelectorAll(".screen")];
  const canvas = $("#game-canvas");
  const ctx = canvas.getContext("2d");
  const config = window.MCRUN_CONFIG || {};

  const ui = {
    home: $("#screen-home"),
    game: $("#screen-game"),
    gameover: $("#screen-gameover"),
    leaderboard: $("#screen-leaderboard"),
    name: $("#player-name"),
    store: $("#store-number"),
    score: $("#score-label"),
    best: $("#best-label"),
    countdown: $("#countdown"),
    pauseOverlay: $("#pause-overlay"),
    finalScore: $("#final-score"),
    resultTitle: $("#result-title"),
    resultSummary: $("#result-summary"),
    rankMessage: $("#rank-message"),
    leaderboardList: $("#leaderboard-list"),
    leaderboardStatus: $("#leaderboard-status"),
    milestoneBanner: $("#milestone-banner"),
    milestoneIcon: $("#milestone-icon"),
    milestoneKicker: $("#milestone-kicker"),
    milestoneTitle: $("#milestone-title"),
    milestoneCopy: $("#milestone-copy")
  };

  const storage = {
    scoresKey: "mcrun_scores_v2",
    nameKey: "mcrun_name_v2",
    storeKey: "mcrun_store_v2",
    soundKey: "mcrun_sound_v2"
  };

  const state = {
    running: false,
    paused: false,
    gameOver: false,
    score: 0,
    distance: 0,
    speed: 320,
    elapsed: 0,
    lastTime: 0,
    spawnTimer: 0,
    collectibleTimer: 0,
    powerTimer: 0,
    combo: 0,
    multiplier: 1,
    multiplierTime: 0,
    shieldTime: 0,
    sound: localStorage.getItem(storage.soundKey) !== "off",
    returnScreen: "home",
    activeLeaderboardTab: "device",
    backgroundOffset: 0,
    shake: 0,
    flash: 0,
    particles: [],
    obstacles: [],
    collectibles: [],
    powerups: [],
    reached50k: false,
    reached100k: false,
    milestoneTimer: null
  };

  const world = {
    width: 390,
    height: 680,
    groundY: 555,
    gravity: 2100
  };

  const player = {
    x: 65,
    y: 0,
    width: 54,
    height: 70,
    vy: 0,
    grounded: true,
    jumps: 0,
    squash: 0,
    blink: 0,
    runFrame: 0
  };

  let audioContext = null;

  function showScreen(id) {
    screens.forEach((screen) => screen.classList.toggle("active", screen.id === id));
  }

  function cleanName(value) {
    return String(value || "")
      .replace(/[^a-zA-Z0-9 ._\-]/g, "")
      .trim()
      .slice(0, 16) || "Guest";
  }

  function cleanStore(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 8);
  }

  function getLocalScores() {
    try {
      const raw = JSON.parse(localStorage.getItem(storage.scoresKey) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function saveLocalScore(entry) {
    const scores = getLocalScores();
    scores.push(entry);
    scores.sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt));
    localStorage.setItem(storage.scoresKey, JSON.stringify(scores.slice(0, 100)));
    return scores.findIndex((item) => item.id === entry.id) + 1;
  }

  function getBestScore() {
    return getLocalScores()[0]?.score || 0;
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    world.width = cssW;
    world.height = cssH;
    world.groundY = Math.max(420, cssH * 0.81);
  }

  function resetPlayer() {
    player.x = Math.max(45, world.width * 0.16);
    player.y = world.groundY - player.height;
    player.vy = 0;
    player.grounded = true;
    player.jumps = 0;
    player.squash = 0;
    player.runFrame = 0;
  }

  function resetGame() {
    state.running = false;
    state.paused = false;
    state.gameOver = false;
    state.score = 0;
    state.distance = 0;
    state.speed = 320;
    state.elapsed = 0;
    state.spawnTimer = 0.9;
    state.collectibleTimer = 1.1;
    state.powerTimer = 8;
    state.combo = 0;
    state.multiplier = 1;
    state.multiplierTime = 0;
    state.shieldTime = 0;
    state.backgroundOffset = 0;
    state.shake = 0;
    state.flash = 0;
    state.particles = [];
    state.obstacles = [];
    state.collectibles = [];
    state.powerups = [];
    state.reached50k = false;
    state.reached100k = false;
    if (state.milestoneTimer) clearTimeout(state.milestoneTimer);
    state.milestoneTimer = null;
    ui.milestoneBanner.classList.add("hidden");
    ui.milestoneBanner.classList.remove("legendary");
    resetPlayer();
    ui.score.textContent = "0";
    ui.best.textContent = String(getBestScore());
  }

  function ensureAudio() {
    if (!state.sound) return null;
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === "suspended") audioContext.resume();
    return audioContext;
  }

  function tone(frequency, duration = 0.08, type = "sine", gain = 0.05, endFrequency = null) {
    const ac = ensureAudio();
    if (!ac) return;
    const osc = ac.createOscillator();
    const vol = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ac.currentTime);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, ac.currentTime + duration);
    vol.gain.setValueAtTime(gain, ac.currentTime);
    vol.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
    osc.connect(vol).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + duration);
  }

  function soundJump(second = false) {
    tone(second ? 520 : 420, 0.1, "square", 0.035, second ? 760 : 620);
  }
  function soundCollect() {
    tone(700, 0.07, "sine", 0.045, 980);
    setTimeout(() => tone(980, 0.06, "sine", 0.035, 1250), 35);
  }
  function soundCrash() {
    tone(140, 0.34, "sawtooth", 0.07, 55);
  }
  function soundPower() {
    tone(420, 0.12, "triangle", 0.05, 840);
    setTimeout(() => tone(680, 0.18, "triangle", 0.04, 1200), 80);
  }

  function soundMilestone(legendary = false) {
    const notes = legendary ? [523, 659, 784, 1047] : [440, 554, 659, 880];
    notes.forEach((note, index) => {
      setTimeout(() => tone(note, 0.18, "triangle", 0.05, note * 1.08), index * 95);
    });
  }

  function showMilestone(points) {
    const legendary = points >= 100000;
    ui.milestoneIcon.textContent = legendary ? "🏆" : "🎉";
    ui.milestoneKicker.textContent = legendary ? "LEGENDARY RUN" : "MILESTONE UNLOCKED";
    ui.milestoneTitle.textContent = "Congratulations!";
    ui.milestoneCopy.textContent = `You reached ${points.toLocaleString()} points!`;
    ui.milestoneBanner.classList.toggle("legendary", legendary);
    ui.milestoneBanner.classList.remove("hidden");
    soundMilestone(legendary);
    addParticles(world.width / 2, world.height * 0.34, legendary ? "⭐" : "✨", legendary ? 28 : 18);
    if (state.milestoneTimer) clearTimeout(state.milestoneTimer);
    state.milestoneTimer = setTimeout(() => {
      ui.milestoneBanner.classList.add("hidden");
      ui.milestoneBanner.classList.remove("legendary");
      state.milestoneTimer = null;
    }, legendary ? 3200 : 2600);
  }

  function checkMilestones() {
    const score = Math.floor(state.score);
    if (score >= 100000 && !state.reached100k) {
      state.reached100k = true;
      state.reached50k = true;
      showMilestone(100000);
    } else if (score >= 50000 && !state.reached50k) {
      state.reached50k = true;
      showMilestone(50000);
    }
  }

  function addParticles(x, y, emoji = null, count = 8) {
    for (let i = 0; i < count; i += 1) {
      state.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 240,
        vy: -80 - Math.random() * 220,
        life: 0.55 + Math.random() * 0.45,
        maxLife: 1,
        size: 4 + Math.random() * 7,
        emoji
      });
    }
  }

  function jump() {
    if (!state.running || state.paused || state.gameOver) return;
    ensureAudio();
    if (player.grounded) {
      player.vy = -760;
      player.grounded = false;
      player.jumps = 1;
      player.squash = -0.12;
      soundJump(false);
    } else if (player.jumps < 2) {
      player.vy = -630;
      player.jumps = 2;
      soundJump(true);
      addParticles(player.x + player.width / 2, player.y + player.height, null, 4);
    }
  }

  function spawnObstacle() {
    const variants = [
      { type: "cone", w: 44, h: 54 },
      { type: "spill", w: 62, h: 23 },
      { type: "box", w: 55, h: 55 },
      { type: "cups", w: 55, h: 63 }
    ];
    const choice = variants[Math.floor(Math.random() * variants.length)];
    state.obstacles.push({
      ...choice,
      x: world.width + 40,
      y: world.groundY - choice.h,
      passed: false
    });
  }

  function spawnCollectible() {
    const items = [
      { emoji: "🍟", points: 25 },
      { emoji: "🍔", points: 40 },
      { emoji: "🥤", points: 30 },
      { emoji: "🍪", points: 20 }
    ];
    const item = items[Math.floor(Math.random() * items.length)];
    const high = Math.random() > 0.55;
    state.collectibles.push({
      ...item,
      x: world.width + 35,
      y: high ? world.groundY - 150 - Math.random() * 60 : world.groundY - 85,
      r: 20,
      bob: Math.random() * Math.PI * 2
    });
  }

  function spawnPowerup() {
    const item = Math.random() > 0.5
      ? { type: "double", emoji: "⭐", label: "2X" }
      : { type: "shield", emoji: "🛡️", label: "SAFE" };
    state.powerups.push({
      ...item,
      x: world.width + 45,
      y: world.groundY - 175 - Math.random() * 55,
      r: 24,
      bob: Math.random() * Math.PI * 2
    });
  }

  function intersectsRect(a, b, inset = 0) {
    return (
      a.x + inset < b.x + b.w - inset &&
      a.x + a.width - inset > b.x + inset &&
      a.y + inset < b.y + b.h - inset &&
      a.y + a.height - inset > b.y + inset
    );
  }

  function intersectsCircleRect(circle, rect) {
    const nearestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
    const nearestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));
    const dx = circle.x - nearestX;
    const dy = circle.y - nearestY;
    return dx * dx + dy * dy < circle.r * circle.r;
  }

  function update(dt) {
    if (!state.running || state.paused || state.gameOver) return;

    state.elapsed += dt;
    state.distance += state.speed * dt;
    state.speed = Math.min(650, 320 + state.elapsed * 5.3);
    state.backgroundOffset = (state.backgroundOffset + state.speed * dt * 0.35) % 500;
    state.score += dt * 11 * state.multiplier;
    state.spawnTimer -= dt;
    state.collectibleTimer -= dt;
    state.powerTimer -= dt;
    state.multiplierTime = Math.max(0, state.multiplierTime - dt);
    state.shieldTime = Math.max(0, state.shieldTime - dt);
    state.flash = Math.max(0, state.flash - dt * 2.5);
    state.shake = Math.max(0, state.shake - dt * 22);

    if (state.multiplierTime <= 0) state.multiplier = 1;

    player.vy += world.gravity * dt;
    player.y += player.vy * dt;
    player.runFrame += dt * (state.speed / 120);
    player.squash += (0 - player.squash) * Math.min(1, dt * 10);
    player.blink -= dt;
    if (player.blink < -Math.random() * 3) player.blink = 0.12;

    const floor = world.groundY - player.height;
    if (player.y >= floor) {
      if (!player.grounded && player.vy > 700) {
        player.squash = 0.18;
        addParticles(player.x + player.width / 2, world.groundY - 5, null, 5);
      }
      player.y = floor;
      player.vy = 0;
      player.grounded = true;
      player.jumps = 0;
    }

    if (state.spawnTimer <= 0) {
      spawnObstacle();
      const difficulty = Math.max(0.7, 1.35 - state.elapsed * 0.006);
      state.spawnTimer = difficulty + Math.random() * 0.75;
    }

    if (state.collectibleTimer <= 0) {
      spawnCollectible();
      state.collectibleTimer = 1.25 + Math.random() * 1.45;
    }

    if (state.powerTimer <= 0) {
      spawnPowerup();
      state.powerTimer = 10 + Math.random() * 8;
    }

    const playerBox = { x: player.x + 8, y: player.y + 7, width: player.width - 16, height: player.height - 8 };

    for (const obstacle of state.obstacles) {
      obstacle.x -= state.speed * dt;
      if (!obstacle.passed && obstacle.x + obstacle.w < player.x) {
        obstacle.passed = true;
        state.combo += 1;
        state.score += 12 * state.multiplier;
      }
      if (intersectsRect(playerBox, obstacle, 5)) {
        if (state.shieldTime > 0) {
          obstacle.x = -200;
          state.shieldTime = 0;
          state.shake = 8;
          addParticles(obstacle.x, obstacle.y, "✨", 12);
          soundPower();
        } else {
          endGame();
          return;
        }
      }
    }

    for (const item of state.collectibles) {
      item.x -= state.speed * dt;
      item.bob += dt * 4;
      if (intersectsCircleRect({ x: item.x, y: item.y + Math.sin(item.bob) * 6, r: item.r }, playerBox)) {
        state.score += item.points * state.multiplier;
        state.combo += 1;
        item.x = -100;
        addParticles(item.x, item.y, item.emoji, 6);
        soundCollect();
      }
    }

    for (const power of state.powerups) {
      power.x -= state.speed * dt;
      power.bob += dt * 3;
      if (intersectsCircleRect({ x: power.x, y: power.y + Math.sin(power.bob) * 8, r: power.r }, playerBox)) {
        if (power.type === "double") {
          state.multiplier = 2;
          state.multiplierTime = 8;
        } else {
          state.shieldTime = 10;
        }
        power.x = -100;
        state.flash = 1;
        addParticles(power.x, power.y, "✨", 14);
        soundPower();
      }
    }

    for (const particle of state.particles) {
      particle.life -= dt;
      particle.vy += 480 * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }

    state.obstacles = state.obstacles.filter((o) => o.x > -120);
    state.collectibles = state.collectibles.filter((o) => o.x > -120);
    state.powerups = state.powerups.filter((o) => o.x > -120);
    state.particles = state.particles.filter((p) => p.life > 0);

    checkMilestones();
    ui.score.textContent = Math.floor(state.score).toLocaleString();
  }

  function roundRect(x, y, w, h, r, fill, stroke = null) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, world.height);
    sky.addColorStop(0, "#84d7ff");
    sky.addColorStop(0.55, "#dff5ff");
    sky.addColorStop(1, "#ffe89b");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, world.width, world.height);

    ctx.globalAlpha = 0.65;
    for (let i = -1; i < 5; i += 1) {
      const x = i * 190 - (state.backgroundOffset * 0.35) % 190;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x + 40, 100, 28, 0, Math.PI * 2);
      ctx.arc(x + 70, 90, 38, 0, Math.PI * 2);
      ctx.arc(x + 105, 105, 25, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const buildingY = world.groundY - 225;
    for (let i = -1; i < Math.ceil(world.width / 180) + 2; i += 1) {
      const x = i * 180 - (state.backgroundOffset % 180);
      roundRect(x, buildingY + 40, 148, 185, 10, i % 2 ? "#d74d57" : "#b63141");
      roundRect(x + 15, buildingY + 70, 55, 52, 5, "#b7e8f6");
      roundRect(x + 80, buildingY + 70, 53, 52, 5, "#b7e8f6");
      ctx.fillStyle = "#f9bf2f";
      ctx.fillRect(x + 58, buildingY + 15, 32, 55);
      ctx.beginPath();
      ctx.arc(x + 58, buildingY + 65, 29, Math.PI, 0);
      ctx.arc(x + 90, buildingY + 65, 29, Math.PI, 0);
      ctx.lineWidth = 12;
      ctx.strokeStyle = "#ffd42e";
      ctx.stroke();
    }

    ctx.fillStyle = "#5f4a3b";
    ctx.fillRect(0, world.groundY, world.width, world.height - world.groundY);
    ctx.fillStyle = "#846754";
    ctx.fillRect(0, world.groundY, world.width, 13);

    for (let i = -1; i < Math.ceil(world.width / 80) + 1; i += 1) {
      const x = i * 80 - ((state.backgroundOffset * 2.2) % 80);
      ctx.fillStyle = "rgba(255,255,255,.18)";
      ctx.fillRect(x, world.groundY + 52, 44, 5);
    }
  }

  function drawPlayer() {
    const x = player.x;
    const y = player.y;
    const bob = player.grounded ? Math.sin(player.runFrame) * 2 : 0;
    const sx = 1 + player.squash;
    const sy = 1 - player.squash;

    ctx.save();
    ctx.translate(x + player.width / 2, y + player.height / 2 + bob);
    ctx.scale(sx, sy);
    ctx.translate(-player.width / 2, -player.height / 2);

    const legSwing = player.grounded ? Math.sin(player.runFrame * 1.5) * 7 : 0;
    ctx.strokeStyle = "#272323";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(20, 56); ctx.lineTo(16 + legSwing, 69);
    ctx.moveTo(36, 56); ctx.lineTo(40 - legSwing, 69);
    ctx.stroke();

    roundRect(6, 8, 43, 54, 16, "#c8102e");
    roundRect(12, 16, 31, 22, 10, "#f1b688");
    ctx.fillStyle = "#1f1b1b";
    ctx.fillRect(12, 10, 31, 8);
    ctx.fillStyle = "#ffcf2f";
    ctx.fillRect(10, 7, 35, 8);

    ctx.fillStyle = "#1f1b1b";
    if (player.blink > 0) {
      ctx.fillRect(21, 26, 6, 2);
      ctx.fillRect(34, 26, 6, 2);
    } else {
      ctx.beginPath(); ctx.arc(23, 26, 2.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(36, 26, 2.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = "#6d3025";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(29.5, 30, 8, 0.15, Math.PI - 0.15);
    ctx.stroke();

    ctx.fillStyle = "white";
    ctx.font = "900 13px Inter";
    ctx.fillText("M", 21, 53);

    ctx.restore();

    if (state.shieldTime > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(70,160,255,${0.45 + Math.sin(state.elapsed * 8) * 0.2})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(x + player.width / 2, y + player.height / 2, 47, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawObstacle(o) {
    ctx.save();
    if (o.type === "cone") {
      ctx.fillStyle = "#ff7a1a";
      ctx.beginPath();
      ctx.moveTo(o.x + o.w / 2, o.y);
      ctx.lineTo(o.x + 4, o.y + o.h);
      ctx.lineTo(o.x + o.w - 4, o.y + o.h);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "white";
      ctx.fillRect(o.x + 10, o.y + 28, o.w - 20, 8);
      ctx.fillStyle = "#303030";
      ctx.fillRect(o.x, o.y + o.h - 7, o.w, 7);
    } else if (o.type === "spill") {
      ctx.fillStyle = "#5ebde1";
      ctx.beginPath();
      ctx.ellipse(o.x + 30, o.y + 12, 30, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#d7f5ff";
      ctx.beginPath(); ctx.arc(o.x + 18, o.y + 8, 5, 0, Math.PI * 2); ctx.fill();
    } else if (o.type === "box") {
      roundRect(o.x, o.y, o.w, o.h, 5, "#b9834f");
      ctx.strokeStyle = "#7d512f";
      ctx.lineWidth = 3;
      ctx.strokeRect(o.x + 4, o.y + 4, o.w - 8, o.h - 8);
      ctx.fillStyle = "#7d512f";
      ctx.fillRect(o.x + o.w / 2 - 3, o.y, 6, o.h);
    } else {
      ctx.font = "48px serif";
      ctx.fillText("🥤", o.x, o.y + 48);
      ctx.fillText("🥤", o.x + 16, o.y + 62);
    }
    ctx.restore();
  }

  function drawCollectible(item) {
    const y = item.y + Math.sin(item.bob) * 6;
    ctx.save();
    ctx.shadowColor = "rgba(255,191,0,.55)";
    ctx.shadowBlur = 18;
    ctx.font = "38px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(item.emoji, item.x, y);
    ctx.restore();
  }

  function drawPowerup(item) {
    const y = item.y + Math.sin(item.bob) * 8;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.shadowColor = "rgba(255,207,47,.8)";
    ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.arc(item.x, y, 29, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = "30px serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(item.emoji, item.x, y - 2);
    ctx.fillStyle = "#c8102e";
    ctx.font = "900 9px Inter";
    ctx.fillText(item.label, item.x, y + 18);
    ctx.restore();
  }

  function drawParticles() {
    for (const p of state.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      if (p.emoji) {
        ctx.font = `${14 + p.size}px serif`;
        ctx.fillText(p.emoji, p.x, p.y);
      } else {
        ctx.fillStyle = "rgba(255,255,255,.8)";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawStatusEffects() {
    let y = 75;
    ctx.font = "800 12px Inter";
    if (state.multiplierTime > 0) {
      roundRect(world.width - 112, y, 96, 28, 14, "rgba(255,207,47,.94)");
      ctx.fillStyle = "#6d4800";
      ctx.fillText(`2X  ${Math.ceil(state.multiplierTime)}s`, world.width - 88, y + 19);
      y += 34;
    }
    if (state.shieldTime > 0) {
      roundRect(world.width - 112, y, 96, 28, 14, "rgba(217,241,255,.95)");
      ctx.fillStyle = "#145a85";
      ctx.fillText(`SAFE ${Math.ceil(state.shieldTime)}s`, world.width - 102, y + 19);
    }
  }

  function render() {
    ctx.save();
    if (state.shake > 0) ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    drawBackground();
    for (const item of state.collectibles) drawCollectible(item);
    for (const power of state.powerups) drawPowerup(power);
    for (const obstacle of state.obstacles) drawObstacle(obstacle);
    drawPlayer();
    drawParticles();
    drawStatusEffects();
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${state.flash * 0.35})`;
      ctx.fillRect(0, 0, world.width, world.height);
    }
    ctx.restore();
  }

  function frame(timestamp) {
    const dt = Math.min(0.032, (timestamp - state.lastTime) / 1000 || 0);
    state.lastTime = timestamp;
    update(dt);
    render();
    if (state.running || state.gameOver) requestAnimationFrame(frame);
  }

  async function startGame() {
    localStorage.setItem(storage.nameKey, cleanName(ui.name.value));
    localStorage.setItem(storage.storeKey, cleanStore(ui.store.value));
    resetGame();
    showScreen("screen-game");
    resizeCanvas();
    render();
    ui.countdown.classList.remove("hidden");
    for (const step of ["3", "2", "1", "GO!"]) {
      ui.countdown.textContent = step;
      tone(step === "GO!" ? 800 : 420, 0.08, "square", 0.035, step === "GO!" ? 1200 : 560);
      await new Promise((resolve) => setTimeout(resolve, step === "GO!" ? 450 : 650));
    }
    ui.countdown.classList.add("hidden");
    state.running = true;
    state.lastTime = performance.now();
    requestAnimationFrame(frame);
  }

  function pauseGame() {
    if (!state.running || state.gameOver) return;
    state.paused = true;
    ui.pauseOverlay.classList.remove("hidden");
  }

  function resumeGame() {
    state.paused = false;
    ui.pauseOverlay.classList.add("hidden");
    state.lastTime = performance.now();
  }

  async function endGame() {
    if (state.gameOver) return;
    state.gameOver = true;
    state.running = false;
    state.shake = 16;
    soundCrash();

    const final = Math.max(0, Math.floor(state.score));
    const entry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: cleanName(ui.name.value),
      store: cleanStore(ui.store.value),
      score: final,
      createdAt: new Date().toISOString()
    };
    const localRank = saveLocalScore(entry);
    submitGlobalScore(entry).catch(() => {});

    await new Promise((resolve) => setTimeout(resolve, 550));
    ui.finalScore.textContent = final.toLocaleString();
    ui.resultTitle.textContent = final >= 2500 ? "Rush hour legend!" : final >= 1200 ? "Great run!" : "Nice run!";
    ui.resultSummary.textContent = `You cleared ${state.combo} obstacles and pickups.`;
    ui.rankMessage.textContent = localRank <= 10 ? `You placed #${localRank} on this device!` : "Your score was saved.";
    ui.rankMessage.classList.remove("hidden");
    showScreen("screen-gameover");
  }

  function quitGame() {
    state.running = false;
    state.paused = false;
    state.gameOver = true;
    ui.pauseOverlay.classList.add("hidden");
    showScreen("screen-home");
  }

  function globalEnabled() {
    return Boolean(config.supabaseUrl && config.supabaseAnonKey && config.tableName);
  }

  async function submitGlobalScore(entry) {
    if (!globalEnabled()) return;
    const body = {
      player_name: entry.name,
      store_number: entry.store || null,
      score: entry.score,
      created_at: entry.createdAt
    };
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${config.tableName}`, {
      method: "POST",
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error("Unable to save global score");
  }

  async function fetchGlobalScores() {
    if (!globalEnabled()) return [];
    const limit = Number(config.maxGlobalRows) || 50;
    const response = await fetch(
      `${config.supabaseUrl}/rest/v1/${config.tableName}?select=player_name,store_number,score,created_at&order=score.desc,created_at.asc&limit=${limit}`,
      {
        headers: {
          apikey: config.supabaseAnonKey,
          Authorization: `Bearer ${config.supabaseAnonKey}`
        }
      }
    );
    if (!response.ok) throw new Error("Unable to load global scores");
    const rows = await response.json();
    return rows.map((row, index) => ({
      id: `global-${index}`,
      name: cleanName(row.player_name),
      store: cleanStore(row.store_number),
      score: Number(row.score) || 0,
      createdAt: row.created_at || new Date().toISOString()
    }));
  }

  function formatDate(iso) {
    try {
      return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(iso));
    } catch {
      return "";
    }
  }

  function renderLeaderboard(scores, source) {
    ui.leaderboardList.innerHTML = "";
    if (!scores.length) {
      const li = document.createElement("li");
      li.className = "empty-state";
      li.textContent = source === "global" ? "No global scores yet." : "Play a round to set the first score.";
      ui.leaderboardList.appendChild(li);
      return;
    }

    scores.slice(0, 50).forEach((score, index) => {
      const li = document.createElement("li");
      const rank = document.createElement("div");
      rank.className = "rank";
      rank.textContent = index < 3 ? ["🥇", "🥈", "🥉"][index] : String(index + 1);

      const identity = document.createElement("div");
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = score.name;
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = `${score.store ? `Store ${score.store} • ` : ""}${formatDate(score.createdAt)}`;
      identity.append(name, meta);

      const points = document.createElement("div");
      points.className = "score";
      points.textContent = Number(score.score).toLocaleString();
      li.append(rank, identity, points);
      ui.leaderboardList.appendChild(li);
    });
  }

  async function openLeaderboard(returnScreen = "home") {
    state.returnScreen = returnScreen;
    showScreen("screen-leaderboard");
    await selectLeaderboardTab(state.activeLeaderboardTab);
  }

  async function selectLeaderboardTab(tab) {
    state.activeLeaderboardTab = tab;
    document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
    ui.leaderboardStatus.textContent = "";

    if (tab === "device") {
      const scores = getLocalScores();
      renderLeaderboard(scores, "device");
      ui.leaderboardStatus.textContent = `${scores.length} saved score${scores.length === 1 ? "" : "s"} on this device`;
      return;
    }

    if (!globalEnabled()) {
      renderLeaderboard([], "global");
      ui.leaderboardStatus.textContent = "Global scores are ready after Supabase is connected.";
      return;
    }

    ui.leaderboardStatus.textContent = "Loading global scores…";
    ui.leaderboardList.innerHTML = "";
    try {
      const scores = await fetchGlobalScores();
      renderLeaderboard(scores, "global");
      ui.leaderboardStatus.textContent = `${scores.length} global score${scores.length === 1 ? "" : "s"}`;
    } catch {
      renderLeaderboard([], "global");
      ui.leaderboardStatus.textContent = "Could not load the global leaderboard.";
    }
  }

  function closeLeaderboard() {
    showScreen(state.returnScreen === "gameover" ? "screen-gameover" : "screen-home");
  }

  function toggleSound() {
    state.sound = !state.sound;
    localStorage.setItem(storage.soundKey, state.sound ? "on" : "off");
    $("#sound-btn").textContent = state.sound ? "🔊" : "🔇";
    if (state.sound) tone(560, 0.08, "sine", 0.03, 800);
  }

  function bindEvents() {
    $("#play-btn").addEventListener("click", startGame);
    $("#leaderboard-btn").addEventListener("click", () => openLeaderboard("home"));
    $("#play-again-btn").addEventListener("click", startGame);
    $("#results-leaderboard-btn").addEventListener("click", () => openLeaderboard("gameover"));
    $("#home-btn").addEventListener("click", () => showScreen("screen-home"));
    $("#leaderboard-close").addEventListener("click", closeLeaderboard);
    $("#pause-btn").addEventListener("click", pauseGame);
    $("#resume-btn").addEventListener("click", resumeGame);
    $("#quit-btn").addEventListener("click", quitGame);
    $("#sound-btn").addEventListener("click", toggleSound);

    document.querySelectorAll(".tab").forEach((button) => {
      button.addEventListener("click", () => selectLeaderboardTab(button.dataset.tab));
    });

    canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      jump();
    });
    window.addEventListener("keydown", (event) => {
      if (["Space", "ArrowUp"].includes(event.code)) {
        event.preventDefault();
        jump();
      }
      if (event.code === "Escape" && state.running) {
        state.paused ? resumeGame() : pauseGame();
      }
    });

    window.addEventListener("resize", () => {
      resizeCanvas();
      if (!state.running) resetPlayer();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && state.running && !state.gameOver) pauseGame();
    });

    ui.store.addEventListener("input", () => {
      ui.store.value = cleanStore(ui.store.value);
    });
  }

  function init() {
    ui.name.value = localStorage.getItem(storage.nameKey) || "";
    ui.store.value = localStorage.getItem(storage.storeKey) || "";
    $("#sound-btn").textContent = state.sound ? "🔊" : "🔇";
    resizeCanvas();
    resetGame();
    bindEvents();
  }

  init();
})();
