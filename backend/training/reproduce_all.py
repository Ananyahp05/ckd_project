"""
reproduce_all.py — Master orchestrator for reproducing all three EDCIF deep learning models:
  1. ANN Binary Classifier
  2. LSTM Sequence Regressor
  3. Hybrid Dense + LSTM Regressor
"""

import sys
import argparse
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from training.train_ann import train_ann
from training.train_lstm import train_lstm
from training.train_hybrid import train_hybrid

def main():
    parser = argparse.ArgumentParser(description="Reproduce EDCIF Deep Learning Models")
    parser.add_argument(
        "--model",
        choices=["all", "ann", "lstm", "hybrid"],
        default="all",
        help="Select which model architecture to train and benchmark (default: all)"
    )
    parser.add_argument(
        "--save-artifacts",
        action="store_true",
        help="Overwrite models in backend/model/ with newly trained weights"
    )

    args = parser.parse_args()

    results = {}
    print("\n" + "=" * 70)
    print("  EDCIF CLINICAL DEEP LEARNING MODEL REPRODUCIBILITY SUITE")
    print("=" * 70)

    if args.model in ["all", "ann"]:
        print("\n>>> [1/3] Executing ANN Classifier Training Pipeline...")
        results["ANN"] = train_ann(save_artifacts=args.save_artifacts)

    if args.model in ["all", "lstm"]:
        print("\n>>> [2/3] Executing LSTM Regressor Training Pipeline...")
        results["LSTM"] = train_lstm(save_artifacts=args.save_artifacts)

    if args.model in ["all", "hybrid"]:
        print("\n>>> [3/3] Executing Hybrid Dense + LSTM Regressor Training Pipeline...")
        results["Hybrid"] = train_hybrid(save_artifacts=args.save_artifacts)

    print("\n" + "=" * 70)
    print("  SUMMARY BENCHMARK REPORT")
    print("=" * 70)
    for model_name, res in results.items():
        print(f"\n[{model_name}]")
        for k, v in res.items():
            print(f"  {k:25s}: {v}")
    print("\n[OK] Reproducibility execution complete.\n")

if __name__ == "__main__":
    main()

