"use client";

import { useState, useEffect, useRef } from "react";
import ChessBoardComponent from "@/components/ChessBoardComponent";
import { Chess } from "chess.js";

interface Move {
  san: string;
  uci: string;
  fen: string;
  score?: number;
  mate?: number | null;
  classification?: 'book' | 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'forced';
  bestMove?: string | null;
  openingName?: string | null;
}

interface AnalysisResult {
  score: number; // centipawns
  mate: number | null;
  moves: string[];
  bestmove: string | null;
}

export default function Home() {
  const [pgnInput, setPgnInput] = useState("");
  const [moves, setMoves] = useState<Move[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [initialFen, setInitialFen] = useState("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  const [openingName, setOpeningName] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [isGameAnalyzing, setIsGameAnalyzing] = useState(false);
  const [analyzedCount, setAnalyzedCount] = useState(0);
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white");
  
  const wsRef = useRef<WebSocket | null>(null);
  const analyzeGameWsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Initialize WebSocket connection to backend
    const connectWs = () => {
      const ws = new WebSocket("ws://127.0.0.1:8000/ws/analyze");
      
      ws.onopen = () => console.log("Connected to Engine WebSocket");
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.openingName !== undefined) {
          setOpeningName(data.openingName);
        }
        
        if (data.analysis) {
          setAnalysis(data.analysis);
          setIsAnalyzing(!data.is_final);
        }
      };
      
      ws.onclose = () => {
        console.log("Disconnected, retrying...");
        setTimeout(connectWs, 3000);
      };
      
      wsRef.current = ws;
    };
    
    connectWs();
    return () => {
      wsRef.current?.close();
      analyzeGameWsRef.current?.close();
    };
  }, []);

  const analyzeFullGame = async (initFen: string, parsedMoves: Move[]) => {
    if (analyzeGameWsRef.current) {
      analyzeGameWsRef.current.close();
    }
    
    const fens = [initFen, ...parsedMoves.map(m => m.fen)];
    const ws = new WebSocket("ws://127.0.0.1:8000/ws/analyze-game");
    
    ws.onopen = () => {
      ws.send(JSON.stringify({ fens, depth: 10 }));
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const idx = data.index;
      if (idx !== undefined && idx >= 0) {
        setAnalyzedCount(c => c + 1);
        setMoves(prev => {
          const newMoves = [...prev];
          if (newMoves[idx]) {
            newMoves[idx] = {
              ...newMoves[idx],
              score: data.score,
              mate: data.mate,
              classification: data.classification,
              bestMove: data.bestMove,
              openingName: data.openingName
            };
          }
          return newMoves;
        });
      }
      
      if (idx === parsedMoves.length - 1) {
        setIsGameAnalyzing(false);
      }
    };
    
    ws.onclose = () => setIsGameAnalyzing(false);
    
    analyzeGameWsRef.current = ws;
  };

  const handleParsePGN = async () => {
    if (!pgnInput.trim()) return;
    
    try {
      const res = await fetch("http://127.0.0.1:8000/api/parse-pgn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pgn: pgnInput })
      });
      
      if (!res.ok) throw new Error("Failed to parse PGN");
      
      const data = await res.json();
      setHeaders(data.headers || {});
      setMoves(data.moves);
      setInitialFen(data.initial_fen);
      setCurrentMoveIndex(-1);
      setAnalysis([]);
      
      analyzeFullGame(data.initial_fen, data.moves);
      setIsGameAnalyzing(true);
      setAnalyzedCount(0);
    } catch (error) {
      console.error(error);
      alert("Invalid PGN or backend offline. Ensure the Python API is running on :8000.");
    }
  };

  const currentFen = currentMoveIndex >= 0 && moves.length > 0
    ? moves[currentMoveIndex].fen 
    : initialFen;

  const onPieceDrop = (sourceSquare: string, targetSquare: string, piece: string) => {
    const chess = new Chess(currentFen);
    try {
      // Piece code from react-chessboard is 'wP', 'bK' etc.
      // Chess.js expects 'p', 'q' etc for promotion.
      const move = chess.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q" // Default to queen for simplicity
      });
      
      if (move) {
        const newFen = chess.fen();
        const newMove: Move = { san: move.san, uci: move.from + move.to, fen: newFen };
        const newMoves = [...moves.slice(0, currentMoveIndex + 1), newMove];
        setMoves(newMoves);
        setCurrentMoveIndex(newMoves.length - 1);
        return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  };

  // Single position evaluation when fen changes
  useEffect(() => {
    // If we have pre-computed analysis for the current position, use it
    const nextMove = moves[currentMoveIndex + 1];
    if (nextMove && nextMove.bestMove) {
       setAnalysis([{
         score: nextMove.score || 0,
         mate: nextMove.mate || null,
         moves: [nextMove.bestMove],
         bestmove: nextMove.bestMove
       }]);
       setOpeningName(nextMove.openingName || null);
       setIsAnalyzing(false);
       return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setIsAnalyzing(true);
      setAnalysis([]);
      wsRef.current.send(JSON.stringify({ fen: currentFen, depth: 15 }));
    } else {
      // Re-trigger if socket wasn't open yet
      const timer = setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          setIsAnalyzing(true);
          setAnalysis([]);
          wsRef.current.send(JSON.stringify({ fen: currentFen, depth: 15 }));
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentFen, moves, currentMoveIndex]);

  const topEval = analysis.length > 0 ? analysis[0] : null;
  
  // Calculate evaluation bar height (scaled for visual range -5 to +5 pawns)
  const evalScore = topEval ? (topEval.mate !== null ? (topEval.mate > 0 ? 10 : -10) : topEval.score / 100) : 0;
  // Format for display
  const displayScore = topEval && topEval.mate !== null 
    ? `M${Math.abs(topEval.mate)}` 
    : (evalScore > 0 ? `+${evalScore.toFixed(2)}` : evalScore.toFixed(2));
    
  // Bar height logic: 0 = 50%, +10 = 100% white, -10 = 0% white
  // clamp between 0 and 100, ensure no NaN
  const winPercent = isNaN(evalScore) ? 50 : Math.max(0, Math.min(100, 50 + (evalScore / 5) * 50));

  return (
    <main className="min-h-screen p-8 text-slate-100 flex flex-col gap-8 max-w-[1600px] mx-auto">
      <header className="flex justify-between items-center glass-panel p-6">
        <div>
          <h1 className="text-4xl font-extrabold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            Pro Chess Analyzer
          </h1>
          <p className="text-slate-400 mt-1">Powered by Stockfish 16 & Server-Side Processing</p>
        </div>
      </header>
      
      <div className="flex flex-row gap-6 items-start justify-center w-full min-w-[1200px] overflow-x-auto pb-10">
        {/* Left Sidebar: PGN Input & Eval Info */}
        <div className="w-[320px] flex-shrink-0 flex flex-col gap-6">
          <div className="glass-panel p-5">
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
              <span className="w-2 h-6 bg-blue-500 rounded-full inline-block"></span>
              Import Game
            </h2>
            <textarea
              className="w-full h-96 resize-y bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600 custom-scrollbar"
              style={{ minHeight: '300px', maxHeight: '80vh' }}
              placeholder="Paste PGN here..."
              value={pgnInput}
              onChange={(e) => setPgnInput(e.target.value)}
            />
            <button 
              onClick={handleParsePGN}
              className="mt-3 w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-lg shadow-blue-500/20"
            >
              Analyze Game
            </button>
          </div>
          
          {openingName && (
            <div className="glass-panel p-5 border border-purple-500/30 bg-purple-900/10 shadow-[0_0_15px_rgba(168,85,247,0.1)]">
              <h2 className="text-xl font-bold mb-2 flex items-center gap-2 text-purple-200">
                <span className="w-2 h-6 bg-purple-500 rounded-full inline-block"></span>
                Opening Book
              </h2>
              <p className="text-sm font-semibold text-slate-300 leading-relaxed uppercase tracking-wider">{openingName}</p>
            </div>
          )}
        </div>

        {/* Center: Board and Eval Bar (Integrated) */}
        <div className="flex flex-col items-center flex-1 w-full max-w-[950px]">
          <div className="w-full flex flex-col shadow-2xl rounded-2xl overflow-hidden border border-slate-700/50 bg-[#1e1c1a]">
            
            {/* Top Player (Black) */}
            <div className="flex items-center gap-3 bg-slate-800/90 p-3 relative z-10 border-b border-black/20">
              <div className="w-9 h-9 rounded bg-slate-700 overflow-hidden flex items-center justify-center shadow-inner">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <div className="font-bold text-slate-200 text-sm flex gap-2 items-center">
                {headers?.Black || "Black Player"} 
                <span className="text-slate-400 text-[11px] font-normal bg-black/40 px-2 py-0.5 rounded">({headers?.BlackElo || "1500"})</span>
              </div>
            </div>
            
            <div className="w-full">
              <ChessBoardComponent 
                fen={currentFen} 
                bestMove={topEval?.bestmove}
                onPieceDrop={onPieceDrop}
                winPercent={winPercent}
                displayScore={displayScore}
                orientation={boardOrientation}
                lastMove={currentMoveIndex >= 0 && moves[currentMoveIndex] ? { 
                  to: moves[currentMoveIndex].uci.substring(2, 4), 
                  classification: moves[currentMoveIndex].classification 
                } : null}
              />
            </div>

            {/* Bottom Player (White) */}
            <div className="flex items-center gap-3 bg-slate-800/90 p-3 relative z-10 border-t border-black/20">
              <div className="w-9 h-9 rounded bg-slate-700 overflow-hidden flex items-center justify-center shadow-inner">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <div className="font-bold text-slate-200 text-sm flex gap-2 items-center">
                {headers?.White || "White Player"} 
                <span className="text-slate-400 text-[11px] font-normal bg-black/40 px-2 py-0.5 rounded">({headers?.WhiteElo || "1500"})</span>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex gap-3 justify-center mt-6">
            <button 
              onClick={() => setBoardOrientation(prev => prev === "white" ? "black" : "white")}
              className="bg-slate-800 hover:bg-slate-700 p-3 rounded-lg border border-slate-600 transition flex items-center gap-2"
              title="Flip Board"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 11V7a5 5 0 0 1 10 0v4"/><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M12 18.5V17"/></svg>
              <span className="text-sm font-semibold">Flip</span>
            </button>
            <button 
              onClick={() => setCurrentMoveIndex(-1)}
              disabled={currentMoveIndex === -1}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 p-3 rounded-lg border border-slate-600 transition"
              title="Start Positions"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/></svg>
            </button>
            <button 
              onClick={() => setCurrentMoveIndex(prev => Math.max(-1, prev - 1))}
              disabled={currentMoveIndex === -1}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 p-3 rounded-lg border border-slate-600 transition"
              title="Previous Move"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <button 
              onClick={() => setCurrentMoveIndex(prev => Math.min(moves.length - 1, prev + 1))}
              disabled={currentMoveIndex === moves.length - 1}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 p-3 rounded-lg border border-slate-600 transition"
              title="Next Move"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
            <button 
              onClick={() => setCurrentMoveIndex(moves.length - 1)}
              disabled={currentMoveIndex === moves.length - 1}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 p-3 rounded-lg border border-slate-600 transition"
              title="End Positions"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/></svg>
            </button>
          </div>
        </div>

        {/* Right Sidebar: Engine Lines & Move List */}
        <div className="w-[350px] flex-shrink-0 flex flex-col gap-6 h-[650px]">
          {/* Engine Lines */}
          <div className="glass-panel p-5 shadow-2xl relative max-h-[350px] overflow-y-auto custom-scrollbar flex flex-col">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 border-b border-slate-700/50 pb-3 shrink-0">
              <span className="w-2 h-6 bg-green-500 rounded-full inline-block"></span>
              Engine Lines
            </h2>
            <div className="flex flex-col gap-3 flex-1 overflow-y-auto pr-1">
              {analysis.length > 0 ? (
                analysis.map((line, i) => (
                  <div key={i} className={`flex flex-col gap-2 p-3 bg-slate-800/40 rounded-lg border border-slate-700/50 shadow-sm relative overflow-hidden ${i === 0 ? 'border-blue-500/40 bg-blue-500/5' : ''}`}>
                    {i === 0 && <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>}
                    <div className="flex justify-between items-center border-b border-slate-700/20 pb-2">
                       <div className="flex items-center gap-2">
                         <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Line {i + 1}</span>
                         {i === 0 && <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-bold uppercase">Best</span>}
                       </div>
                       <span className={`text-[12px] font-mono font-bold px-2 py-0.5 rounded border ${
                         line.mate ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-slate-900 text-blue-400 border-slate-700'
                       }`}>
                         {line.mate ? `#${line.mate}` : (line.score >= 0 ? `+${(line.score / 100).toFixed(2)}` : (line.score / 100).toFixed(2))}
                       </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono leading-relaxed bg-black/30 p-2 rounded break-words">
                       {line.moves.slice(0, 12).join(" ")}{line.moves.length > 12 ? "..." : ""}
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-slate-500 italic text-sm">
                  <div className="w-6 h-6 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mb-3"></div>
                  Waiting for engine...
                </div>
              )}
            </div>
          </div>
            {isAnalyzing && (
              <div className="mt-4 text-xs text-blue-400 flex items-center gap-2 animate-pulse">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                Analyzing deeply...
              </div>
            )}

          {/* Move List */}
          <div className="glass-panel p-5 flex-1 flex flex-col shadow-2xl relative overflow-hidden">
            <h2 className="text-xl font-bold mb-4 flex items-center justify-between border-b border-slate-700/50 pb-3 h-[40px] shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-6 bg-purple-500 rounded-full inline-block shadow-[0_0_10px_rgba(168,85,247,0.5)]"></span>
                Move List
              </div>
              {isGameAnalyzing && moves.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-purple-400 font-mono italic animate-pulse">Analyzing...</span>
                  <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                    <div 
                      className="h-full bg-purple-500 transition-all duration-300" 
                      style={{ width: `${(analyzedCount / moves.length) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </h2>
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative">
              {moves.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 opacity-60">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                  <p>Import a PGN to view moves</p>
                </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => (
                  <div key={i} className="col-span-2 grid grid-cols-[40px_1fr_1fr] items-center text-sm py-1 border-b border-slate-800/50">
                    <span className="text-slate-500 font-mono text-right pr-3">{i + 1}.</span>
                    
                    {/* White Move */}
                    <button
                      onClick={() => setCurrentMoveIndex(i * 2)}
                      className={`text-left px-2 py-1.5 rounded transition-all font-mono relative ${
                        currentMoveIndex === i * 2 
                          ? 'bg-blue-600 text-white font-bold shadow-md' 
                          : 'hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      {moves[i * 2].san}
                      {moves[i * 2].classification && (
                        <span className={`absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full text-[8px] font-bold ${
                          moves[i*2].classification === 'best' ? 'bg-green-500 text-white' :
                          moves[i*2].classification === 'excellent' ? 'bg-green-400 text-slate-900' :
                          moves[i*2].classification === 'good' ? 'bg-blue-400 text-white' :
                          moves[i*2].classification === 'inaccuracy' ? 'bg-yellow-500 text-slate-900' :
                          moves[i*2].classification === 'mistake' ? 'bg-orange-500 text-white' :
                          moves[i*2].classification === 'blunder' ? 'bg-red-500 text-white' :
                          'bg-slate-500 text-white'
                        }`}>
                          {moves[i*2].classification === 'best' ? '★' :
                           moves[i*2].classification === 'inaccuracy' ? '?!' :
                           moves[i*2].classification === 'mistake' ? '?' :
                           moves[i*2].classification === 'blunder' ? '??' :
                           moves[i*2].classification === 'book' ? '📖' : '✓'}
                        </span>
                      )}
                    </button>
                    
                    {/* Black Move */}
                    {moves[i * 2 + 1] ? (
                      <button
                        onClick={() => setCurrentMoveIndex(i * 2 + 1)}
                        className={`text-left px-2 py-1.5 rounded transition-all font-mono relative ${
                          currentMoveIndex === i * 2 + 1 
                            ? 'bg-blue-600 text-white font-bold shadow-md' 
                            : 'hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        {moves[i * 2 + 1].san}
                        {moves[i * 2 + 1].classification && (
                          <span className={`absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full text-[8px] font-bold ${
                            moves[i*2+1].classification === 'best' ? 'bg-green-500 text-white' :
                            moves[i*2+1].classification === 'excellent' ? 'bg-green-400 text-slate-900' :
                            moves[i*2+1].classification === 'good' ? 'bg-blue-400 text-white' :
                            moves[i*2+1].classification === 'inaccuracy' ? 'bg-yellow-500 text-slate-900' :
                            moves[i*2+1].classification === 'mistake' ? 'bg-orange-500 text-white' :
                            moves[i*2+1].classification === 'blunder' ? 'bg-red-500 text-white' :
                            'bg-slate-500 text-white'
                          }`}>
                            {moves[i*2+1].classification === 'best' ? '★' :
                             moves[i*2+1].classification === 'inaccuracy' ? '?!' :
                             moves[i*2+1].classification === 'mistake' ? '?' :
                             moves[i*2+1].classification === 'blunder' ? '??' :
                             moves[i*2+1].classification === 'book' ? '📖' : '✓'}
                          </span>
                        )}
                      </button>
                    ) : <div></div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </main>
);
}
