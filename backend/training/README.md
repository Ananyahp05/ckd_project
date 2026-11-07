# EDCIF Model Training & Reproducibility Suite (Synopsis Section J.3)

This directory contains the standalone, reproducible training and validation pipelines for the three deep learning architectures specified in the **EDCIF** (Explainable Deep CKD Intelligence Framework) synopsis:

1. **Artificial Neural Network (ANN) Classifier** (`train_ann.py`)
2. **Long Short-Term Memory (LSTM) Regressor** (`train_lstm.py`)
3. **Hybrid Dense + LSTM Regressor** (`train_hybrid.py`)

---

## 1. Architecture Specifications

### Model 1: Artificial Neural Network (ANN) Binary Classifier
- **Task:** Screening classification (CKD vs. Non-CKD).
- **Input Dimension:** `(None, 34)` tabular clinical features (blood pressure, serum creatinine, hemoglobin, albumin, electrolytes, urinalysis).
- **Architecture:**
  - `InputLayer(shape=(34,))`
  - `Dense(64, activation='relu')`
  - `Dropout(rate=0.2)`
  - `Dense(32, activation='relu')`
  - `Dropout(rate=0.2)`
  - `Dense(16, activation='relu')`
  - `Dense(1, activation='sigmoid')`
- **Loss Function:** Binary Cross-Entropy
- **Optimizer:** Adam ($\alpha = 0.001$)

### Model 2: LSTM Sequential eGFR Regressor
- **Task:** Time-series renal filtration forecasting (predicting the next continuous observed eGFR).
- **Input Dimension:** `(None, 3, 3)` across 3 chronological visits.
- **Features per Timestep:** `[aval, ady, base]`
  - `aval`: eGFR measurement ($mL/min/1.73m^2$)
  - `ady`: Study day from baseline
  - `base`: Baseline renal function anchor
- **Architecture:**
  - `InputLayer(shape=(3, 3))`
  - `LSTM(64, return_sequences=True)`
  - `Dropout(rate=0.2)`
  - `LSTM(32, return_sequences=False)`
  - `Dense(16, activation='relu')`
  - `Dense(1, activation='linear')`
- **Loss Function:** Mean Squared Error (MSE) / Huber Loss
- **Optimizer:** Adam ($\alpha = 0.001$)

### Model 3: Hybrid Dense + LSTM Regressor
- **Task:** Multi-modal fusion eGFR progression regression.
- **Input Dimensions:**
  - Branch 1 (Sequential Dynamics): `sequence_input` `(None, 3, 2)` (`[aval, ady]`)
  - Branch 2 (Baseline Anchor): `baseline_input` `(None, 1)` (`[base]`)
- **Architecture:**
  - `Branch 1`: `LSTM(64, return_seq=True) -> Dropout(0.2) -> LSTM(32) -> Dense(16)`
  - `Branch 2`: `Dense(16, relu) -> Dense(8, relu)`
  - `Fusion Layer`: `Concatenate([Branch 1, Branch 2])` (Dimension: 24)
  - `Prediction Head`: `Dense(32, relu) -> Dense(16, relu) -> Dense(1, linear)`
- **Loss Function:** Mean Squared Error (MSE)
- **Optimizer:** Adam ($\alpha = 0.001$)

---

## 2. Reproduction Instructions

### Run the Entire Suite:
```bash
python training/reproduce_all.py --model all
```

### Run an Individual Model:
```bash
# Train and benchmark the ANN:
python training/train_ann.py

# Train and benchmark the LSTM:
python training/train_lstm.py

# Train and benchmark the Hybrid model:
python training/train_hybrid.py
```

### Save/Overwrite Production Artifacts:
To re-train and update the live weights in `backend/model/`:
```bash
python training/reproduce_all.py --model all --save-artifacts
```

