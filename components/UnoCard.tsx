
import React from 'react';
import { Card, CardColor, CardValue } from '../types';
import { Ban, RefreshCw, Plus, Shuffle } from 'lucide-react';

interface UnoCardProps {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  playable?: boolean;
  hidden?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const getColorClass = (color: CardColor) => {
  switch (color) {
    case CardColor.Red: return 'bg-red-500';
    case CardColor.Blue: return 'bg-blue-500';
    case CardColor.Green: return 'bg-green-500';
    case CardColor.Yellow: return 'bg-yellow-400';
    case CardColor.Black: return 'bg-gray-800';
    default: return 'bg-gray-300';
  }
};

const getTextClass = (color: CardColor) => {
    if (color === CardColor.Yellow) return 'text-black';
    return 'text-white';
}

export const UnoCard: React.FC<UnoCardProps> = ({ 
  card, 
  onClick, 
  disabled = false, 
  className = '', 
  playable = false,
  hidden = false,
  size = 'md'
}) => {
  
  const sizeClasses = {
    sm: 'w-12 h-16 text-xs',
    md: 'w-24 h-36 text-2xl',
    lg: 'w-32 h-48 text-4xl'
  };

  const renderContent = () => {
    if (hidden) {
      return (
        <div className="w-full h-full bg-gradient-to-br from-black to-gray-700 rounded-lg border-2 border-white flex items-center justify-center shadow-md">
          <div className="w-8 h-8 rounded-full bg-red-600 transform rotate-45 border-2 border-yellow-400" />
        </div>
      );
    }

    // Handle Action Symbols
    let content: React.ReactNode = card.value;
    
    if (card.value === CardValue.Skip) content = <Ban size={size === 'sm' ? 12 : 32} />;
    if (card.value === CardValue.Reverse) content = <RefreshCw size={size === 'sm' ? 12 : 32} />;
    if (card.value === CardValue.DrawTwo) content = <div className="flex items-center gap-1"><Plus size={size === 'sm' ? 10 : 20} />2</div>;
    if (card.value === CardValue.Wild) content = <Shuffle size={size === 'sm' ? 12 : 32} />;
    if (card.value === CardValue.WildDrawFour) content = <div className="flex items-center gap-1"><Plus size={size === 'sm' ? 10 : 20} />4</div>;

    // For Wild cards that have been played, show the chosen color as a border or inner ring
    const effectiveColor = card.tempColor || card.color;
    const bgClass = getColorClass(effectiveColor);
    const txtClass = getTextClass(effectiveColor);

    return (
      <div className={`w-full h-full ${bgClass} rounded-lg border-4 border-white shadow-md flex flex-col items-center justify-center relative overflow-hidden select-none`}>
        {/* Center Content */}
        <div className={`font-bold ${txtClass} drop-shadow-md`}>
           {content}
        </div>
        
        {/* Corner Content (Top Left) */}
        <div className={`absolute top-1 left-1 text-xs font-bold ${txtClass}`}>
            {typeof content === 'string' ? content : ''}
        </div>
        
        {/* Corner Content (Bottom Right - Rotated) */}
        <div className={`absolute bottom-1 right-1 text-xs font-bold ${txtClass} rotate-180`}>
             {typeof content === 'string' ? content : ''}
        </div>

        {/* Oval overlay for aesthetics like real cards */}
        <div className="absolute w-full h-full rounded-[50%] border border-white/20 scale-x-[1.5] rotate-45 pointer-events-none"></div>
      </div>
    );
  };

  return (
    <div 
      onClick={!disabled ? onClick : undefined}
      className={`
        relative transition-all duration-300 ease-out transform
        ${sizeClasses[size]}
        ${playable && !disabled ? 'cursor-pointer hover:-translate-y-6 hover:z-10 hover:scale-110 ring-4 ring-yellow-400 shadow-2xl' : ''}
        ${disabled ? 'opacity-100 cursor-default' : ''} 
        ${className}
      `}
    >
      {renderContent()}
    </div>
  );
};
