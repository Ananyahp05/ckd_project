"""
fl_manager.py — In-memory state manager for Flower FL simulation.
Tracks the active training run, metrics history, and stdout logs.
"""

from __future__ import annotations

import asyncio
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import os

from federated.fl_server import start_simulation

class FLManager:
    def __init__(self) -> None:
        self.state: Dict[str, Any] = {
            "status": "idle",           # idle, running, completed, failed
            "current_round": 0,
            "total_rounds": 0,
            "history": [],              # list of {"round": int, "accuracy": float, "loss": float}
            "logs": [],                 # list of strings (console logs)
            "error": None,
            "final_metrics": None,
            "started_at": None,
            "completed_at": None,
        }
        self._lock = threading.Lock()

    def reset(self, total_rounds: int) -> None:
        with self._lock:
            self.state = {
                "status": "running",
                "current_round": 0,
                "total_rounds": total_rounds,
                "history": [],
                "logs": [f"[{self._time_str()}] Initializing Federated Learning simulation..."],
                "error": None,
                "final_metrics": None,
                "started_at": datetime.now(timezone.utc).isoformat(),
                "completed_at": None,
            }

    def log(self, message: str) -> None:
        with self._lock:
            formatted = f"[{self._time_str()}] {message}"
            self.state["logs"].append(formatted)
            # Cap logs to prevent memory leaks
            if len(self.state["logs"]) > 1000:
                self.state["logs"].pop(0)
            print(formatted)

    def update_round(self, round_num: int, metrics: dict) -> None:
        with self._lock:
            self.state["current_round"] = round_num
            entry = {
                "round": round_num,
                "accuracy": metrics.get("accuracy", 0.0),
                "loss": metrics.get("loss", 0.0)
            }
            self.state["history"].append(entry)
            self.state["logs"].append(
                f"[{self._time_str()}] Round {round_num} Completed — accuracy: {entry['accuracy']:.4f}, loss: {entry['loss']:.4f}"
            )

    def mark_completed(self, final_metrics: dict) -> None:
        with self._lock:
            self.state["status"] = "completed"
            self.state["final_metrics"] = final_metrics
            self.state["completed_at"] = datetime.now(timezone.utc).isoformat()
            self.state["logs"].append(f"[{self._time_str()}] Simulation completed successfully.")

    def mark_failed(self, error_message: str) -> None:
        with self._lock:
            self.state["status"] = "failed"
            self.state["error"] = error_message
            self.state["completed_at"] = datetime.now(timezone.utc).isoformat()
            self.state["logs"].append(f"[{self._time_str()}] ERROR: {error_message}")

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return dict(self.state)

    def _time_str(self) -> str:
        return datetime.now().strftime("%H:%M:%S")

    def run_in_background(self, num_rounds: int, num_clients: int, save_path: str) -> None:
        """Launches the Flower simulation in a daemon thread so it doesn't block the async loop."""
        self.reset(total_rounds=num_rounds)

        def worker():
            try:
                self.log(f"Starting Flower FL Simulation with {num_clients} clients across {num_rounds} rounds.")
                
                # Custom progress callback
                def progress_cb(round_num: int, metrics: dict):
                    self.update_round(round_num, metrics)

                # Trigger simulation (synchronous inside this thread)
                result = start_simulation(
                    save_path=save_path,
                    num_rounds=num_rounds,
                    num_clients=num_clients,
                    progress_callback=progress_cb
                )
                self.mark_completed(result.get("final_metrics", {}))
            except Exception as e:
                self.mark_failed(str(e))

        thread = threading.Thread(target=worker, daemon=True)
        thread.start()

# Singleton fl_manager
fl_manager = FLManager()
