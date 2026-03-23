import asyncio
import chess
import chess.engine
import os

async def main():
    engine_path = r"c:\Users\supri\Desktop\Chess Analyzer\backend\stockfish.exe"
    transport, engine = await chess.engine.popen_uci(engine_path)
    
    await engine.configure({"MultiPV": 3})
    
    board = chess.Board()
    print("Analyzing starting position with MultiPV=3...")
    
    info = await engine.analyse(board, chess.engine.Limit(depth=10), multipv=3)
    
    print(f"Info type: {type(info)}")
    if isinstance(info, list):
        print(f"Info length: {len(info)}")
        for i, line in enumerate(info):
            print(f"Line {i+1} score: {line['score']}")
    else:
        print(f"Info is not a list! It's: {info}")
        
    await engine.quit()

if __name__ == "__main__":
    asyncio.run(main())
