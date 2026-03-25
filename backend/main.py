import json
import os
import logging
import asyncio
from typing import List, Dict, Any, Optional

import chess
import chess.engine
import chess.pgn
import sys

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

# Load ECO Database
eco_db = {}
eco_path = os.path.join(os.path.dirname(__file__), "eco.json")
if os.path.exists(eco_path):
    try:
        with open(eco_path, "r", encoding="utf-8") as f:
            eco_db = json.load(f)
        print(f"Loaded {len(eco_db)} openings from eco.json")
    except Exception as e:
        print(f"Failed to load eco.json: {e}")
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import chess.pgn
import io
from engine import ChessEngine

app = FastAPI(title="Chess Analyzer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

chess_engine = ChessEngine()

class PGNRequest(BaseModel):
    pgn: str

@app.post("/api/parse-pgn")
async def parse_pgn(request: PGNRequest):
    pgn_string = io.StringIO(request.pgn)
    try:
        game = chess.pgn.read_game(pgn_string)
        if game is None:
            raise ValueError("Invalid PGN")
            
        headers = dict(game.headers)
        moves = []
        board = game.board()
        
        # We start with the starting FEN of the game
        initial_fen = board.fen()
        
        for move in game.mainline_moves():
            san = board.san(move)
            board.push(move)
            moves.append({
                "san": san,
                "uci": move.uci(),
                "fen": board.fen()
            })
            
        return {
            "headers": headers, 
            "initial_fen": initial_fen,
            "moves": moves
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.websocket("/ws/analyze")
async def websocket_endpoint(websocket: WebSocket):
    print("WS DEBUG: WebSocket connection received on /ws/analyze")
    await websocket.accept()
    
    engine = None
    transport = None
    task_queue = asyncio.Queue()
    
    async def worker():
        nonlocal engine
        while True:
            try:
                # Wait for next analysis request
                item = await task_queue.get()
                
                # If there are more items in the queue, skip to the latest one
                while not task_queue.empty():
                    item = task_queue.get_nowait()
                
                fen, depth, opening_name = item
                
                # Check/Initialize engine
                if engine is None or getattr(transport, "is_closing", lambda: True)():
                    try:
                        print(f"DEBUG: Initializing engine at {chess_engine.stockfish_path}")
                        transport, engine = await asyncio.wait_for(
                            chess.engine.popen_uci(chess_engine.stockfish_path),
                            timeout=10.0
                        )
                        await engine.configure({"MultiPV": 3})
                    except Exception as e:
                        print(f"CRITICAL: Engine initialization failed: {e}")
                        await websocket.send_json({"error": "Engine failed", "details": str(e)})
                        continue

                # Perform analysis
                try:
                    # Quick analysis
                    results = await chess_engine.analyze_position(fen, depth=10, engine=engine)
                    await websocket.send_json({
                        "fen": fen, 
                        "analysis": results, 
                        "is_final": False,
                        "openingName": opening_name
                    })
                    
                    # Deep analysis
                    results = await chess_engine.analyze_position(fen, depth=depth, engine=engine)
                    await websocket.send_json({
                        "fen": fen, 
                        "analysis": results, 
                        "is_final": True,
                        "openingName": opening_name
                    })
                except chess.engine.EngineTerminatedError:
                    print("ERROR: Engine terminated unexpectedly during analysis")
                    engine = None
                except Exception as e:
                    print(f"Analysis error: {e}")
                finally:
                    task_queue.task_done()
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Worker loop error: {e}")
                await asyncio.sleep(1)

    worker_task = asyncio.create_task(worker())
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if "fen" in message:
                fen = message["fen"]
                depth = message.get("depth", 15)
                
                opening_name = None
                if fen in eco_db:
                    opening_name = f"{eco_db[fen]['eco']}: {eco_db[fen]['name']}"
                
                # Just add to queue - worker will handle the rest sequentially
                await task_queue.put((fen, depth, opening_name))
                
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        worker_task.cancel()
        if engine:
            try:
                await engine.quit()
            except:
                pass

@app.websocket("/ws/analyze-game")
async def analyze_game_ws(websocket: WebSocket):
    await websocket.accept()
    analysis_lock = asyncio.Lock()
    try:
        data = await websocket.receive_text()
        message = json.loads(data)
        fens = message.get("fens", [])
        depth = message.get("depth", 10)
        
        transport, engine = await asyncio.wait_for(
            chess.engine.popen_uci(chess_engine.stockfish_path),
            timeout=10.0
        )
        try:
            await asyncio.wait_for(engine.configure({"MultiPV": 1}), timeout=2.0)
        except:
            pass
            
        last_eval = 0
        last_mate = None
        
        try:
            # We need to analyze each position: START and then after MOVE 1, then after MOVE 2, etc.
            for i in range(len(fens) - 1):
                async with analysis_lock:
                    # Analyze board BEFORE the move (fens[i]) to find the engine's suggested best move
                    board = chess.Board(fens[i])
                    info = await engine.analyse(board, chess.engine.Limit(depth=depth))
                    best_move = info["pv"][0].uci() if "pv" in info and len(info["pv"]) > 0 else None
                    pre_eval = info.get("score").white().score(mate_score=10000) if info.get("score") else 0
                    
                    # Now analyze the position AFTER the move was played (fens[i+1])
                    post_board = chess.Board(fens[i+1])
                    post_info = await engine.analyse(post_board, chess.engine.Limit(depth=depth))
                    post_score = post_info.get("score")
                    eval_score = post_score.white().score(mate_score=10000) if post_score else 0
                    mate_in = post_score.white().mate() if post_score and post_score.is_mate() else None
                
                classification = None
                is_white_turn = board.turn # True if white moved
                
                # Check for book
                opening_name = None
                if fens[i+1] in eco_db:
                    classification = "book"
                    opening_name = f"{eco_db[fens[i+1]]['eco']}: {eco_db[fens[i+1]]['name']}"
                elif i+1 <= 10 and abs(eval_score) < 50 and abs(pre_eval) < 50:
                    classification = "book"
                else:
                    # Difference from engine's perspective
                    delta = (eval_score - pre_eval) if is_white_turn else (pre_eval - eval_score)
                    
                    if mate_in is not None and last_mate is not None:
                         if is_white_turn:
                             if mate_in > 0 and last_mate > 0 and mate_in <= last_mate: classification = "best"
                             elif mate_in < 0 and last_mate > 0: classification = "blunder"
                             else: classification = "good"
                         else:
                             if mate_in < 0 and last_mate < 0 and mate_in >= last_mate: classification = "best"
                             elif mate_in > 0 and last_mate < 0: classification = "blunder"
                             else: classification = "good"
                    else:
                        if delta >= -20: classification = "best"
                        elif delta >= -50: classification = "excellent"
                        elif delta >= -100: classification = "good"
                        elif delta >= -200: classification = "inaccuracy"
                        elif delta >= -400: classification = "mistake"
                        else: classification = "blunder"
                
                last_mate = mate_in
                
                msg = {
                    "index": i, 
                    "score": eval_score,
                    "mate": mate_in,
                    "classification": classification,
                    "bestMove": best_move
                }
                
                if opening_name:
                    msg["openingName"] = opening_name
                
                await websocket.send_json(msg)
        finally:
            await engine.quit()
            
    except WebSocketDisconnect:
        print("Analyze game socket disconnected")
    except Exception as e:
        print(f"Error in game analysis: {e}")
