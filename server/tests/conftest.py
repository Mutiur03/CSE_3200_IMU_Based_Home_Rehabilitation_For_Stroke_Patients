import os
import socket
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # server/ modules importable as top-level

# Must run before any server module is imported (ingest reads these at import time).
os.environ["IMU_RAW_DIR"] = tempfile.mkdtemp()
os.environ["IMU_PROCESSED_DIR"] = tempfile.mkdtemp()
game = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)  # stands in for the Godot game
game.bind(("127.0.0.1", 0))
game.settimeout(2)
os.environ["GAME_PORT"] = str(game.getsockname()[1])
