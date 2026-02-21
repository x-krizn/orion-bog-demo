import React, { useEffect, useRef, useState } from 'react';
import { GameState, Player, Enemy, Projectile, Vector2 } from '../types';
import { 
  CANVAS_WIDTH, 
  CANVAS_HEIGHT, 
  PLAYER_MAX_HEALTH, 
  PLAYER_MAX_ENERGY, 
  PLAYER_MAX_HEAT,
  COLORS,
  PLAYER_SPEED,
  PROJECTILE_SPEED,
  PROJECTILE_LIFETIME,
  ENEMY_SPAWN_RATE,
  TileType,
  TILE_SIZE,
  MAP_WIDTH,
  MAP_HEIGHT,
  ENEMY_STATS,
  AUTO_LOCK_RANGE,
  AUTO_LOCK_CONE
} from '../constants';

// Static map for M00-THE-BOG
const BOG_MAP: number[][] = Array(MAP_HEIGHT).fill(0).map(() => Array(MAP_WIDTH).fill(TileType.GROUND));

// Simple maze-like generation for the demo
for (let y = 0; y < MAP_HEIGHT; y++) {
  for (let x = 0; x < MAP_WIDTH; x++) {
    if (x === 0 || x === MAP_WIDTH - 1 || y === 0 || y === MAP_HEIGHT - 1) {
      BOG_MAP[y][x] = TileType.TREE;
    } else if (Math.random() > 0.8) {
      BOG_MAP[y][x] = Math.random() > 0.5 ? TileType.WATER : TileType.TREE;
    }
  }
}

// Add ruins in the middle
const centerX = Math.floor(MAP_WIDTH / 2);
const centerY = Math.floor(MAP_HEIGHT / 2);
for (let dy = -2; dy <= 2; dy++) {
  for (let dx = -2; dx <= 2; dx++) {
    if (Math.abs(dx) === 2 || Math.abs(dy) === 2) {
      BOG_MAP[centerY + dy][centerX + dx] = TileType.WALL;
    } else {
      BOG_MAP[centerY + dy][centerX + dx] = TileType.RUIN;
    }
  }
}
// Doorway
BOG_MAP[centerY + 2][centerX] = TileType.RUIN;

const createPlayer = (): Player => ({
  id: 'player',
  position: { x: TILE_SIZE * 2, y: TILE_SIZE * 2 },
  velocity: { x: 0, y: 0 },
  rotation: 0,
  movementRotation: 0,
  aimRotation: 0,
  radius: 15,
  health: PLAYER_MAX_HEALTH,
  maxHealth: PLAYER_MAX_HEALTH,
  energy: PLAYER_MAX_ENERGY,
  maxEnergy: PLAYER_MAX_ENERGY,
  heat: 0,
  maxHeat: PLAYER_MAX_HEAT,
  weaponCooldown: 0,
});

const createEnemy = (id: string): Enemy => {
  const types: ('warrior' | 'scout' | 'wurm')[] = ['warrior', 'scout', 'wurm'];
  const type = types[Math.floor(Math.random() * types.length)];
  const stats = type === 'warrior' ? ENEMY_STATS.WARRIOR : type === 'scout' ? ENEMY_STATS.SCOUT : ENEMY_STATS.WURM;

  let x, y;
  let validPos = false;
  while (!validPos) {
    x = Math.random() * CANVAS_WIDTH;
    y = Math.random() * CANVAS_HEIGHT;
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);
    if (BOG_MAP[ty]?.[tx] === TileType.GROUND) {
      validPos = true;
    }
  }

  return {
    id,
    position: { x: x!, y: y! },
    velocity: { x: 0, y: 0 },
    rotation: 0,
    radius: stats.radius,
    health: stats.hp,
    maxHealth: stats.hp,
    type,
    state: 'chase',
    stateTimer: 0,
  };
};

const checkCollision = (x: number, y: number, radius: number) => {
  const tx = Math.floor(x / TILE_SIZE);
  const ty = Math.floor(y / TILE_SIZE);
  
  // Check surrounding tiles
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ctx = tx + dx;
      const cty = ty + dy;
      if (ctx < 0 || ctx >= MAP_WIDTH || cty < 0 || cty >= MAP_HEIGHT) continue;
      
      const tile = BOG_MAP[cty][ctx];
      if (tile === TileType.WALL || tile === TileType.TREE) {
        const tileX = ctx * TILE_SIZE + TILE_SIZE / 2;
        const tileY = cty * TILE_SIZE + TILE_SIZE / 2;
        const dist = Math.hypot(x - tileX, y - tileY);
        if (dist < radius + TILE_SIZE / 2) return true;
      }
    }
  }
  return false;
};

