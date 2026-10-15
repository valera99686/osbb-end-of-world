'use client';
import { type CSSProperties } from 'react';
import { Coins, Hexagon } from 'lucide-react';
import './features.css';
import { Progress } from '@/components/ui/progress';

export function Currency({
  amount,
  cores = false,
}: {
  amount: number;
  cores?: boolean;
}) {
  return (
    <span className={`currency ${cores ? 'cores' : ''}`}>
      {cores ? <Hexagon size={16} /> : <Coins size={16} />} {Math.floor(amount)}
    </span>
  );
}
export function Meter({
  value,
  max,
  label,
  color,
}: {
  value: number;
  max: number;
  label: string;
  color?: string;
}) {
  return (
    <Progress
      className="game-progress"
      value={Math.min(100, Math.max(0, (value / max) * 100))}
      aria-label={label}
      style={{ '--meter-color': color ?? 'var(--teal)' } as CSSProperties}
    />
  );
}
