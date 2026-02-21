import React, { useEffect, useRef, useState } from 'react';
import { GameState, Player, Enemy, Projectile, Vector2, ReloadMode, ActionType, BurstPayload } from '../types';
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
  AUTO_LOCK_CONE,
  GLADIUS,
  WEAPON_SWAP_DURATION,
  VISION_RANGE,
  FOG_COLOR,
  BOG_MAP
} from '../constants';

const centerX = Math.floor(MAP_WIDTH / 2);
const centerY = Math.floor(MAP_HEIGHT / 2);

const createPlayer = (): Player => ({
  id: 'player',
  position: { x: centerX * TILE_SIZE, y: centerY * TILE_SIZE },
  velocity: { x: 0, y: 0 },
  rotation: 0,
  movementRotation: 0,
  aimRotation: 0,
  radius: 18,
  health: PLAYER_MAX_HEALTH,
  maxHealth: PLAYER_MAX_HEALTH,
  energy: PLAYER_MAX_ENERGY,
  maxEnergy: PLAYER_MAX_ENERGY,
  heat: 0,
  maxHeat: PLAYER_MAX_HEAT,
  shields: 0,
  maxShields: 100,
  conditions: [],
  
  // V1 Mechanics
  weapons: [GLADIUS],
  activeWeaponIndex: 0,
  ammo: GLADIUS.reload_cooldown.max_shots,
  cooldowns: {},
  activeSkill: null,
  weaponSwapCooldown: 0,
});

