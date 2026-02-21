import { Vector2 } from './types';

export const CANVAS_WIDTH = 1200;
export const CANVAS_HEIGHT = 800;

export const PLAYER_SPEED = 5;
export const PLAYER_ROTATION_SPEED = 0.1;
export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_MAX_ENERGY = 100;
export const PLAYER_MAX_HEAT = 100;

export const PROJECTILE_SPEED = 12;
export const PROJECTILE_LIFETIME = 100; // frames

export const ENEMY_SPAWN_RATE = 120; // frames
export const AUTO_LOCK_RANGE = 400;
export const AUTO_LOCK_CONE = Math.PI / 4; // 45 degrees

export const TILE_SIZE = 40;
export const MAP_WIDTH = 30;
export const MAP_HEIGHT = 20;

export enum TileType {
  GROUND = 0,
  WATER = 1,
  WALL = 2,
  RUIN = 3,
  TREE = 4,
}

export const ENEMY_STATS = {
  WARRIOR: { hp: 800, speed: 2, damage: 10, radius: 18 },
  SCOUT: { hp: 500, speed: 3.5, damage: 5, radius: 14 },
  WURM: { hp: 1200, speed: 1.5, damage: 20, radius: 22 },
};

export const COLORS = {
  BG: '#080c08',
  PLAYER: '#00ff00',
  ENEMY_WARRIOR: '#ff4400',
  ENEMY_SCOUT: '#ffaa00',
  ENEMY_WURM: '#44ff88',
  PROJECTILE: '#ffff00',
  UI_ACCENT: '#00ff00',
  UI_BG: 'rgba(0, 20, 0, 0.8)',
  GRID: 'rgba(0, 255, 0, 0.05)',
  WATER: 'rgba(13, 58, 34, 0.6)',
  WALL: '#2c2520',
  RUIN: '#201c18',
  TREE: '#0a120a',
};
