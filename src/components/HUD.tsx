import React from 'react';
import { GameState } from '../types';
import { motion } from 'motion/react';

interface HUDProps {
  gameState: GameState;
}

export const HUD: React.FC<HUDProps> = ({ gameState }) => {
  const { player, score } = gameState;

  return (
    <div className="absolute inset-0 pointer-events-none p-4 md:p-8 font-mono">
      {/* Top Left: Score & Status */}
      <div className="flex flex-col gap-2">
        <div className="hardware-panel p-3 md:p-4 w-32 md:w-48">
          <div className="text-[8px] md:text-[10px] text-emerald-500/50 uppercase tracking-widest mb-1">Mission Score</div>
          <div className="text-lg md:text-2xl font-display text-emerald-400 neon-text">
            {score.toLocaleString().padStart(8, '0')}
          </div>
        </div>
        <div className="hardware-panel p-2 w-32 md:w-48 flex items-center gap-2">
          <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500 animate-pulse" />
          <div className="text-[8px] md:text-[10px] text-emerald-500 uppercase">System Online</div>
        </div>
      </div>

      {/* Bottom Left: Mech Stats */}
      <div className="absolute bottom-4 md:bottom-8 left-4 md:left-8 flex flex-col gap-4">
        <div className="hardware-panel p-4 md:p-6 w-64 md:w-80">
          <div className="flex flex-col gap-3 md:gap-4">
            {/* Health */}
            <div className="space-y-1">
              <div className="flex justify-between text-[8px] md:text-[10px] uppercase tracking-tighter">
                <span className="text-emerald-500">Hull Integrity</span>
                <span className="text-emerald-400">{Math.ceil(player.health)}%</span>
              </div>
              <div className="h-1.5 md:h-2 bg-emerald-950 rounded-full overflow-hidden border border-emerald-900/50">
                <motion.div 
                  className="h-full bg-emerald-500"
                  initial={{ width: '100%' }}
                  animate={{ width: `${(player.health / player.maxHealth) * 100}%` }}
                />
              </div>
            </div>

            {/* Energy */}
            <div className="space-y-1">
              <div className="flex justify-between text-[8px] md:text-[10px] uppercase tracking-tighter">
                <span className="text-blue-500">Core Energy</span>
                <span className="text-blue-400">{Math.ceil(player.energy)}%</span>
              </div>
              <div className="h-1.5 md:h-2 bg-blue-950 rounded-full overflow-hidden border border-blue-900/50">
                <motion.div 
                  className="h-full bg-blue-500"
                  initial={{ width: '100%' }}
                  animate={{ width: `${(player.energy / player.maxEnergy) * 100}%` }}
                />
              </div>
            </div>

            {/* Heat */}
            <div className="space-y-1">
              <div className="flex justify-between text-[8px] md:text-[10px] uppercase tracking-tighter">
                <span className="text-orange-500">Thermal Load</span>
                <span className="text-orange-400">{Math.ceil(player.heat)}%</span>
              </div>
              <div className="h-1.5 md:h-2 bg-orange-950 rounded-full overflow-hidden border border-orange-900/50">
                <motion.div 
                  className="h-full bg-orange-500"
                  initial={{ width: '0%' }}
                  animate={{ width: `${(player.heat / player.maxHeat) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Right: Weapon Info (Hidden on very small screens to avoid overlap with fire button) */}
      <div className="absolute bottom-4 md:bottom-8 right-4 md:right-8 hidden sm:block">
        <div className="hardware-panel p-3 md:p-4 w-32 md:w-48 text-right">
          <div className="text-[8px] md:text-[10px] text-emerald-500/50 uppercase mb-1">Primary Weapon</div>
          <div className="text-sm md:text-lg font-display text-emerald-400">VULCAN CANNON</div>
          <div className="mt-2 flex justify-end gap-1">
            {[...Array(5)].map((_, i) => (
              <div 
                key={i} 
                className={`w-3 md:w-4 h-1 rounded-full ${i < 3 ? 'bg-emerald-500' : 'bg-emerald-900'}`} 
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
