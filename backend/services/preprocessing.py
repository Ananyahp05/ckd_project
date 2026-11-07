from pathlib import Path
import joblib
import json
import numpy as np
from models.schemas import PatientData

BASE_DIR = Path(__file__).resolve().parent.parent
scaler = joblib.load(str(BASE_DIR / "model" / "ckd_scaler.pkl"))

with open(str(BASE_DIR / "model" / "feature_names.json"), "r") as f:
    feature_names = json.load(f)

def preprocess_patient_data(data: PatientData) -> np.ndarray:
    # 1. Initialize a dict with all features as 0
    feature_dict = {f: 0.0 for f in feature_names}
    
    # 2. Map numerical features
    num_cols = ["age", "bp", "sg", "al", "su", "bgr", "bu", "sc", "sod", "pot", "hemo", "pcv", "wbcc", "rbcc"]
    for col in num_cols:
        feature_dict[col] = getattr(data, col)
        
    # 3. Map categorical features to one-hot columns based on user mapping
    if data.rbc == "normal":
        feature_dict["rbc_normal"] = 1.0
    elif data.rbc == "unknown":
        feature_dict["rbc_nan"] = 1.0
        
    if data.pc == "normal":
        feature_dict["pc_normal"] = 1.0
    elif data.pc == "unknown":
        feature_dict["pc_nan"] = 1.0
        
    if data.pcc == "present":
        feature_dict["pcc_present"] = 1.0
    elif data.pcc == "notpresent":
        feature_dict["pcc_notpresent"] = 1.0
        
    if data.ba == "present":
        feature_dict["ba_present"] = 1.0
    elif data.ba == "notpresent":
        feature_dict["ba_notpresent"] = 1.0
        
    if data.htn == "yes":
        feature_dict["htn_yes"] = 1.0
    elif data.htn == "no":
        feature_dict["htn_no"] = 1.0
        
    if data.dm == "yes":
        feature_dict["dm_yes"] = 1.0
    elif data.dm == "no":
        feature_dict["dm_no"] = 1.0
        
    if data.cad == "yes":
        feature_dict["cad_yes"] = 1.0
    elif data.cad == "no":
        feature_dict["cad_no"] = 1.0
        
    if data.appet == "poor":
        feature_dict["appet_poor"] = 1.0
    elif data.appet == "unknown":
        feature_dict["appet_nan"] = 1.0
        
    if data.pe == "yes":
        feature_dict["pe_yes"] = 1.0
    elif data.pe == "no":
        feature_dict["pe_no"] = 1.0
        
    if data.ane == "yes":
        feature_dict["ane_yes"] = 1.0
    elif data.ane == "no":
        feature_dict["ane_no"] = 1.0
        
    # 4. Construct array in exact order of feature_names.json
    ordered_values = [feature_dict[f] for f in feature_names]
    values_arr = np.array([ordered_values])
    
    # 5. Scale using saved scaler
    scaled_values = scaler.transform(values_arr)
    return scaled_values