const createEnemy = (id: string, playerPos: Vector2): Enemy => {
  const types: ('warrior' | 'scout' | 'wurm')[] = ['warrior', 'scout', 'wurm'];
  const type = types[Math.floor(Math.random() * types.length)];
  const stats = type === 'warrior' ? ENEMY_STATS.WARRIOR : type === 'scout' ? ENEMY_STATS.SCOUT : ENEMY_STATS.WURM;

  let x = 0, y = 0;
  let validPos = false;
  let attempts = 0;
  while (!validPos && attempts < 50) {
    attempts++;
    // Spawn far from player
    const angle = Math.random() * Math.PI * 2;
    const dist = 800 + Math.random() * 1000;
    x = playerPos.x + Math.cos(angle) * dist;
    y = playerPos.y + Math.sin(angle) * dist;
    
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);
    if (tx >= 0 && tx < MAP_WIDTH && ty >= 0 && ty < MAP_HEIGHT && BOG_MAP[ty]?.[tx] === TileType.GROUND) {
      validPos = true;
    }
  }

  return {
    id,
    position: { x, y },
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
    exploredTiles: new Set<string>(),
    visibleTiles: new Set<string>(),
  });

  const keysRef = useRef<Set<string>>(new Set());
  const mousePosRef = useRef<Vector2>({ x: 0, y: 0 });
  const frameCountRef = useRef(0);
  const shakeRef = useRef(0);
  const cameraRef = useRef<Vector2>({ x: 0, y: 0 });
  const visibleTilesRef = useRef<Set<string>>(new Set());

  // Line of Sight Helper: Refined to allow seeing the obstructing tile
  const hasLOS = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const steps = Math.ceil(dist / (TILE_SIZE / 4));
    
    const targetTx = Math.floor(x2 / TILE_SIZE);
    const targetTy = Math.floor(y2 / TILE_SIZE);

    for (let i = 1; i < steps; i++) {
      const px = x1 + (dx * i) / steps;
      const py = y1 + (dy * i) / steps;
      const tx = Math.floor(px / TILE_SIZE);
      const ty = Math.floor(py / TILE_SIZE);
      
      if (tx === targetTx && ty === targetTy) return true;

      if (BOG_MAP[ty]?.[tx] === TileType.WALL || BOG_MAP[ty]?.[tx] === TileType.TREE) {
        return false;
      }
    }
    return true;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => keysRef.current.add(e.code);
    const handleKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      // Mouse position in world space
      mousePosRef.current = {
        x: e.clientX - rect.left + cameraRef.current.x,
        y: e.clientY - rect.top + cameraRef.current.y,
      };
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        keysRef.current.add('Mouse0');
        const state = gameStateRef.current;
        const worldPos = mousePosRef.current;
        const clickedEnemy = state.enemies.find(e => 
          Math.hypot(e.position.x - worldPos.x, e.position.y - worldPos.y) < e.radius + 15
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

      const dt = 1 / 60; // Assuming 60fps for simplicity in V1 mechanics
      frameCountRef.current++;
      if (shakeRef.current > 0) shakeRef.current -= 0.5;

      // Update Cooldowns (Isolation Rule)
      Object.keys(state.player.cooldowns).forEach(id => {
        const cd = state.player.cooldowns[id];
        cd.remaining -= dt;
        if (cd.remaining <= 0) {
          delete state.player.cooldowns[id];
          // If it was a reload, refill ammo
          if (id.startsWith('reload_')) {
            state.player.ammo = state.player.weapons[state.player.activeWeaponIndex].reload_cooldown.max_shots;
          }
        }
      });

      if (state.player.weaponSwapCooldown > 0) {
        state.player.weaponSwapCooldown -= dt;
      }

      // Player Movement (Lower Half)
      let moveX = (keysRef.current.has('KeyD') ? 1 : 0) - (keysRef.current.has('KeyA') ? 1 : 0);
      let moveY = (keysRef.current.has('KeyS') ? 1 : 0) - (keysRef.current.has('KeyW') ? 1 : 0);
      
      // Overheat Penalty: Reduced speed
      const speedMult = state.player.heat >= state.player.maxHeat ? 0.3 : 1.0;

      if (moveVectorRef.current && (Math.abs(moveVectorRef.current.x) > 0.1 || Math.abs(moveVectorRef.current.y) > 0.1)) {
        moveX = moveVectorRef.current.x;
        moveY = moveVectorRef.current.y;
      }

      // Movement Weight: Simple acceleration
      const targetVelX = moveX * PLAYER_SPEED * speedMult;
      const targetVelY = moveY * PLAYER_SPEED * speedMult;
      state.player.velocity.x += (targetVelX - state.player.velocity.x) * 0.1;
      state.player.velocity.y += (targetVelY - state.player.velocity.y) * 0.1;

      if (Math.abs(state.player.velocity.x) > 0.1 || Math.abs(state.player.velocity.y) > 0.1) {
        state.player.movementRotation = Math.atan2(state.player.velocity.y, state.player.velocity.x);
      }

      const nextX = state.player.position.x + state.player.velocity.x;
      const nextY = state.player.position.y + state.player.velocity.y;

      if (!checkCollision(nextX, state.player.position.y, state.player.radius)) {
        state.player.position.x = nextX;
      } else {
        state.player.velocity.x = 0;
      }
      if (!checkCollision(state.player.position.x, nextY, state.player.radius)) {
        state.player.position.y = nextY;
      } else {
        state.player.velocity.y = 0;
      }

      // Camera Follow
      cameraRef.current.x = state.player.position.x - CANVAS_WIDTH / 2;
      cameraRef.current.y = state.player.position.y - CANVAS_HEIGHT / 2;

      // Update Visibility and Exploration
      state.visibleTiles.clear();
      const ptx = Math.floor(state.player.position.x / TILE_SIZE);
      const pty = Math.floor(state.player.position.y / TILE_SIZE);
      const range = Math.ceil(VISION_RANGE / TILE_SIZE) + 1;

      for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
          const tx = ptx + dx;
          const ty = pty + dy;
          if (tx < 0 || tx >= MAP_WIDTH || ty < 0 || ty >= MAP_HEIGHT) continue;
          
          const worldX = tx * TILE_SIZE + TILE_SIZE / 2;
          const worldY = ty * TILE_SIZE + TILE_SIZE / 2;
          const dist = Math.hypot(worldX - state.player.position.x, worldY - state.player.position.y);
          
          if (dist <= VISION_RANGE + TILE_SIZE) {
            if (hasLOS(state.player.position.x, state.player.position.y, worldX, worldY)) {
              const key = `${tx},${ty}`;
              state.visibleTiles.add(key);
              state.exploredTiles.add(key);
            }
          }
        }
      }

      // Hazards: Corrosive Bog Water
      if (BOG_MAP[pty]?.[ptx] === TileType.WATER) {
        state.player.health -= 0.15; // Increased danger
        if (state.player.health <= 0) state.isGameOver = true;
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

      // Target Tracking: If locked, aimRotation tracks the target
      if (state.targetId) {
        const target = state.enemies.find(e => e.id === state.targetId);
        if (target) {
          const dist = Math.hypot(target.position.x - state.player.position.x, target.position.y - state.player.position.y);
          const hasVision = state.visibleTiles.has(`${Math.floor(target.position.x / TILE_SIZE)},${Math.floor(target.position.y / TILE_SIZE)}`);
          
          if (dist < AUTO_LOCK_RANGE * 1.5 && hasVision) {
            state.player.aimRotation = Math.atan2(target.position.y - state.player.position.y, target.position.x - state.player.position.x);
          } else {
            state.targetId = null; // Lose lock if too far or out of sight
          }
        } else {
          state.targetId = null;
        }
      }

      // Auto-lock logic (Passive)
      if (!state.targetId) {
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
        }
      }

      // Skill Execution System
      const activeWeapon = state.player.weapons[state.player.activeWeaponIndex];
      const isReloading = state.player.cooldowns[activeWeapon.reload_cooldown.id] !== undefined;

      // Manual Reload
      if (keysRef.current.has('KeyR') && !isReloading && state.player.ammo < activeWeapon.reload_cooldown.max_shots) {
        const shotsFired = activeWeapon.reload_cooldown.max_shots - state.player.ammo;
        const duration = activeWeapon.reload_cooldown.mode === ReloadMode.PER_SHOT 
          ? shotsFired * activeWeapon.reload_cooldown.scalar
          : activeWeapon.reload_cooldown.max_shots * activeWeapon.reload_cooldown.scalar;
        
        state.player.cooldowns[activeWeapon.reload_cooldown.id] = {
          id: activeWeapon.reload_cooldown.id,
          remaining: duration,
          total: duration
        };
      }

      // Trigger Skill 0 (Auto-attack)
      const firing = (keysRef.current.has('Mouse0') || isFiringRef.current || keysRef.current.has('Digit1')) && !isReloading;
      if (firing && !state.player.activeSkill && state.player.ammo > 0) {
        // Auto-lock on attack if no target
        if (!state.targetId) {
          let closest: Enemy | null = null;
          let minDist = AUTO_LOCK_RANGE;
          state.enemies.forEach(e => {
            const d = Math.hypot(e.position.x - state.player.position.x, e.position.y - state.player.position.y);
            if (d < minDist && hasLOS(state.player.position.x, state.player.position.y, e.position.x, e.position.y)) {
              minDist = d;
              closest = e;
            }
          });
          if (closest) state.targetId = (closest as Enemy).id;
        }

        state.player.activeSkill = {
          skillIndex: 0,
          actionIndex: 0,
          repeatIndex: 0,
          timer: 0,
          totalActionTime: 0
        };
      }

      // Process Active Skill
      if (state.player.activeSkill) {
        const skill = activeWeapon.moveset.skill_0; // Currently only skill_0 implemented
        const actionRef = skill.sequence[state.player.activeSkill.actionIndex];
        const actionDef = activeWeapon.library?.actions.find(a => a.id === actionRef.action_id);

        if (actionDef) {
          if (state.player.activeSkill.timer <= 0) {
            // Start new action or repetition
            const duration = actionRef.duration_override || (actionDef.base_duration / actionRef.repeat);
            state.player.activeSkill.timer = duration;
            state.player.activeSkill.totalActionTime = duration;

            // Execute Payload (e.g., spawn projectiles)
            if (actionDef.type === ActionType.BURST && state.player.ammo > 0) {
              const payload = actionDef.payload as BurstPayload;
              for (let i = 0; i < payload.shot_count; i++) {
                const id = `proj-${Date.now()}-${i}`;
                let fireRotation = state.player.aimRotation;
                if (state.targetId) {
                  const target = state.enemies.find(e => e.id === state.targetId);
                  if (target) {
                    fireRotation = Math.atan2(target.position.y - state.player.position.y, target.position.x - state.player.position.x);
                  }
                }
                // Add slight spread
                const spread = (Math.random() - 0.5) * 0.1;
                state.projectiles.push({
                  id,
                  position: { ...state.player.position },
                  velocity: {
                    x: Math.cos(fireRotation + spread) * PROJECTILE_SPEED,
                    y: Math.sin(fireRotation + spread) * PROJECTILE_SPEED,
                  },
                  damage: 10 * payload.damage_mult,
                  ownerId: 'player',
                  lifeTime: PROJECTILE_LIFETIME,
                });
              }
              state.player.ammo--;
              state.player.heat += 5;

              // Auto-reload check
              if (state.player.ammo <= 0 && activeWeapon.reload_cooldown.trigger !== 'manual') {
                const duration = activeWeapon.reload_cooldown.max_shots * activeWeapon.reload_cooldown.scalar;
                state.player.cooldowns[activeWeapon.reload_cooldown.id] = {
                  id: activeWeapon.reload_cooldown.id,
                  remaining: duration,
                  total: duration
                };
              }
            }
          }

          state.player.activeSkill.timer -= dt;

          if (state.player.activeSkill.timer <= 0) {
            // Move to next repetition or action
            state.player.activeSkill.repeatIndex++;
            if (state.player.activeSkill.repeatIndex >= actionRef.repeat) {
              state.player.activeSkill.repeatIndex = 0;
              state.player.activeSkill.actionIndex++;
              if (state.player.activeSkill.actionIndex >= skill.sequence.length) {
                state.player.activeSkill = null; // Skill finished
              }
            }
          }
        } else {
          state.player.activeSkill = null;
        }
      }

      // Heat dissipation
      if (state.player.heat > 0) state.player.heat -= 0.5;

      // Spawn Enemies
      if (frameCountRef.current % ENEMY_SPAWN_RATE === 0 && state.enemies.length < 15) {
        state.enemies.push(createEnemy(`enemy-${frameCountRef.current}`, state.player.position));
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
        const distToPlayer = Math.hypot(state.player.position.x - enemy.position.x, state.player.position.y - enemy.position.y);
        
        if (enemy.stateTimer && enemy.stateTimer > 0) enemy.stateTimer--;

        // Wurm AI: Ambush predator
        if (enemy.type === 'wurm') {
          if (enemy.state === 'chase') {
            if (distToPlayer < 200 && Math.random() > 0.98) {
              enemy.state = 'submerged';
              enemy.stateTimer = 120;
            }
          } else if (enemy.state === 'submerged') {
            if (enemy.stateTimer! <= 0) {
              enemy.state = 'emerging';
              enemy.stateTimer = 45;
              const angle = Math.random() * Math.PI * 2;
              enemy.position.x = state.player.position.x + Math.cos(angle) * 60;
              enemy.position.y = state.player.position.y + Math.sin(angle) * 60;
            }
            return;
          } else if (enemy.state === 'emerging') {
            if (enemy.stateTimer! <= 0) {
              enemy.state = 'chase';
            }
          }
        }

        // Scout AI: Kiting
        if (enemy.type === 'scout') {
          if (distToPlayer < 150) {
            enemy.state = 'idle'; // Back away
            const angleAway = Math.atan2(enemy.position.y - state.player.position.y, enemy.position.x - state.player.position.x);
            const nextEx = enemy.position.x + Math.cos(angleAway) * stats.speed;
            const nextEy = enemy.position.y + Math.sin(angleAway) * stats.speed;
            if (!checkCollision(nextEx, enemy.position.y, enemy.radius)) enemy.position.x = nextEx;
            if (!checkCollision(enemy.position.x, nextEy, enemy.radius)) enemy.position.y = nextEy;
          } else if (distToPlayer > 250) {
            enemy.state = 'chase';
          } else {
            enemy.state = 'attack';
          }
        }

        // Warrior AI: Relentless pressure
        if (enemy.type === 'warrior') {
          if (distToPlayer < stats.attackRange) {
            enemy.state = 'attack';
          } else {
            enemy.state = 'chase';
          }
        }

        // LOS check for enemies: Only chase if they can see the player
        const canSeePlayer = distToPlayer < VISION_RANGE && hasLOS(enemy.position.x, enemy.position.y, state.player.position.x, state.player.position.y);
        
        if (enemy.state === 'chase' && !canSeePlayer) {
          enemy.state = 'idle';
        } else if (enemy.state === 'idle' && canSeePlayer) {
          enemy.state = 'chase';
        }

        const angle = Math.atan2(state.player.position.y - enemy.position.y, state.player.position.x - enemy.position.x);
        enemy.rotation = angle;

        if (enemy.state === 'chase') {
          const nextEx = enemy.position.x + Math.cos(angle) * stats.speed;
          const nextEy = enemy.position.y + Math.sin(angle) * stats.speed;
          if (!checkCollision(nextEx, enemy.position.y, enemy.radius)) enemy.position.x = nextEx;
          if (!checkCollision(enemy.position.x, nextEy, enemy.radius)) enemy.position.y = nextEy;
        }

        // Enemy Attacks
        if (enemy.state === 'attack' || (enemy.type === 'warrior' && distToPlayer < stats.attackRange)) {
          if (!enemy.stateTimer || enemy.stateTimer <= 0) {
            if (enemy.type === 'scout') {
              // Fire projectile
              state.projectiles.push({
                id: `en-proj-${Date.now()}-${enemy.id}`,
                position: { ...enemy.position },
                velocity: {
                  x: Math.cos(angle) * (PROJECTILE_SPEED * 0.8),
                  y: Math.sin(angle) * (PROJECTILE_SPEED * 0.8),
                },
                damage: stats.damage,
                ownerId: enemy.id,
                lifeTime: PROJECTILE_LIFETIME,
              });
            } else {
              // Melee hit
              if (distToPlayer < enemy.radius + state.player.radius + 5) {
                state.player.health -= stats.damage;
                shakeRef.current = 10; // Trigger shake
              }
            }
            enemy.stateTimer = stats.attackCooldown;
          }
        }

        if (state.player.health <= 0) state.isGameOver = true;
      });

      // Projectile Collision
      state.projectiles = state.projectiles.filter(p => {
        if (p.ownerId === 'player') {
          let hit = false;
          state.enemies = state.enemies.filter(e => {
            const dist = Math.hypot(p.position.x - e.position.x, p.position.y - e.position.y);
            if (dist < e.radius + 5) {
              // Reveal submerged enemies on hit
              if (e.state === 'submerged') {
                e.state = 'emerging';
                e.stateTimer = 30;
                state.targetId = e.id; // Lock onto revealed target
              }
              
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
        } else {
          // Enemy projectile hitting player
          const dist = Math.hypot(p.position.x - state.player.position.x, p.position.y - state.player.position.y);
          if (dist < state.player.radius + 5) {
            state.player.health -= p.damage;
            shakeRef.current = 5; // Trigger shake
            return false;
          }
          return true;
        }
      });

      onStateUpdate({ ...state });
    };

    const draw = () => {
      const state = gameStateRef.current;
      ctx.save();
      
      // Apply Screen Shake
      if (shakeRef.current > 0) {
        const sx = (Math.random() - 0.5) * shakeRef.current;
        const sy = (Math.random() - 0.5) * shakeRef.current;
        ctx.translate(sx, sy);
      }

      // Camera Transform
      ctx.translate(-cameraRef.current.x, -cameraRef.current.y);

      ctx.fillStyle = COLORS.BG;
      ctx.fillRect(cameraRef.current.x, cameraRef.current.y, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Map drawing: Only draw visible tiles
      const startX = Math.max(0, Math.floor(cameraRef.current.x / TILE_SIZE));
      const endX = Math.min(MAP_WIDTH, Math.ceil((cameraRef.current.x + CANVAS_WIDTH) / TILE_SIZE));
      const startY = Math.max(0, Math.floor(cameraRef.current.y / TILE_SIZE));
      const endY = Math.min(MAP_HEIGHT, Math.ceil((cameraRef.current.y + CANVAS_HEIGHT) / TILE_SIZE));

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const key = `${x},${y}`;
          const isVisible = state.visibleTiles.has(key);
          const isExplored = state.exploredTiles.has(key);
          
          if (!isExplored) continue;

          const tile = BOG_MAP[y][x];
          if (tile === TileType.GROUND) {
            if (isVisible) {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
              ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
            continue;
          }

          if (tile === TileType.WATER) ctx.fillStyle = COLORS.WATER;
          else if (tile === TileType.WALL) ctx.fillStyle = COLORS.WALL;
          else if (tile === TileType.RUIN) ctx.fillStyle = COLORS.RUIN;
          else if (tile === TileType.TREE) ctx.fillStyle = COLORS.TREE;

          if (!isVisible) {
            // Darken explored but not visible tiles
            ctx.save();
            ctx.globalAlpha = 0.2;
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            ctx.restore();
          } else {
            // Add a slight overlap to prevent seams
            ctx.fillRect(x * TILE_SIZE - 0.5, y * TILE_SIZE - 0.5, TILE_SIZE + 1, TILE_SIZE + 1);
          }
          
          ctx.strokeStyle = isVisible ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.01)';
          ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }

      // Draw Target Indicator
      if (state.targetId) {
        const target = state.enemies.find(e => e.id === state.targetId);
        if (target && hasLOS(state.player.position.x, state.player.position.y, target.position.x, target.position.y)) {
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
        if (hasLOS(state.player.position.x, state.player.position.y, p.position.x, p.position.y)) {
          ctx.fillStyle = COLORS.PROJECTILE;
          ctx.beginPath();
          ctx.arc(p.position.x, p.position.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Draw Enemies
      state.enemies.forEach(e => {
        if (!hasLOS(state.player.position.x, state.player.position.y, e.position.x, e.position.y)) return;
        
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
      ctx.fillStyle = state.targetId ? '#330000' : '#003300';
      ctx.fillRect(4, -6, 6, 12);
      // Weapons
      ctx.fillStyle = '#333';
      ctx.fillRect(6, -11, 10, 3);
      ctx.fillRect(6, 8, 10, 3);
      // Aim indicator
      ctx.strokeStyle = state.targetId ? 'rgba(255, 0, 0, 0.5)' : 'rgba(0, 255, 0, 0.3)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(200, 0);
      ctx.stroke();
      ctx.restore();

      ctx.restore();

      // Fog of War Overlay (Radial Vision)
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      const gradient = ctx.createRadialGradient(
        state.player.position.x - cameraRef.current.x,
        state.player.position.y - cameraRef.current.y,
        VISION_RANGE * 0.2,
        state.player.position.x - cameraRef.current.x,
        state.player.position.y - cameraRef.current.y,
        VISION_RANGE
      );
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.4)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      
      // Create a mask canvas for vision
      ctx.fillStyle = FOG_COLOR;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(
        state.player.position.x - cameraRef.current.x,
        state.player.position.y - cameraRef.current.y,
        VISION_RANGE,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();

      if (state.isGameOver) {
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = '#ff0000';
        ctx.font = 'bold 48px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText('MISSION FAILED', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.font = '24px Orbitron';
        ctx.fillText(`SCORE: ${state.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60);
      }

      ctx.restore();
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
