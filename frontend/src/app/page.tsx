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
  depth?: number;
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
  const [engineStatus, setEngineStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  
  const wsRef = useRef<WebSocket | null>(null);
  const analyzeGameWsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Initialize WebSocket connection to backend
    const connectWs = () => {
      const ws = new WebSocket(`ws://${window.location.hostname}:8000/ws/analyze`);
      
      ws.onopen = () => {
        console.log("Connected to Engine WebSocket");
        setEngineStatus("connected");
      };
      
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
      
      ws.onclose = (e) => {
        console.warn(`Engine WebSocket closed: code=${e.code}, reason=${e.reason}`);
        setEngineStatus("disconnected");
        setTimeout(connectWs, 3000);
      };

      ws.onerror = (err) => {
        console.error("Engine WebSocket Error:", err);
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
    const ws = new WebSocket(`ws://${window.location.hostname}:8000/ws/analyze-game`);
    
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
      const res = await fetch(`http://${window.location.hostname}:8000/api/parse-pgn`, {
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
    // Use pre-computed opening name if available
    const nextMove = moves[currentMoveIndex + 1];
    if (nextMove && nextMove.openingName) {
       setOpeningName(nextMove.openingName);
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
    <div className="min-h-screen bg-[#09090b] text-slate-50 font-sans antialiased">
      {/* Premium Navigation Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-white/5 bg-black/60 backdrop-blur-xl">
        <div className="max-w-[1700px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-2 rounded-lg shadow-lg shadow-blue-500/20">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="m17 5-5-3-5 3"/><path d="m17 19-5 3-5-3"/><path d="M6 12h12"/></svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                CHESS <span className="text-blue-500">ANALYZER</span> PRO
              </h1>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                  engineStatus === "connected" ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : 
                  engineStatus === "connecting" ? "bg-amber-500" : "bg-red-500"
                }`}></span>
                Engine: {engineStatus === "connected" ? "Stockfish 16.1 Active" : 
                         engineStatus === "connecting" ? "Connecting..." : "Offline"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <span className="text-sm font-medium text-slate-400">
               Made by <span className="text-white font-bold">sukhairkar</span>
             </span>
             <div className="h-4 w-px bg-white/10 mx-2"></div>
             <a 
               href="https://github.com/sukhairkar/Chess_Analyzer" 
               target="_blank" 
               rel="noopener noreferrer"
               className="bg-white text-black text-sm font-bold px-4 py-2 rounded-lg hover:bg-slate-200 transition-all shadow-xl flex items-center gap-2"
             >
               <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.2c3-.3 6-1.5 6-7a5.2 5.2 0 0 0-1.4-3.5 4.8 4.8 0 0 0-.1-3.6s-1.1-.3-3.6 1.4a12.8 12.8 0 0 0-7 0C6 2.1 4.9 2.1 4.9 2.1a4.8 4.8 0 0 0-.1 3.6A5.2 5.2 0 0 0 3.4 9c0 5.5 3 6.7 6 7a4.8 4.8 0 0 0-1 3.2v4"></path></svg>
               GitHub
             </a>
          </div>
        </div>
      </nav>

      <main className="max-w-[1700px] mx-auto p-4 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 xl:gap-8 items-start">
          
          {/* Left Column: Import & Opening */}
          <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-6 order-2 lg:order-1">
            <section className="premium-card p-5 lg:p-6 flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Import Game</h2>
                <div className="p-1.5 bg-blue-500/10 rounded-md">
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </div>
              </div>
              <textarea
                className="w-full bg-black/40 border border-white/5 rounded-xl p-4 text-sm font-mono focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all placeholder:text-slate-700 custom-scrollbar min-h-[250px] lg:min-h-[350px]"
                placeholder="Paste PGN text here..."
                value={pgnInput}
                onChange={(e) => setPgnInput(e.target.value)}
              />
              <button 
                onClick={handleParsePGN}
                className="group relative w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-[0_20px_40px_-15px_rgba(59,130,246,0.3)] flex items-center justify-center gap-3 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite]"></div>
                <span>Start Deep Analysis</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-1 transition-transform"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </button>
            </section>

            {openingName && (
              <section className="premium-card p-6 border-l-4 border-l-purple-500 animate-in fade-in slide-in-from-left-4 duration-500">
                <div className="flex items-center gap-2 mb-3">
                   <div className="p-1.5 bg-purple-500/10 rounded-md font-bold text-[10px] text-purple-400 uppercase tracking-widest">Opening</div>
                </div>
                <h3 className="text-base lg:text-lg font-bold text-white leading-snug">{openingName}</h3>
                <p className="text-[10px] text-slate-500 mt-2 font-medium uppercase tracking-wider">ECO Master Database Verification</p>
              </section>
            )}

            {/* Repositioned Board Controls */}
            <section className="premium-card p-3 lg:p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between px-2">
                <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Controls</h2>
                <div className="flex items-center gap-1.5">
                   <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"></div>
                   <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Interactive</span>
                </div>
              </div>
              <div className="bg-black/40 border border-white/5 p-1.5 rounded-xl flex items-center justify-between backdrop-blur-xl shadow-inner">
                <button onClick={() => setBoardOrientation(prev => prev === "white" ? "black" : "white")} className="p-2 hover:bg-white/5 rounded-lg transition-all text-slate-400 hover:text-white shrink-0" title="Flip Board">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 11V7a5 5 0 0 1 10 0v4"/><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M12 18.5V17"/></svg>
                </button>
                <div className="h-4 w-px bg-white/10 mx-1 shrink-0"></div>
                <button onClick={() => setCurrentMoveIndex(-1)} disabled={currentMoveIndex === -1} className="p-2 hover:bg-white/5 rounded-lg transition-all text-slate-400 hover:text-white disabled:opacity-20 shrink-0" title="Start">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/></svg>
                </button>
                <button onClick={() => setCurrentMoveIndex(prev => Math.max(-1, prev - 1))} disabled={currentMoveIndex === -1} className="p-2.5 bg-slate-800/80 hover:bg-slate-700 rounded-lg transition-all text-white disabled:opacity-20 shadow-lg shrink-0" title="Back">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <button onClick={() => setCurrentMoveIndex(prev => Math.min(moves.length - 1, prev + 1))} disabled={currentMoveIndex === moves.length - 1} className="p-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg transition-all text-white disabled:opacity-20 shadow-lg shadow-blue-500/20 shrink-0" title="Forward">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </button>
                <button onClick={() => setCurrentMoveIndex(moves.length - 1)} disabled={currentMoveIndex === moves.length - 1} className="p-2 hover:bg-white/5 rounded-lg transition-all text-slate-400 hover:text-white disabled:opacity-20 shrink-0" title="End">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/></svg>
                </button>
              </div>
            </section>
          </div>

          {/* Center Column: Board Focus */}
          <div className="lg:col-span-8 xl:col-span-6 flex flex-col items-center gap-6 lg:gap-8 order-1 lg:order-2">
            <div className="w-full max-w-[850px] relative">
              <div className="glass-panel p-1 rounded-2xl lg:rounded-[2rem] shadow-2xl overflow-hidden bg-gradient-to-br from-white/5 to-transparent">
                
                {/* Top Player (Opponent) */}
                <div className="flex items-center justify-between bg-black/40 px-4 lg:px-6 py-3 lg:py-4 border-b border-white/5">
                  <div className="flex items-center gap-3 lg:gap-4">
                    <div className="relative">
                      <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center shadow-lg border border-white/10 ${boardOrientation === 'white' ? 'bg-gradient-to-br from-slate-700 to-slate-900' : 'bg-gradient-to-br from-slate-200 to-slate-400'}`}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={boardOrientation === 'white' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      </div>
                      <div className={`absolute -bottom-1 -right-1 w-3 h-3 lg:w-4 lg:h-4 rounded-full border-2 border-[#1e1c1a] ${boardOrientation === 'white' ? 'bg-black' : 'bg-white'}`}></div>
                    </div>
                    <div>
                      <div className="font-bold text-sm lg:text-base text-white tracking-tight leading-none">
                        {boardOrientation === 'white' ? (headers?.Black || "Black Player") : (headers?.White || "White Player")}
                      </div>
                      <div className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-slate-500 mt-1">
                        Rating: {boardOrientation === 'white' ? (headers?.BlackElo || "1500") : (headers?.WhiteElo || "1500")}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-[#1e1c1a] w-full flex justify-center">
                  <div className="w-full max-w-full overflow-hidden">
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
                </div>

                {/* Bottom Player (Current User) */}
                <div className="flex items-center justify-between bg-black/40 px-4 lg:px-6 py-3 lg:py-4 border-t border-white/5">
                  <div className="flex items-center gap-3 lg:gap-4">
                    <div className="relative">
                      <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center shadow-lg border border-white/10 ${boardOrientation === 'white' ? 'bg-gradient-to-br from-slate-200 to-slate-400' : 'bg-gradient-to-br from-slate-700 to-slate-900'}`}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={boardOrientation === 'white' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      </div>
                      <div className={`absolute -bottom-1 -right-1 w-3 h-3 lg:w-4 lg:h-4 rounded-full border-2 border-[#1e1c1a] ${boardOrientation === 'white' ? 'bg-white' : 'bg-black'}`}></div>
                    </div>
                    <div>
                      <div className="font-bold text-sm lg:text-base text-white tracking-tight leading-none">
                        {boardOrientation === 'white' ? (headers?.White || "White Player") : (headers?.Black || "Black Player")}
                      </div>
                      <div className="text-[9px] lg:text-[10px] font-black uppercase tracking-widest text-slate-500 mt-1">
                        Rating: {boardOrientation === 'white' ? (headers?.WhiteElo || "1500") : (headers?.BlackElo || "1500")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Right Column: Engine & Moves */}
          <div className="lg:col-span-12 xl:col-span-3 flex flex-col gap-6 order-3 h-full max-h-none xl:max-h-[850px]">
            
            {/* Engine Analysis Panel */}
            <section className="premium-card flex flex-col h-[400px]">
              <div className="p-5 lg:p-6 border-b border-white/5 flex items-center justify-between shrink-0">
                <h2 className="text-xs lg:text-sm font-black uppercase tracking-[0.2em] text-slate-500">Engine Analysis</h2>
                <div className="flex items-center gap-2">
                   {isAnalyzing && <div className="text-[10px] font-bold text-blue-400 animate-pulse uppercase tracking-wider">Solving...</div>}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-3">
                {analysis.length > 0 ? (
                  analysis.map((line, i) => (
                    <div key={i} className={`p-4 rounded-xl border transition-all ${
                      i === 0 ? 'bg-blue-600/5 border-blue-500/30 shadow-lg shadow-blue-900/10' : 'bg-white/5 border-white/5 hover:border-white/10'
                    }`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-black tracking-widest uppercase ${i === 0 ? 'text-blue-400' : 'text-slate-500'}`}>Rank {i+1}</span>
                          <span className="text-[9px] font-bold text-slate-600 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">D:{line.depth || 15}</span>
                          {i === 0 && <span className="bg-blue-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase ml-1">Optimal</span>}
                        </div>
                        <div className={`text-sm font-mono font-bold px-3 py-1 rounded-lg ${
                          line.mate ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-slate-900 text-blue-300 border border-white/5'
                        }`}>
                          {line.mate ? `#${line.mate}` : (line.score / 100).toFixed(2)}
                        </div>
                      </div>
                      <div className="text-[11px] lg:text-[12px] text-slate-400 font-mono leading-relaxed p-3 bg-black/40 rounded-lg break-words">
                        {line.moves.slice(0, 10).join(" ")}{line.moves.length > 10 ? "..." : ""}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-4 opacity-50 italic text-sm py-16 lg:py-20">
                     <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="animate-spin-slow"><path d="M12 2v4"/><path d="m16.2 4.2 2.8 2.8"/><path d="M18 12h4"/><path d="m16.2 19.8 2.8-2.8"/><path d="M12 18v4"/><path d="m4.2 19.8 2.8-2.8"/><path d="M2 12h4"/><path d="m4.2 4.2 2.8 2.8"/></svg>
                     Waiting for position...
                  </div>
                )}
              </div>
            </section>

            {/* Move List Panel */}
            <section className="premium-card flex flex-col flex-1 min-h-[300px] xl:min-h-0">
              <div className="p-5 lg:p-6 border-b border-white/5 flex items-center justify-between shrink-0">
                <h2 className="text-xs lg:text-sm font-black uppercase tracking-[0.2em] text-slate-500">Move History</h2>
                {isGameAnalyzing && moves.length > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] font-black text-purple-400 uppercase tracking-widest animate-pulse">Deep Scan</span>
                    <div className="w-16 lg:w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-white/5">
                      <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${(analyzedCount / moves.length) * 100}%` }}></div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {moves.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-4 opacity-40 py-16 lg:py-20">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                    <p className="text-xs font-medium">Capture a PGN to analyze moves</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => (
                      <div key={i} className="col-span-2 grid grid-cols-[36px_1fr_1fr] items-stretch gap-2 group">
                        <div className="flex items-center justify-center text-[10px] font-black text-slate-600 border-r border-white/5 py-2">{i + 1}</div>
                        
                        {/* White Move */}
                        <button
                          onClick={() => setCurrentMoveIndex(i * 2)}
                          className={`text-left px-3 py-2 rounded-lg transition-all font-mono text-xs lg:text-sm relative group/move ${
                            currentMoveIndex === i * 2 
                              ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-900/20' 
                              : 'hover:bg-white/5 text-slate-400 hover:text-white'
                          }`}
                        >
                          <span className="relative z-10">{moves[i * 2].san}</span>
                        </button>
                        
                        {/* Black Move */}
                        {moves[i * 2 + 1] ? (
                          <button
                            onClick={() => setCurrentMoveIndex(i * 2 + 1)}
                            className={`text-left px-3 py-2 rounded-lg transition-all font-mono text-xs lg:text-sm relative group/move ${
                              currentMoveIndex === i * 2 + 1 
                                ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-900/20' 
                                : 'hover:bg-white/5 text-slate-400 hover:text-white'
                            }`}
                          >
                            <span className="relative z-10">{moves[i * 2 + 1].san}</span>
                          </button>
                        ) : <div className="rounded-lg bg-black/5 opacity-20"></div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
