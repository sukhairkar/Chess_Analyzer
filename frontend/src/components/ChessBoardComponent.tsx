"use client";

import { Chessboard } from 'react-chessboard';
import { useState, useEffect, useRef } from 'react';

interface ChessBoardProps {
  fen: string;
  bestMove?: string | null;
  onPieceDrop?: (sourceSquare: string, targetSquare: string, piece: string) => boolean;
  lastMove?: { to: string, classification?: string | null } | null;
  winPercent: number;
  displayScore: string;
  orientation?: 'white' | 'black';
}

export default function ChessBoardComponent({ fen, bestMove, onPieceDrop, lastMove, winPercent, displayScore, orientation = 'white' }: ChessBoardProps) {
  const [boardWidth, setBoardWidth] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        // The board should take the remaining width after the 44px eval bar
        const availableWidth = Math.max(200, width - 44);
        // Limit max size to 800px to keep it centered and professional
        setBoardWidth(Math.min(availableWidth, 800));
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const customArrows = bestMove ? [
    { startSquare: bestMove.substring(0, 2), endSquare: bestMove.substring(2, 4), color: "rgba(59, 130, 246, 0.8)" }
  ] : [];

  const getBadgePosition = (square: string) => {
    if (!square || square.length !== 2) return { top: 0, left: 0 };
    const fileIndex = square.charCodeAt(0) - 97;
    const rankIndex = 8 - parseInt(square[1]);
    return {
      left: `${(fileIndex / 8) * 100}%`,
      top: `${(rankIndex / 8) * 100}%`,
    };
  };

  const currentSquareStyles = lastMove && lastMove.classification ? {
    [lastMove.to]: {
      backgroundColor: 
        lastMove.classification === 'blunder' ? 'rgba(202, 52, 49, 0.5)' :
        lastMove.classification === 'mistake' ? 'rgba(229, 143, 42, 0.5)' :
        lastMove.classification === 'inaccuracy' ? 'rgba(244, 190, 43, 0.5)' :
        lastMove.classification === 'best' ? 'rgba(129, 182, 76, 0.5)' :
        lastMove.classification === 'excellent' ? 'rgba(149, 187, 74, 0.4)' :
        lastMove.classification === 'good' ? 'rgba(150, 188, 75, 0.3)' :
        'transparent'
    }
  } : {};

  // Adjust winPercent based on board orientation
  // Calculate explicit pixel heights to guarantee rendering
  const totalHeight = boardWidth;
  const whitePx = Math.max(0, Math.min(totalHeight, (winPercent / 100) * totalHeight));
  const blackPx = totalHeight - whitePx;

  return (
    <div ref={containerRef} className="flex justify-center items-center w-full">
      <div className="flex flex-row items-stretch bg-[#1a1a1a] shadow-[0_20px_50px_rgba(0,0,0,0.8)] rounded-xl overflow-hidden border border-white/5">
        
        {/* Evaluation Bar - Physically Calculated Segments */}
        <div style={{ width: 44, height: totalHeight, backgroundColor: '#09090b' }} className="relative flex-shrink-0 border-r border-white/5 shadow-inner flex flex-col">
          {orientation === 'white' ? (
            <>
              {/* Black segment (top) */}
              <div 
                className="w-full transition-all duration-1000 ease-in-out border-b border-black/30" 
                style={{ height: blackPx, backgroundColor: '#312e2b' }}
              ></div>
              {/* White segment (bottom) */}
              <div 
                className="w-full transition-all duration-1000 ease-in-out" 
                style={{ height: whitePx, backgroundColor: '#ebebeb' }}
              ></div>
            </>
          ) : (
            <>
              {/* White segment (top) */}
              <div 
                className="w-full transition-all duration-1000 ease-in-out border-b border-black/20" 
                style={{ height: whitePx, backgroundColor: '#ebebeb' }}
              ></div>
              {/* Black segment (bottom) */}
              <div 
                className="w-full transition-all duration-1000 ease-in-out" 
                style={{ height: blackPx, backgroundColor: '#312e2b' }}
              ></div>
            </>
          )}
          
          {/* Score Text Label - High Contrast Logic */}
          <div className="absolute top-2 left-0 w-full flex justify-center pointer-events-none z-20">
            <span className={`text-[12px] font-black tracking-tight drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)] ${
              orientation === 'white' 
                ? (winPercent > 96 ? 'text-black' : 'text-white') // On White bg if winPercent high, else on Black bg
                : (winPercent < 4 ? 'text-white' : 'text-black') // On Black bg if winPercent low, else on White bg
            }`}>
              {displayScore}
            </span>
          </div>
        </div>

        {/* The Board container */}
        <div style={{ width: boardWidth, height: boardWidth }} className="relative pointer-events-auto">
          <Chessboard 
            options={{
              position: fen,
              arrows: customArrows,
              squareStyles: currentSquareStyles,
            onPieceDrop: onPieceDrop ? (sourceSquare, targetSquare, piece) => {
              if (sourceSquare && targetSquare) {
                return onPieceDrop(sourceSquare, targetSquare, piece);
              }
              return false;
            } : undefined,
            boardStyle: { width: boardWidth, height: boardWidth },
            allowDragging: true,
            animationDurationInMs: 200,
            showNotation: true,
            boardOrientation: orientation
          }}
        />
          
          {lastMove && lastMove.classification && (
            <div 
              className="absolute w-[12.5%] h-[12.5%] pointer-events-none z-20"
              style={getBadgePosition(lastMove.to)}
            >
              <div className={`absolute -top-3 -right-3 flex items-center justify-center rounded-full font-bold shadow-[0_0_15px_rgba(0,0,0,0.5)] border-[3px] border-white/90 transform scale-125 ${
                lastMove.classification === 'best' ? 'bg-[#81b64c] text-white w-7 h-7 text-xs' :
                lastMove.classification === 'excellent' ? 'bg-[#95bb4a] text-white w-7 h-7 text-xs' :
                lastMove.classification === 'good' ? 'bg-[#96bc4b] text-white w-7 h-7 text-xs' :
                lastMove.classification === 'inaccuracy' ? 'bg-[#f4be2b] text-white w-8 h-8 text-sm' :
                lastMove.classification === 'mistake' ? 'bg-[#e58f2a] text-white w-9 h-9 text-base' :
                lastMove.classification === 'blunder' ? 'bg-[#ca3431] text-white w-10 h-10 text-lg' :
                lastMove.classification === 'book' ? 'bg-[#a37953] text-white w-7 h-7 text-xs' :
                'bg-slate-500 text-white w-7 h-7 text-xs'
              }`}>
                {lastMove.classification === 'best' ? '★' :
                 lastMove.classification === 'inaccuracy' ? '?!' :
                 lastMove.classification === 'mistake' ? '?' :
                 lastMove.classification === 'blunder' ? '??' :
                 lastMove.classification === 'book' ? '📖' : '✓'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
