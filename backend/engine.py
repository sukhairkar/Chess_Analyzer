import chess
import chess.engine
import asyncio
import os
import sys

# Support custom environment variable or default to OS-specific paths
if "STOCKFISH_PATH" in os.environ:
    engine_path = os.environ["STOCKFISH_PATH"]
elif sys.platform == "win32":
    engine_path = os.path.join(os.path.dirname(__file__), "stockfish.exe")
else:
    # On Linux (Docker), Stockfish is installed via apt-get in /usr/games/stockfish
    # We check if it exists there, else fallback to searching in PATH
    if os.path.exists("/usr/games/stockfish"):
        engine_path = "/usr/games/stockfish"
    else:
        engine_path = "stockfish"

class ChessEngine:
    def __init__(self, stockfish_path=engine_path):
        self.stockfish_path = stockfish_path

    async def analyze_position(self, fen: str, depth: int = 15, engine=None):
        try:
            should_close = False
            if engine is None:
                transport, engine = await chess.engine.popen_uci(self.stockfish_path)
                should_close = True
            
            board = chess.Board(fen)
            
            # Analyze the position, evaluating the top 3 lines
            info = await engine.analyse(board, chess.engine.Limit(depth=depth), multipv=3)
            
            if should_close:
                await engine.quit()
            
            # If multipv=1, info is a dict. If multipv > 1, info is a list of dicts.
            if isinstance(info, dict):
                info = [info]
                
            results = []
            for line in info:
                score = line.get("score")
                eval_score = score.white().score(mate_score=10000) if score else 0
                mate_in = score.white().mate() if score and score.is_mate() else None
                
                pv = line.get("pv", [])
                moves = [move.uci() for move in pv]
                actual_depth = line.get("depth", depth)
                
                results.append({
                    "score": eval_score, # in centipawns from White's perspective
                    "mate": mate_in,
                    "moves": moves,
                    "bestmove": moves[0] if moves else None,
                    "depth": actual_depth
                })
            
            return results
        except Exception as e:
            print(f"Engine analysis error: {e}")
            return []
