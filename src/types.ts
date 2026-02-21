export interface Vector2 {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  position: Vector2;
  velocity: Vector2;
  rotation: number;
  radius: number;
  health: number;
  maxHealth: number;
}

export interface Player extends Entity {
  movementRotation: number;
  aimRotation: number;
  energy: number;
  maxEnergy: number;
  heat: number;
  maxHeat: number;
  weaponCooldown: number;
}

export interface Enemy extends Entity {
  type: 'scout' | 'warrior' | 'wurm' | 'boss';
  targetId?: string;
  state?: 'idle' | 'chase' | 'attack' | 'submerged' | 'emerging';
  stateTimer?: number;
}

export interface Projectile {
  id: string;
  position: Vector2;
  velocity: Vector2;
  damage: number;
  ownerId: string;
  lifeTime: number;
}

export interface GameState {
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  score: number;
  targetId: string | null;
  isGameOver: boolean;
  isPaused: boolean;
}
