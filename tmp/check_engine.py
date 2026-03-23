import asyncio
import chess.engine
import os

async def main():
    path = os.path.join("backend", "stockfish.exe")
    print(f"Opening {path}...")
    try:
        transport, engine = await chess.engine.popen_uci(path)
        print("Engine opened successfully!")
        await engine.configure({"MultiPV": 3})
        print("Engine configured successfully!")
        await engine.quit()
        print("Engine closed successfully!")
    except Exception as e:
        print(f"FAILED: {e}")

if __name__ == "__main__":
    asyncio.run(main())
