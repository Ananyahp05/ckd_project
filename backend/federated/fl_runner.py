"""
fl_runner.py — Standalone CLI runner for the Flower FL simulation.

Usage (from d:\\ckd_project\\backend):
    .\\env\\Scripts\\python -m federated.fl_runner
    .\\env\\Scripts\\python -m federated.fl_runner --rounds 5 --clients 3

The runner must be executed from the backend directory so that relative paths
to model/ckd_model.keras resolve correctly.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from federated.fl_server import start_simulation


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="EDCIF Federated Learning Simulation Runner"
    )
    parser.add_argument(
        "--rounds",
        type=int,
        default=3,
        help="Number of federated aggregation rounds (default: 3)",
    )
    parser.add_argument(
        "--clients",
        type=int,
        default=2,
        help="Number of simulated hospital clients (default: 2)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=str(backend_dir / "model" / "ckd_model_federated.keras"),
        help="Output path for the federated model",
    )
    return parser.parse_args()


def progress_callback(round_num: int, metrics: dict) -> None:
    acc  = metrics.get("accuracy", 0.0)
    loss = metrics.get("loss", 0.0)
    bar  = "█" * int(acc * 20) + "░" * (20 - int(acc * 20))
    print(f"  [{bar}]  accuracy={acc:.4f}  loss={loss:.4f}")


def main() -> None:
    args = parse_args()

    print("=" * 60)
    print("  EDCIF Federated Learning Simulation")
    print("=" * 60)
    print(f"  Clients : {args.clients}")
    print(f"  Rounds  : {args.rounds}")
    print(f"  Output  : {args.output}")
    print("=" * 60)

    t0 = time.perf_counter()

    result = start_simulation(
        save_path=args.output,
        num_rounds=args.rounds,
        num_clients=args.clients,
        progress_callback=progress_callback,
    )

    elapsed = time.perf_counter() - t0

    print("\n" + "=" * 60)
    print("  Simulation Summary")
    print("=" * 60)
    print(f"  Rounds completed : {result['rounds_completed']}")
    print(f"  Time elapsed     : {elapsed:.1f}s")
    final = result.get("final_metrics", {})
    print(f"  Final accuracy   : {final.get('accuracy', 'N/A')}")
    print(f"  Final loss       : {final.get('loss', 'N/A')}")
    print(f"  Model saved to   : {result['model_path']}")
    print("=" * 60)


if __name__ == "__main__":
    main()
