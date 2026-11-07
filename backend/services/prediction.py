from pathlib import Path
import os
BASE_DIR = Path(__file__).resolve().parent.parent
os.environ.setdefault("KERAS_HOME", str(BASE_DIR / ".keras_cache"))

import tensorflow as tf
import numpy as np
MODEL_PATH = BASE_DIR / "model" / "ckd_model.keras"

# Load the trained model once at startup
model = tf.keras.models.load_model(str(MODEL_PATH))

def predict_ckd(scaled_values: np.ndarray) -> float:
    # Model returns a probability for the CKD class (direct tensor call for rapid inference)
    probability = float(model(scaled_values, training=False).numpy()[0][0])
    return probability
