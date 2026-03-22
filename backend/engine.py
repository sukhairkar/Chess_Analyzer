import chess
import chess.engine
import asyncio
import os

engine_path = os.path.join(os.path.dirname(__file__), "stockfish.exe")

class ChessEngine:
    def __init__(self, stockfish_path=engine_path):
        self.stockfish_path = stockfish_path

    async def analyze_position(self, fen: str, depth: int = 15):
        try:
            transport, engine = await chess.engine.popen_uci(self.stockfish_path)
            board = chess.Board(fen)
            
            # Analyze the position, evaluating the top 3 lines
            info = await engine.analyse(board, chess.engine.Limit(depth=depth), multipv=3)
            
            await engine.quit()
            
            results = []
            for line in info:
                score = line.get("score")
                eval_score = score.white().score(mate_score=10000) if score else 0
                mate_in = score.white().mate() if score and score.is_mate() else None
                
                pv = line.get("pv", [])
                moves = [move.uci() for move in pv]
                
                results.append({
                    "score": eval_score, # in centipawns from White's perspective
                    "mate": mate_in,
                    "moves": moves,
                    "bestmove": moves[0] if moves else None
                })
                
            return results
        except Exception as e:
            print(f"Engine analysis error: {e}")
            return []