export const GameCanvas: React.FC<{ 
  onStateUpdate: (state: GameState) => void,
  moveVector?: Vector2,
  aimVector?: Vector2,
  isFiring?: boolean
}> = ({ onStateUpdate, moveVector, aimVector, isFiring }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const moveVectorRef = useRef<Vector2 | undefined>(moveVector);
  const aimVectorRef = useRef<Vector2 | undefined>(aimVector);
  const isFiringRef = useRef<boolean | undefined>(isFiring);

  useEffect(() => {
    moveVectorRef.current = moveVector;
  }, [moveVector]);

  useEffect(() => {
    aimVectorRef.current = aimVector;
  }, [aimVector]);

  useEffect(() => {
    isFiringRef.current = isFiring;
  }, [isFiring]);

  const gameStateRef = useRef<GameState>({
    player: createPlayer(),
    enemies: [],
    projectiles: [],
    score: 0,
    targetId: null,
    isGameOver: false,
    isPaused: false,
  });

  const keysRef = useRef<Set<string>>(new Set());
  const mousePosRef = useRef<Vector2>({ x: 0, y: 0 });
  const frameCountRef = useRef(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => keysRef.current.add(e.code);
    const handleKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      mousePosRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        keysRef.current.add('Mouse0');
        // Manual selection logic
        const state = gameStateRef.current;
        const worldPos = mousePosRef.current;
        const clickedEnemy = state.enemies.find(e => 
          Math.hypot(e.position.x - worldPos.x, e.position.y - worldPos.y) < e.radius + 10
        );
        if (clickedEnemy) state.targetId = clickedEnemy.id;
      }
    };
    const handleMouseUp = () => keysRef.current.delete('Mouse0');

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const update = () => {
      const state = gameStateRef.current;
      if (state.isGameOver || state.isPaused) return;

      frameCountRef.current++;

      // Player Movement (Lower Half)
      let moveX = (keysRef.current.has('KeyD') ? 1 : 0) - (keysRef.current.has('KeyA') ? 1 : 0);
      let moveY = (keysRef.current.has('KeyS') ? 1 : 0) - (keysRef.current.has('KeyW') ? 1 : 0);
      
      if (moveVectorRef.current && (Math.abs(moveVectorRef.current.x) > 0.1 || Math.abs(moveVectorRef.current.y) > 0.1)) {
        moveX = moveVectorRef.current.x;
        moveY = moveVectorRef.current.y;
        state.player.movementRotation = Math.atan2(moveY, moveX);
      } else if (moveX !== 0 || moveY !== 0) {
        state.player.movementRotation = Math.atan2(moveY, moveX);
      }

      const nextX = state.player.position.x + moveX * PLAYER_SPEED;
      const nextY = state.player.position.y + moveY * PLAYER_SPEED;

      if (!checkCollision(nextX, state.player.position.y, state.player.radius)) {
        state.player.position.x = nextX;
      }
      if (!checkCollision(state.player.position.x, nextY, state.player.radius)) {
        state.player.position.y = nextY;
      }

      // Player Aiming (Upper Half)
      if (aimVectorRef.current && (Math.abs(aimVectorRef.current.x) > 0.1 || Math.abs(aimVectorRef.current.y) > 0.1)) {
        state.player.aimRotation = Math.atan2(aimVectorRef.current.y, aimVectorRef.current.x);
      } else if (!moveVectorRef.current) {
        state.player.aimRotation = Math.atan2(
          mousePosRef.current.y - state.player.position.y,
          mousePosRef.current.x - state.player.position.x
        );
      }

      // Auto-lock logic
      let closestEnemy: Enemy | null = null;
      let minDistance = AUTO_LOCK_RANGE;

      state.enemies.forEach(enemy => {
        if (enemy.state === 'submerged') return;
        const dist = Math.hypot(enemy.position.x - state.player.position.x, enemy.position.y - state.player.position.y);
        if (dist < minDistance) {
          const angleToEnemy = Math.atan2(enemy.position.y - state.player.position.y, enemy.position.x - state.player.position.x);
          let diff = angleToEnemy - state.player.aimRotation;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;

          if (Math.abs(diff) < AUTO_LOCK_CONE) {
            minDistance = dist;
            closestEnemy = enemy;
          }
        }
      });

      if (closestEnemy) {
        state.targetId = closestEnemy.id;
      } else if (!state.enemies.find(e => e.id === state.targetId)) {
        state.targetId = null;
      }

      // Shooting
      if (state.player.weaponCooldown > 0) state.player.weaponCooldown--;
      const firing = keysRef.current.has('Mouse0') || isFiringRef.current || keysRef.current.has('Digit1');
      if (firing && state.player.weaponCooldown === 0 && state.player.heat < state.player.maxHeat) {
        const id = `proj-${Date.now()}`;
        
        // Aim towards target if locked
        let fireRotation = state.player.aimRotation;
        if (state.targetId) {
          const target = state.enemies.find(e => e.id === state.targetId);
          if (target) {
            fireRotation = Math.atan2(target.position.y - state.player.position.y, target.position.x - state.player.position.x);
          }
        }

        state.projectiles.push({
          id,
          position: { ...state.player.position },
          velocity: {
            x: Math.cos(fireRotation) * PROJECTILE_SPEED,
            y: Math.sin(fireRotation) * PROJECTILE_SPEED,
          },
          damage: 10,
          ownerId: 'player',
          lifeTime: PROJECTILE_LIFETIME,
        });
        state.player.weaponCooldown = 10;
        state.player.heat += 5;
      }

      // ... (Rest of update logic remains same)
      // Heat dissipation
      if (state.player.heat > 0) state.player.heat -= 0.5;

      // Spawn Enemies
      if (frameCountRef.current % ENEMY_SPAWN_RATE === 0 && state.enemies.length < 10) {
        state.enemies.push(createEnemy(`enemy-${frameCountRef.current}`));
      }

      // Update Projectiles
      state.projectiles = state.projectiles.filter(p => {
        p.position.x += p.velocity.x;
        p.position.y += p.velocity.y;
        p.lifeTime--;
        if (checkCollision(p.position.x, p.position.y, 2)) return false;
        return p.lifeTime > 0;
      });

      // Update Enemies
      state.enemies.forEach(enemy => {
        const stats = enemy.type === 'warrior' ? ENEMY_STATS.WARRIOR : enemy.type === 'scout' ? ENEMY_STATS.SCOUT : ENEMY_STATS.WURM;
        if (enemy.type === 'wurm') {
          if (enemy.state === 'chase') {
            const dist = Math.hypot(state.player.position.x - enemy.position.x, state.player.position.y - enemy.position.y);
            if (dist < 200 && Math.random() > 0.99) {
              enemy.state = 'submerged';
              enemy.stateTimer = 120;
            }
          } else if (enemy.state === 'submerged') {
            enemy.stateTimer!--;
            if (enemy.stateTimer! <= 0) {
              enemy.state = 'emerging';
              enemy.stateTimer = 30;
              const angle = Math.random() * Math.PI * 2;
              enemy.position.x = state.player.position.x + Math.cos(angle) * 80;
              enemy.position.y = state.player.position.y + Math.sin(angle) * 80;
            }
            return;
          } else if (enemy.state === 'emerging') {
            enemy.stateTimer!--;
            if (enemy.stateTimer! <= 0) {
              enemy.state = 'chase';
            }
          }
        }
        const angle = Math.atan2(state.player.position.y - enemy.position.y, state.player.position.x - enemy.position.x);
        enemy.rotation = angle;
        const nextEx = enemy.position.x + Math.cos(angle) * stats.speed;
        const nextEy = enemy.position.y + Math.sin(angle) * stats.speed;
        if (!checkCollision(nextEx, enemy.position.y, enemy.radius)) enemy.position.x = nextEx;
        if (!checkCollision(enemy.position.x, nextEy, enemy.radius)) enemy.position.y = nextEy;
        const dist = Math.hypot(enemy.position.x - state.player.position.x, enemy.position.y - state.player.position.y);
        if (dist < enemy.radius + state.player.radius) {
          state.player.health -= stats.damage / 60;
          if (state.player.health <= 0) state.isGameOver = true;
        }
      });

      // Projectile-Enemy Collision
      state.projectiles = state.projectiles.filter(p => {
        if (p.ownerId !== 'player') return true;
        let hit = false;
        state.enemies = state.enemies.filter(e => {
          if (e.state === 'submerged') return true;
          const dist = Math.hypot(p.position.x - e.position.x, p.position.y - e.position.y);
          if (dist < e.radius + 5) {
            e.health -= p.damage;
            hit = true;
            if (e.health <= 0) {
              state.score += 100;
              if (state.targetId === e.id) state.targetId = null;
              return false;
            }
          }
          return true;
        });
        return !hit;
      });

      onStateUpdate({ ...state });
    };

    const draw = () => {
      const state = gameStateRef.current;
      ctx.fillStyle = COLORS.BG;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // ... (Map drawing remains same)
      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          const tile = BOG_MAP[y][x];
          if (tile === TileType.GROUND) continue;
          if (tile === TileType.WATER) ctx.fillStyle = COLORS.WATER;
          else if (tile === TileType.WALL) ctx.fillStyle = COLORS.WALL;
          else if (tile === TileType.RUIN) ctx.fillStyle = COLORS.RUIN;
          else if (tile === TileType.TREE) ctx.fillStyle = COLORS.TREE;
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = 'rgba(255,255,255,0.05)';
          ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }

      // Draw Target Indicator
      if (state.targetId) {
        const target = state.enemies.find(e => e.id === state.targetId);
        if (target) {
          ctx.strokeStyle = '#ff0000';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(target.position.x, target.position.y, target.radius + 10, 0, Math.PI * 2);
          ctx.stroke();
          
          // Crosshair lines
          ctx.beginPath();
          ctx.moveTo(target.position.x - 15, target.position.y);
          ctx.lineTo(target.position.x + 15, target.position.y);
          ctx.moveTo(target.position.x, target.position.y - 15);
          ctx.lineTo(target.position.x, target.position.y + 15);
          ctx.stroke();
        }
      }

      // Draw Projectiles
      state.projectiles.forEach(p => {
        ctx.fillStyle = COLORS.PROJECTILE;
        ctx.beginPath();
        ctx.arc(p.position.x, p.position.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw Enemies
      state.enemies.forEach(e => {
        if (e.state === 'submerged') {
          ctx.strokeStyle = 'rgba(68, 255, 136, 0.3)';
          ctx.beginPath();
          ctx.arc(e.position.x, e.position.y, 10 + (frameCountRef.current % 20), 0, Math.PI * 2);
          ctx.stroke();
          return;
        }
        ctx.save();
        ctx.translate(e.position.x, e.position.y);
        ctx.rotate(e.rotation);
        if (e.type === 'warrior') ctx.fillStyle = COLORS.ENEMY_WARRIOR;
        else if (e.type === 'scout') ctx.fillStyle = COLORS.ENEMY_SCOUT;
        else ctx.fillStyle = COLORS.ENEMY_WURM;
        if (e.type === 'wurm') {
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(-i * 10, 0, e.radius - i * 2, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          ctx.beginPath();
          ctx.moveTo(e.radius, 0);
          ctx.lineTo(-e.radius, -e.radius);
          ctx.lineTo(-e.radius, e.radius);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = '#550000';
        ctx.fillRect(-e.radius, -e.radius - 10, e.radius * 2, 4);
        ctx.fillStyle = e.type === 'wurm' ? '#44ff88' : '#ff0000';
        ctx.fillRect(-e.radius, -e.radius - 10, (e.health / e.maxHealth) * (e.radius * 2), 4);
        ctx.restore();
      });

      // Draw Player
      ctx.save();
      ctx.translate(state.player.position.x, state.player.position.y);
      
      // Lower Half (Movement)
      ctx.save();
      ctx.rotate(state.player.movementRotation);
      ctx.fillStyle = '#004400';
      ctx.fillRect(-18, -18, 36, 36);
      // Movement indicator
      ctx.fillStyle = '#00ff00';
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(10, -5);
      ctx.lineTo(10, 5);
      ctx.fill();
      ctx.restore();

      // Upper Half (Aiming)
      ctx.save();
      ctx.rotate(state.player.aimRotation);
      ctx.fillStyle = COLORS.PLAYER;
      ctx.fillRect(-12, -12, 24, 24);
      // Cockpit
      ctx.fillStyle = '#003300';
      ctx.fillRect(4, -6, 6, 12);
      // Weapons
      ctx.fillStyle = '#333';
      ctx.fillRect(6, -11, 10, 3);
      ctx.fillRect(6, 8, 10, 3);
      // Aim indicator
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(200, 0);
      ctx.stroke();
      ctx.restore();

      ctx.restore();

      if (state.isGameOver) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = '#ff0000';
        ctx.font = 'bold 48px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText('MISSION FAILED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.font = '24px Orbitron';
        ctx.fillText(`SCORE: ${state.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60);
      }
    };

    const renderLoop = () => {
      update();
      draw();
      animationFrameId = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onStateUpdate]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      className="w-full h-full object-contain bg-black"
    />
  );
};
