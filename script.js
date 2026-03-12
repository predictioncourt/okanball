(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const FIELD_PRESETS = {
    wide: { w: 0.9, h: 0.6 },
    medium: { w: 0.82, h: 0.54 },
    short: { w: 0.74, h: 0.48 },
  };

  const COLORS = {
    pitchLight: '#7fcf83',
    pitchDark: '#5faf66',
    pitchLine: '#e9f7e3',
    pitchBorder: '#2e6b3f',
    blue: '#3a78ff',
    red: '#ff4d4d',
    ball: '#f6f0d4',
    shadow: 'rgba(0,0,0,0.25)',
    uiText: '#163021',
    uiSub: '#2a4b38',
    goalFrame: '#f2f6f0',
    goalNet: 'rgba(255,255,255,0.35)',
  };

  const KEYS = {
    up: 'KeyW',
    down: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    groundKick: 'Space',
    airKick: 'KeyC',
    start: 'Enter',
    wide: 'Digit6',
    medium: 'Digit5',
    short: 'Digit4',
    fullscreen: 'KeyF',
    reset: 'KeyR',
    mode2: 'Digit1',
    mode3: 'Digit2',
    mode4: 'Digit3',
  };

  const automationMode = navigator.webdriver === true;

  const state = {
    mode: 'menu',
    menuStep: 'field',
    fieldType: 'medium',
    view: { w: 0, h: 0 },
    field: {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      centerX: 0,
      centerY: 0,
      width: 0,
      height: 0,
      goalWidth: 0,
      goalDepth: 0,
    },
    score: { blue: 0, red: 0 },
    freeze: 0,
    player: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: 18,
      facing: { x: 1, y: 0 },
    },
    ball: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      z: 0,
      vz: 0,
      r: 10,
    },
    charge: {
      ground: { active: false, time: 0 },
      air: { active: false, time: 0 },
    },
    kickFlash: 0,
  };

  const input = {
    keys: new Set(),
  };

  const lobby = {
    mode: 2,
    started: false,
    teams: { red: [], blue: [] },
    spectators: [],
    players: {},
    joinCounter: 0,
    playerCounter: 0,
    lastLoserTeam: null,
    pick: { active: false, turn: 'red' },
    tabOpen: false,
    pickBuffer: '',
    localPlayerId: null,
  };

  function createPlayer(name) {
    lobby.playerCounter += 1;
    const id = `p${lobby.playerCounter}`;
    lobby.joinCounter += 1;
    lobby.players[id] = {
      id,
      name,
      joinIndex: lobby.joinCounter,
      team: 'spectator',
      lastTeam: null,
      disconnectedAt: null,
      connected: true,
    };
    return id;
  }

  function removeFromArray(arr, id) {
    const index = arr.indexOf(id);
    if (index >= 0) arr.splice(index, 1);
  }

  function getTeamCapacity() {
    return lobby.mode;
  }

  function isTeamFull(team) {
    return lobby.teams[team].length >= getTeamCapacity();
  }

  function getCaptainId(team) {
    return lobby.teams[team][0] || null;
  }

  function addSpectator(id, toFront = false) {
    removeFromArray(lobby.teams.red, id);
    removeFromArray(lobby.teams.blue, id);
    removeFromArray(lobby.spectators, id);
    if (toFront) {
      lobby.spectators.unshift(id);
    } else {
      lobby.spectators.push(id);
    }
    if (lobby.players[id]) {
      lobby.players[id].team = 'spectator';
    }
  }

  function addToTeam(id, team) {
    if (isTeamFull(team)) return false;
    removeFromArray(lobby.teams.red, id);
    removeFromArray(lobby.teams.blue, id);
    removeFromArray(lobby.spectators, id);
    lobby.teams[team].push(id);
    if (lobby.players[id]) {
      lobby.players[id].team = team;
      lobby.players[id].lastTeam = team;
    }
    return true;
  }

  function pickStartTeam(needsRed, needsBlue) {
    if (needsRed && needsBlue) {
      return lobby.lastLoserTeam || 'red';
    }
    if (needsRed) return 'red';
    return 'blue';
  }

  function updatePickState() {
    const needsRed = !isTeamFull('red');
    const needsBlue = !isTeamFull('blue');
    if ((!needsRed && !needsBlue) || lobby.spectators.length === 0) {
      lobby.pick.active = false;
      return;
    }
    if (!lobby.pick.active) {
      lobby.pick.turn = pickStartTeam(needsRed, needsBlue);
      lobby.pick.active = true;
    } else if (lobby.pick.turn === 'red' && !needsRed) {
      lobby.pick.turn = needsBlue ? 'blue' : lobby.pick.turn;
    } else if (lobby.pick.turn === 'blue' && !needsBlue) {
      lobby.pick.turn = needsRed ? 'red' : lobby.pick.turn;
    }
  }

  function autoAssign() {
    let needsRed = !isTeamFull('red');
    let needsBlue = !isTeamFull('blue');
    while (lobby.spectators.length > 0 && (needsRed || needsBlue)) {
      const team = needsRed ? 'red' : 'blue';
      const id = lobby.spectators.shift();
      addToTeam(id, team);
      needsRed = !isTeamFull('red');
      needsBlue = !isTeamFull('blue');
    }
    updatePickState();
  }

  function joinPlayer(name) {
    const id = createPlayer(name);
    const needsRed = !isTeamFull('red');
    const needsBlue = !isTeamFull('blue');
    if (!lobby.started && (needsRed || needsBlue)) {
      const team = lobby.teams.red.length <= lobby.teams.blue.length ? 'red' : 'blue';
      addToTeam(id, team);
    } else {
      addSpectator(id);
    }
    updatePickState();
    return id;
  }

  function exitPlayer(id) {
    const player = lobby.players[id];
    if (!player) return;
    player.connected = false;
    player.disconnectedAt = Date.now();
    removeFromArray(lobby.teams.red, id);
    removeFromArray(lobby.teams.blue, id);
    removeFromArray(lobby.spectators, id);
    updatePickState();
  }

  function disconnectPlayer(id) {
    const player = lobby.players[id];
    if (!player) return;
    player.connected = false;
    player.disconnectedAt = Date.now();
    if (player.team !== 'spectator') {
      removeFromArray(lobby.teams[player.team], id);
      addSpectator(id);
    }
    updatePickState();
  }

  function reconnectPlayer(id) {
    const player = lobby.players[id];
    if (!player) return;
    player.connected = true;
    const now = Date.now();
    const withinWindow = player.disconnectedAt && now - player.disconnectedAt <= 60000;
    if (withinWindow && player.lastTeam && !isTeamFull(player.lastTeam)) {
      addToTeam(id, player.lastTeam);
    } else {
      addSpectator(id);
    }
    player.disconnectedAt = null;
    updatePickState();
  }

  function endMatch(winnerTeam) {
    const loserTeam = winnerTeam === 'red' ? 'blue' : 'red';
    lobby.started = false;
    lobby.lastLoserTeam = loserTeam;
    const losers = [...lobby.teams[loserTeam]];
    lobby.teams[loserTeam] = [];
    losers.forEach((id) => {
      if (lobby.players[id]) {
        lobby.players[id].team = 'spectator';
        lobby.players[id].lastTeam = loserTeam;
      }
    });
    lobby.spectators = [...losers, ...lobby.spectators.filter((id) => !losers.includes(id))];
    updatePickState();
  }

  function pickSpectator(number, team) {
    const index = number - 1;
    if (index < 0 || index >= lobby.spectators.length) return false;
    if (isTeamFull(team)) return false;
    const id = lobby.spectators[index];
    addToTeam(id, team);
    updatePickState();
    if (!lobby.pick.active) {
      autoAssign();
      return true;
    }
    const needsRed = !isTeamFull('red');
    const needsBlue = !isTeamFull('blue');
    if (needsRed && needsBlue) {
      lobby.pick.turn = lobby.pick.turn === 'red' ? 'blue' : 'red';
    } else if (needsRed) {
      lobby.pick.turn = 'red';
    } else if (needsBlue) {
      lobby.pick.turn = 'blue';
    }
    updatePickState();
    return true;
  }

  function setMode(mode) {
    lobby.mode = mode;
    while (lobby.teams.red.length > lobby.mode) {
      const id = lobby.teams.red.pop();
      addSpectator(id, true);
    }
    while (lobby.teams.blue.length > lobby.mode) {
      const id = lobby.teams.blue.pop();
      addSpectator(id, true);
    }
    updatePickState();
    autoAssign();
  }

  const physics = {
    playerAccel: 1600,
    playerMaxSpeed: 300,
    playerDamp: 8.5,
    ballDamp: 2.6,
    ballAirDamp: 0.4,
    ballBounce: 0.82,
    gravity: 900,
  };

  const baseChargeConfig = {
    ground: { max: 2.8, minSpeed: 520, maxSpeed: 2200 },
    air: { max: 1.6, minForward: 200, maxForward: 560, minUp: 260, maxUp: 520 },
  };
  const chargeConfig = {
    ground: { ...baseChargeConfig.ground },
    air: { ...baseChargeConfig.air },
  };

  let lastTime = performance.now();
  let manualTime = false;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function vecLength(x, y) {
    return Math.hypot(x, y);
  }

  function normalize(x, y) {
    const len = Math.hypot(x, y);
    if (len < 0.0001) return { x: 1, y: 0 };
    return { x: x / len, y: y / len };
  }

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.view.w = w;
    state.view.h = h;

    computeField();
  }

  function computeField() {
    const preset = FIELD_PRESETS[state.fieldType];
    const margin = 32;
    const maxW = state.view.w - margin * 2;
    const maxH = state.view.h - margin * 2;
    const width = Math.min(maxW, state.view.w * preset.w);
    const height = Math.min(maxH, state.view.h * preset.h);
    const left = (state.view.w - width) / 2;
    const top = (state.view.h - height) / 2;

    const goalWidth = height * 0.28;
    const goalDepth = Math.max(14, height * 0.065);

    state.field = {
      left,
      right: left + width,
      top,
      bottom: top + height,
      centerX: left + width / 2,
      centerY: top + height / 2,
      width,
      height,
      goalWidth,
      goalDepth,
    };

    const basePlayerR = clamp(height * 0.04, 14, 22);
    state.player.r = basePlayerR;
    state.ball.r = clamp(height * 0.023, 8, 12);

    updateChargeConfig(width);
    resetPositions();
  }

  function updateChargeConfig(fieldWidth) {
    const baseWidth = Math.min(state.view.w - 64, state.view.w * FIELD_PRESETS.medium.w);
    const rawScale = baseWidth > 0 ? fieldWidth / baseWidth : 1;
    const powerScale = clamp(rawScale, 1, 3.8);
    chargeConfig.ground.max = baseChargeConfig.ground.max;
    chargeConfig.ground.minSpeed = baseChargeConfig.ground.minSpeed * powerScale;
    chargeConfig.ground.maxSpeed = baseChargeConfig.ground.maxSpeed * powerScale;
    chargeConfig.air.max = baseChargeConfig.air.max;
    chargeConfig.air.minForward = baseChargeConfig.air.minForward * powerScale;
    chargeConfig.air.maxForward = baseChargeConfig.air.maxForward * powerScale;
    chargeConfig.air.minUp = baseChargeConfig.air.minUp * powerScale;
    chargeConfig.air.maxUp = baseChargeConfig.air.maxUp * powerScale;
  }

  function resetPositions() {
    const f = state.field;
    const offset = f.width * 0.22;

    state.player.x = f.centerX - offset;
    state.player.y = f.centerY;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.facing = { x: 1, y: 0 };

    state.ball.x = f.centerX;
    state.ball.y = f.centerY;
    state.ball.vx = 0;
    state.ball.vy = 0;
    state.ball.z = 0;
    state.ball.vz = 0;

    state.kickFlash = 0;
  }

  function startMatch() {
    state.mode = 'playing';
    state.score.blue = 0;
    state.score.red = 0;
    state.freeze = 0;
    resetPositions();
    lobby.started = true;
    updatePickState();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  function handleKeyDown(event) {
    if (event.repeat) return;

    if (event.code === 'Tab') {
      event.preventDefault();
      lobby.tabOpen = true;
      return;
    }

    if (event.code === KEYS.fullscreen) {
      toggleFullscreen();
      return;
    }

    if (lobby.tabOpen) {
      if (event.code === 'KeyX' && lobby.localPlayerId) {
        event.preventDefault();
        exitPlayer(lobby.localPlayerId);
        return;
      }
      const digitMatch = event.code.match(/Digit(\d)/) || event.code.match(/Numpad(\d)/);
      if (digitMatch) {
        event.preventDefault();
        lobby.pickBuffer = `${lobby.pickBuffer}${digitMatch[1]}`.slice(-2);
        const pickNumber = Number(lobby.pickBuffer);
        const team = lobby.pick.turn;
        if (lobby.pick.active && lobby.localPlayerId === getCaptainId(team)) {
          if (pickSpectator(pickNumber, team)) {
            lobby.pickBuffer = '';
          }
        }
        return;
      }
    }

    if (state.mode === 'menu') {
      if (state.menuStep === 'field') {
        if (event.code === KEYS.wide) {
          state.fieldType = 'wide';
          computeField();
          state.menuStep = 'mode';
        } else if (event.code === KEYS.medium) {
          state.fieldType = 'medium';
          computeField();
          state.menuStep = 'mode';
        } else if (event.code === KEYS.short) {
          state.fieldType = 'short';
          computeField();
          state.menuStep = 'mode';
        }
      } else if (state.menuStep === 'mode') {
        if (event.code === KEYS.mode2) {
          setMode(2);
        } else if (event.code === KEYS.mode3) {
          setMode(3);
        } else if (event.code === KEYS.mode4) {
          setMode(4);
        } else if (event.code === KEYS.start) {
          startMatch();
        }
      }
      return;
    }

    if (state.mode === 'playing') {
      const groundKey = event.code === KEYS.groundKick || (automationMode && event.code === 'Space');
      const airKey = event.code === KEYS.airKick || (automationMode && event.code === 'KeyB');
      if (groundKey) {
        event.preventDefault();
        startCharge('ground');
      } else if (airKey) {
        startCharge('air');
      } else if (event.code === KEYS.reset) {
        resetPositions();
      }
    }

  }

  function handleKeyUp(event) {
    if (event.code === 'Tab') {
      lobby.tabOpen = false;
      lobby.pickBuffer = '';
      return;
    }
    if (state.mode === 'playing') {
      const groundKey = event.code === KEYS.groundKick || (automationMode && event.code === 'Space');
      const airKey = event.code === KEYS.airKick || (automationMode && event.code === 'KeyB');
      if (groundKey) {
        releaseCharge('ground');
      } else if (airKey) {
        releaseCharge('air');
      }
    }
  }

  function startCharge(type) {
    const charge = state.charge[type];
    if (!charge || charge.active) return;
    charge.active = true;
    charge.time = 0;
  }

  function releaseCharge(type) {
    const charge = state.charge[type];
    if (!charge || !charge.active) return;
    const time = charge.time;
    charge.active = false;
    charge.time = 0;
    attemptKick(type, time);
  }

  function attemptKick(type, chargeTime) {
    const player = state.player;
    const ball = state.ball;

    const dx = ball.x - player.x;
    const dy = ball.y - player.y;
    const dist = Math.hypot(dx, dy);
    const reach = player.r + ball.r + 6;
    if (dist > reach) return;

    const facing = normalize(player.facing.x, player.facing.y);

    if (type === 'ground') {
      if (ball.z > 1) return;
      const t = clamp(chargeTime / chargeConfig.ground.max, 0, 1);
      const speed = lerp(chargeConfig.ground.minSpeed, chargeConfig.ground.maxSpeed, t);
      ball.vx = facing.x * speed;
      ball.vy = facing.y * speed;
      ball.vz = 0;
      ball.z = 0;
      ball.x = player.x + facing.x * (reach + 2);
      ball.y = player.y + facing.y * (reach + 2);
      state.kickFlash = 0.15;
      return;
    }

    if (type === 'air') {
      const t = clamp(chargeTime / chargeConfig.air.max, 0, 1);
      const forward = lerp(chargeConfig.air.minForward, chargeConfig.air.maxForward, t);
      const upward = lerp(chargeConfig.air.minUp, chargeConfig.air.maxUp, t);
      ball.vx = facing.x * forward;
      ball.vy = facing.y * forward;
      ball.vz = upward;
      ball.z = Math.max(ball.z, 1);
      ball.x = player.x + facing.x * (reach + 2);
      ball.y = player.y + facing.y * (reach + 2);
      state.kickFlash = 0.15;
    }
  }

  function updateCharge(dt) {
    Object.keys(state.charge).forEach((key) => {
      const charge = state.charge[key];
      if (!charge.active) return;
      const maxTime = chargeConfig[key].max;
      charge.time = Math.min(maxTime, charge.time + dt);
    });
  }

  function updatePlayer(dt) {
    let ax = 0;
    let ay = 0;

    if (input.keys.has(KEYS.up) || input.keys.has('ArrowUp')) ay -= 1;
    if (input.keys.has(KEYS.down) || input.keys.has('ArrowDown')) ay += 1;
    if (input.keys.has(KEYS.left) || input.keys.has('ArrowLeft')) ax -= 1;
    if (input.keys.has(KEYS.right) || input.keys.has('ArrowRight')) ax += 1;

    if (ax !== 0 || ay !== 0) {
      const dir = normalize(ax, ay);
      state.player.vx += dir.x * physics.playerAccel * dt;
      state.player.vy += dir.y * physics.playerAccel * dt;
      state.player.facing = { x: dir.x, y: dir.y };
    }

    const damp = Math.exp(-physics.playerDamp * dt);
    state.player.vx *= damp;
    state.player.vy *= damp;

    const speed = vecLength(state.player.vx, state.player.vy);
    if (speed > physics.playerMaxSpeed) {
      const scale = physics.playerMaxSpeed / speed;
      state.player.vx *= scale;
      state.player.vy *= scale;
    }

    state.player.x += state.player.vx * dt;
    state.player.y += state.player.vy * dt;

    keepPlayerInBounds(state.player);
  }

  function keepPlayerInBounds(player) {
    const f = state.field;
    player.x = clamp(player.x, f.left + player.r, f.right - player.r);
    player.y = clamp(player.y, f.top + player.r, f.bottom - player.r);
  }

  function resolvePlayerBallCollision(player) {
    const ball = state.ball;
    if (ball.z > 1) return;

    const dx = ball.x - player.x;
    const dy = ball.y - player.y;
    const dist = Math.hypot(dx, dy);
    const minDist = player.r + ball.r;
    if (dist >= minDist || dist < 0.0001) return;

    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;

    ball.x += nx * overlap;
    ball.y += ny * overlap;

    ball.vx += nx * 60 + player.vx * 0.35;
    ball.vy += ny * 60 + player.vy * 0.35;
  }

  function updateBall(dt) {
    const ball = state.ball;
    const f = state.field;

    const airDamp = Math.exp(-physics.ballAirDamp * dt);
    ball.vx *= airDamp;
    ball.vy *= airDamp;

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.z > 0 || ball.vz > 0) {
      ball.vz -= physics.gravity * dt;
      ball.z += ball.vz * dt;
      if (ball.z <= 0) {
        ball.z = 0;
        if (Math.abs(ball.vz) > 60) {
          ball.vz = -ball.vz * 0.22;
        } else {
          ball.vz = 0;
        }
      }
    }

    if (ball.z === 0) {
      const groundDamp = Math.exp(-physics.ballDamp * dt);
      ball.vx *= groundDamp;
      ball.vy *= groundDamp;
    }

    const goalTop = f.centerY - f.goalWidth / 2;
    const goalBottom = f.centerY + f.goalWidth / 2;
    const inGoalMouth = ball.y > goalTop && ball.y < goalBottom;
    const leftGoalBack = f.left - f.goalDepth;
    const rightGoalBack = f.right + f.goalDepth;

    if (ball.y - ball.r < f.top) {
      ball.y = f.top + ball.r;
      ball.vy = Math.abs(ball.vy) * physics.ballBounce;
    }
    if (ball.y + ball.r > f.bottom) {
      ball.y = f.bottom - ball.r;
      ball.vy = -Math.abs(ball.vy) * physics.ballBounce;
    }

    if (ball.x - ball.r < f.left) {
      if (!inGoalMouth) {
        ball.x = f.left + ball.r;
        ball.vx = Math.abs(ball.vx) * physics.ballBounce;
      } else if (ball.x - ball.r < leftGoalBack) {
        ball.x = leftGoalBack + ball.r;
        ball.vx = Math.abs(ball.vx) * 0.35;
      }
    }

    if (ball.x + ball.r > f.right) {
      if (!inGoalMouth) {
        ball.x = f.right - ball.r;
        ball.vx = -Math.abs(ball.vx) * physics.ballBounce;
      } else if (ball.x + ball.r > rightGoalBack) {
        ball.x = rightGoalBack - ball.r;
        ball.vx = -Math.abs(ball.vx) * 0.35;
      }
    }
  }

  function checkGoal() {
    const ball = state.ball;
    const f = state.field;
    if (ball.z > 1) return false;

    const goalTop = f.centerY - f.goalWidth / 2;
    const goalBottom = f.centerY + f.goalWidth / 2;
    const inGoalMouth = ball.y > goalTop && ball.y < goalBottom;

    if (ball.x - ball.r <= f.left && inGoalMouth) {
      state.score.red += 1;
      state.freeze = 1.1;
      resetPositions();
      return true;
    }

    if (ball.x + ball.r >= f.right && inGoalMouth) {
      state.score.blue += 1;
      state.freeze = 1.1;
      resetPositions();
      return true;
    }

    return false;
  }

  function update(dt) {
    if (state.mode !== 'playing') return;

    if (state.freeze > 0) {
      state.freeze = Math.max(0, state.freeze - dt);
      return;
    }

    updateCharge(dt);
    updatePlayer(dt);
    updateBall(dt);

    resolvePlayerBallCollision(state.player);

    checkGoal();

    if (state.kickFlash > 0) {
      state.kickFlash = Math.max(0, state.kickFlash - dt);
    }
  }

  function drawField() {
    const f = state.field;
    const gradient = ctx.createLinearGradient(0, f.top, 0, f.bottom);
    gradient.addColorStop(0, COLORS.pitchLight);
    gradient.addColorStop(1, COLORS.pitchDark);

    ctx.fillStyle = gradient;
    ctx.fillRect(f.left, f.top, f.width, f.height);

    ctx.strokeStyle = COLORS.pitchBorder;
    ctx.lineWidth = 6;
    ctx.strokeRect(f.left, f.top, f.width, f.height);

    ctx.strokeStyle = COLORS.pitchLine;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(f.centerX, f.top);
    ctx.lineTo(f.centerX, f.bottom);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(f.centerX, f.centerY, f.height * 0.16, 0, Math.PI * 2);
    ctx.stroke();

    const goalTop = f.centerY - f.goalWidth / 2;
    const goalBottom = f.centerY + f.goalWidth / 2;

    ctx.fillStyle = COLORS.goalNet;
    ctx.fillRect(f.left - f.goalDepth, goalTop, f.goalDepth, f.goalWidth);
    ctx.fillRect(f.right, goalTop, f.goalDepth, f.goalWidth);

    ctx.strokeStyle = COLORS.goalFrame;
    ctx.lineWidth = 3;
    ctx.strokeRect(f.left - f.goalDepth, goalTop, f.goalDepth, f.goalWidth);
    ctx.strokeRect(f.right, goalTop, f.goalDepth, f.goalWidth);
  }

  function drawPlayer(player, color, showFacing) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (showFacing) {
      const facing = normalize(player.facing.x, player.facing.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(player.x + facing.x * player.r * 1.5, player.y + facing.y * player.r * 1.5);
      ctx.stroke();
    }
  }

  function drawBall() {
    const ball = state.ball;
    const shadowScale = clamp(1 - ball.z / 260, 0.55, 1);
    const shadowAlpha = clamp(0.35 - ball.z / 600, 0.08, 0.35);

    ctx.fillStyle = `rgba(0,0,0,${shadowAlpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(ball.x, ball.y, ball.r * shadowScale, ball.r * shadowScale * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();

    const drawY = ball.y - ball.z * 0.18;
    const drawR = ball.r * clamp(1 - ball.z / 400, 0.65, 1);

    ctx.fillStyle = COLORS.ball;
    ctx.beginPath();
    ctx.arc(ball.x, drawY, drawR, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(60,60,60,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawChargeRing(player) {
    const ground = state.charge.ground;
    const air = state.charge.air;

    if (!ground.active && !air.active) return;

    let progress = 0;
    let color = 'rgba(255,255,255,0.6)';

    if (ground.active) {
      progress = ground.time / chargeConfig.ground.max;
      color = 'rgba(255,255,255,0.75)';
    }

    if (air.active) {
      progress = air.time / chargeConfig.air.max;
      color = 'rgba(255,240,200,0.8)';
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
  }

  function drawScore() {
    ctx.fillStyle = COLORS.uiText;
    ctx.font = '700 24px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`Blue ${state.score.blue} - ${state.score.red} Red`, state.view.w / 2, 18);
  }

  function drawMenu() {
    ctx.clearRect(0, 0, state.view.w, state.view.h);
    drawField();

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(state.view.w * 0.18, state.view.h * 0.18, state.view.w * 0.64, state.view.h * 0.64);

    ctx.strokeStyle = 'rgba(22,48,33,0.25)';
    ctx.lineWidth = 3;
    ctx.strokeRect(state.view.w * 0.18, state.view.h * 0.18, state.view.w * 0.64, state.view.h * 0.64);

    ctx.fillStyle = COLORS.uiText;
    ctx.font = '700 42px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Okanball', state.view.w / 2, state.view.h * 0.22);

    ctx.fillStyle = COLORS.uiSub;
    ctx.font = '600 20px "Trebuchet MS", sans-serif';
    ctx.fillText('WASD hareket | Space yerden sut/pas | C havadan pas', state.view.w / 2, state.view.h * 0.30);
    ctx.fillText('Space/C ne kadar uzun basarsan o kadar guclu.', state.view.w / 2, state.view.h * 0.34);
    ctx.fillText('F fullscreen | R reset', state.view.w / 2, state.view.h * 0.38);

    ctx.font = '700 22px "Trebuchet MS", sans-serif';
    if (state.menuStep === 'field') {
      ctx.fillText('Saha Secimi (4-6)', state.view.w / 2, state.view.h * 0.46);
    } else {
      ctx.fillText('Saha Secildi', state.view.w / 2, state.view.h * 0.46);
    }

    const options = state.menuStep === 'field'
      ? [
          { id: 'short', label: '4 - Kucuk' },
          { id: 'medium', label: '5 - Orta' },
          { id: 'wide', label: '6 - Buyuk' },
        ]
      : [
          { id: 'mode2', label: '1 - 2v2' },
          { id: 'mode3', label: '2 - 3v3' },
          { id: 'mode4', label: '3 - 4v4' },
        ];

    const startY = state.view.h * 0.52;
    const boxW = state.view.w * 0.18;
    const boxH = 44;
    const gap = 20;
    const totalW = boxW * options.length + gap * (options.length - 1);
    let x = state.view.w / 2 - totalW / 2;

    options.forEach((opt) => {
      const isActive = state.menuStep === 'field'
        ? state.fieldType === opt.id
        : lobby.mode === Number(opt.id.replace('mode', ''));
      ctx.fillStyle = isActive ? 'rgba(58,120,255,0.2)' : 'rgba(22,48,33,0.06)';
      ctx.fillRect(x, startY, boxW, boxH);
      ctx.strokeStyle = isActive ? COLORS.blue : 'rgba(22,48,33,0.18)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, startY, boxW, boxH);

      ctx.fillStyle = COLORS.uiText;
      ctx.font = '600 18px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(opt.label, x + boxW / 2, startY + boxH / 2);

      x += boxW + gap;
    });

    ctx.fillStyle = COLORS.uiText;
    ctx.font = '700 22px "Trebuchet MS", sans-serif';
    ctx.textBaseline = 'top';
    if (state.menuStep === 'mode') {
      ctx.fillText('Mod Secimi (1-3)', state.view.w / 2, state.view.h * 0.62);
      ctx.fillText('Enter ile basla', state.view.w / 2, state.view.h * 0.68);
    } else {
      ctx.fillText('Secim sonrasi mod ekrani acilir', state.view.w / 2, state.view.h * 0.62);
    }

    ctx.font = '500 16px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(22,48,33,0.7)';
    ctx.fillText('Online altyapi icin hazir; su an lokal demo.', state.view.w / 2, state.view.h * 0.74);
  }

  function drawTabMenu() {
    const panelW = state.view.w * 0.78;
    const panelH = state.view.h * 0.72;
    const x = (state.view.w - panelW) / 2;
    const y = (state.view.h - panelH) / 2;
    const columnGap = 24;
    const columnW = (panelW - columnGap * 2) / 3;

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(x, y, panelW, panelH);
    ctx.strokeStyle = 'rgba(22,48,33,0.25)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, panelW, panelH);

    ctx.fillStyle = COLORS.uiText;
    ctx.font = '700 24px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('TAB Menusu', state.view.w / 2, y + 12);

    const redX = x + columnW / 2;
    const blueX = x + columnW + columnGap + columnW / 2;
    const specX = x + columnW * 2 + columnGap * 2 + columnW / 2;
    const listTop = y + 56;

    ctx.font = '700 18px "Trebuchet MS", sans-serif';
    ctx.fillStyle = COLORS.red;
    ctx.fillText(`Kirmizi (${lobby.teams.red.length}/${lobby.mode})`, redX, listTop);
    ctx.fillStyle = COLORS.blue;
    ctx.fillText(`Mavi (${lobby.teams.blue.length}/${lobby.mode})`, blueX, listTop);
    ctx.fillStyle = COLORS.uiText;
    ctx.fillText(`Spectator (${lobby.spectators.length})`, specX, listTop);

    ctx.font = '600 16px "Trebuchet MS", sans-serif';
    ctx.fillStyle = COLORS.uiText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const lineHeight = 22;
    const redCaptain = getCaptainId('red');
    const blueCaptain = getCaptainId('blue');

    lobby.teams.red.forEach((id, index) => {
      const name = lobby.players[id]?.name || id;
      const label = id === redCaptain ? `${name} (K)` : name;
      ctx.fillText(label, redX, listTop + 30 + index * lineHeight);
    });

    lobby.teams.blue.forEach((id, index) => {
      const name = lobby.players[id]?.name || id;
      const label = id === blueCaptain ? `${name} (K)` : name;
      ctx.fillText(label, blueX, listTop + 30 + index * lineHeight);
    });

    lobby.spectators.forEach((id, index) => {
      const name = lobby.players[id]?.name || id;
      ctx.fillText(`${index + 1}. ${name}`, specX, listTop + 30 + index * lineHeight);
    });

    ctx.fillStyle = COLORS.uiSub;
    ctx.font = '600 16px "Trebuchet MS", sans-serif';
    const infoY = y + panelH - 60;
    let infoText = 'TAB: liste | X: exit';
    if (lobby.pick.active) {
      const teamName = lobby.pick.turn === 'red' ? 'Kirmizi' : 'Mavi';
      infoText = `${infoText} | Pick sirasi: ${teamName} kaptan`;
    }
    if (lobby.pickBuffer) {
      infoText = `${infoText} | Secim: ${lobby.pickBuffer}`;
    }
    ctx.fillText(infoText, state.view.w / 2, infoY);
  }

  function render() {
    ctx.clearRect(0, 0, state.view.w, state.view.h);

    if (state.mode === 'menu') {
      drawMenu();
      if (lobby.tabOpen) {
        drawTabMenu();
      }
      return;
    }

    drawField();
    drawScore();

    drawBall();
    drawPlayer(state.player, COLORS.blue, true);
    drawChargeRing(state.player);

    if (state.kickFlash > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(state.player.x, state.player.y, state.player.r + 14, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (state.freeze > 0) {
      ctx.fillStyle = 'rgba(22,48,33,0.65)';
      ctx.font = '700 36px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('GOAL!', state.view.w / 2, state.view.h * 0.14);
    }

    if (lobby.tabOpen) {
      drawTabMenu();
    }
  }

  function tick(now) {
    if (!manualTime) {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      update(dt);
      render();
    }
    requestAnimationFrame(tick);
  }

  window.advanceTime = (ms) => {
    manualTime = true;
    const step = 1 / 60;
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i += 1) {
      update(step);
    }
    render();
    lastTime = performance.now();
  };

  window.render_game_to_text = () => {
    const payload = {
      mode: state.mode,
      fieldType: state.fieldType,
      coords: 'origin top-left, +x right, +y down, z is height',
      score: state.score,
      freeze: Number(state.freeze.toFixed(2)),
      player: {
        x: Number(state.player.x.toFixed(2)),
        y: Number(state.player.y.toFixed(2)),
        vx: Number(state.player.vx.toFixed(2)),
        vy: Number(state.player.vy.toFixed(2)),
        r: state.player.r,
        facing: {
          x: Number(state.player.facing.x.toFixed(2)),
          y: Number(state.player.facing.y.toFixed(2)),
        },
      },
      lobby: {
        mode: lobby.mode,
        started: lobby.started,
        teams: {
          red: lobby.teams.red.map((id) => lobby.players[id]?.name || id),
          blue: lobby.teams.blue.map((id) => lobby.players[id]?.name || id),
        },
        spectators: lobby.spectators.map((id) => lobby.players[id]?.name || id),
        pick: lobby.pick.active ? lobby.pick.turn : null,
      },
      ball: {
        x: Number(state.ball.x.toFixed(2)),
        y: Number(state.ball.y.toFixed(2)),
        z: Number(state.ball.z.toFixed(2)),
        vx: Number(state.ball.vx.toFixed(2)),
        vy: Number(state.ball.vy.toFixed(2)),
        vz: Number(state.ball.vz.toFixed(2)),
        r: state.ball.r,
      },
      charge: {
        ground: {
          active: state.charge.ground.active,
          time: Number(state.charge.ground.time.toFixed(2)),
        },
        air: {
          active: state.charge.air.active,
          time: Number(state.charge.air.time.toFixed(2)),
        },
      },
      field: {
        left: Number(state.field.left.toFixed(2)),
        right: Number(state.field.right.toFixed(2)),
        top: Number(state.field.top.toFixed(2)),
        bottom: Number(state.field.bottom.toFixed(2)),
        goalWidth: Number(state.field.goalWidth.toFixed(2)),
        goalDepth: Number(state.field.goalDepth.toFixed(2)),
      },
    };
    return JSON.stringify(payload);
  };

  document.addEventListener('keydown', (event) => {
    input.keys.add(event.code);
    handleKeyDown(event);
  });

  document.addEventListener('keyup', (event) => {
    input.keys.delete(event.code);
    handleKeyUp(event);
  });

  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('fullscreenchange', resizeCanvas);

  resizeCanvas();
  requestAnimationFrame(tick);

  lobby.localPlayerId = joinPlayer('Sen');
  window.haxServer = {
    join: (name) => joinPlayer(name || `Oyuncu ${lobby.playerCounter + 1}`),
    exit: (id) => exitPlayer(id),
    disconnect: (id) => disconnectPlayer(id),
    reconnect: (id) => reconnectPlayer(id),
    endMatch: (winnerTeam) => endMatch(winnerTeam),
    pick: (number, team) => pickSpectator(number, team || lobby.pick.turn),
    setMode: (mode) => setMode(mode),
    state: () => ({
      mode: lobby.mode,
      teams: lobby.teams,
      spectators: lobby.spectators,
      players: lobby.players,
      pick: lobby.pick,
    }),
  };
})();
