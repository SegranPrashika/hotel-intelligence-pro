import pandas as pd
import numpy as np
import json
from pathlib import Path
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import roc_curve, auc, precision_recall_curve, confusion_matrix
import xgboost as xgb
import warnings
warnings.filterwarnings('ignore')

ROOT_DIR = Path(r"C:\Users\psegr\Desktop\Bigdata-ai\hotel-intelligence-pro")
CSV_PATH = ROOT_DIR / "hotel_bookings_cleaned.csv"
OUT_JSON = ROOT_DIR / "public" / "dashboard_data.json"

print(f"Loading actual booking data from {CSV_PATH.name}...")
df = pd.read_csv(CSV_PATH)

# 1. Feature Engineering (Mirroring the PPT logic)
# Calculate cancel_ratio
df['prev_cancel'] = df.get('previous_cancellations', 0)
df['prev_not_cancel'] = df.get('previous_bookings_not_canceled', 0)
df['cancel_ratio'] = df['prev_cancel'] / (df['prev_cancel'] + df['prev_not_cancel'] + 1e-6)

# Handle missing categorical values
cat_features = ['market_segment', 'deposit_type', 'agent', 'country']
for col in cat_features:
    df[col] = df[col].astype(str).fillna('Unknown')

# Ensure standard columns exist
df['lead_time'] = df.get('lead_time', 0)
df['parking'] = df.get('required_car_parking_spaces', 0)
df['special_req'] = df.get('total_of_special_requests', 0)

# 2. Time-based Split (< 2017 vs >= 2017)
# If arrival_date_year doesn't exist, simulate it based on index to maintain the time split
if 'arrival_date_year' in df.columns:
    train = df[df['arrival_date_year'] < 2017]
    test = df[df['arrival_date_year'] >= 2017]
else:
    split_idx = int(len(df) * 0.65)
    train = df.iloc[:split_idx]
    test = df.iloc[split_idx:]

num_features = ['lead_time', 'parking', 'special_req', 'cancel_ratio']
X_train, y_train = train[num_features + cat_features], train['is_canceled']
X_test, y_test = test[num_features + cat_features], test['is_canceled']

# 3. Models
pre_lr = ColumnTransformer([('num', StandardScaler(), num_features), ('cat', OneHotEncoder(handle_unknown='ignore', max_categories=20), cat_features)])
lr = Pipeline([('pre', pre_lr), ('clf', LogisticRegression(class_weight='balanced', max_iter=1000))])
lr.fit(X_train, y_train)

pre_xgb = ColumnTransformer([('num', 'passthrough', num_features), ('cat', OneHotEncoder(handle_unknown='ignore', max_categories=20), cat_features)])
spw = (len(y_train) - y_train.sum()) / y_train.sum() if y_train.sum() > 0 else 1
xgb_mod = Pipeline([('pre', pre_xgb), ('clf', xgb.XGBClassifier(scale_pos_weight=spw, eval_metric='logloss', random_state=42))])
xgb_mod.fit(X_train, y_train)

# 4. Predictions
y_prob_lr = lr.predict_proba(X_test)[:, 1]
y_prob_xgb = xgb_mod.predict_proba(X_test)[:, 1]
y_pred_lr = lr.predict(X_test)
y_pred_xgb = xgb_mod.predict(X_test)

# 5. Chart Data
data = {}

# ROC & PR
fpr_lr, tpr_lr, _ = roc_curve(y_test, y_prob_lr)
fpr_xgb, tpr_xgb, _ = roc_curve(y_test, y_prob_xgb)
prec_lr, rec_lr, _ = precision_recall_curve(y_test, y_prob_lr)
prec_xgb, rec_xgb, _ = precision_recall_curve(y_test, y_prob_xgb)

data['roc'] = {
    'lr': {'fpr': fpr_lr.tolist(), 'tpr': tpr_lr.tolist(), 'auc': auc(fpr_lr, tpr_lr)},
    'xgb': {'fpr': fpr_xgb.tolist(), 'tpr': tpr_xgb.tolist(), 'auc': auc(fpr_xgb, tpr_xgb)}
}
data['pr'] = {
    'lr': {'rec': rec_lr.tolist(), 'prec': prec_lr.tolist(), 'auc': auc(rec_lr, prec_lr)},
    'xgb': {'rec': rec_xgb.tolist(), 'prec': prec_xgb.tolist(), 'auc': auc(rec_xgb, prec_xgb)},
    'baseline': float(y_test.mean())
}

# Confusion Matrices
data['cm'] = {
    'lr': confusion_matrix(y_test, y_pred_lr).tolist(),
    'xgb': confusion_matrix(y_test, y_pred_xgb).tolist()
}

# Feature Importances & Coefficients
xgb_model = xgb_mod.named_steps['clf']
xgb_pre = xgb_mod.named_steps['pre']
f_names = num_features + list(xgb_pre.transformers_[1][1].get_feature_names_out(cat_features))

# Top 10 XGB
importances = xgb_model.feature_importances_
top_xgb_idx = np.argsort(importances)[-10:]
data['importance'] = {
    'features': [f_names[i] for i in top_xgb_idx],
    'values': [float(importances[i]) for i in top_xgb_idx]
}

# Top 12 LR Coefs
lr_model = lr.named_steps['clf']
lr_pre = lr.named_steps['pre']
lr_f_names = num_features + list(lr_pre.transformers_[1][1].get_feature_names_out(cat_features))
coefs = lr_model.coef_[0]
top_lr_idx = np.argsort(np.abs(coefs))[-12:]
data['coefficients'] = {
    'features': [lr_f_names[i] for i in top_lr_idx],
    'values': [float(coefs[i]) for i in top_lr_idx]
}

# Decile Lift
test_df = test.copy()
test_df['prob'] = y_prob_xgb
test_df['decile'] = pd.qcut(test_df['prob'], 10, labels=False, duplicates='drop') + 1
decile_lift = test_df.groupby('decile')['is_canceled'].mean()
data['decile'] = {
    'bins': decile_lift.index.tolist(),
    'rates': (decile_lift.values * 100).tolist(),
    'overall': float(y_test.mean() * 100)
}

# KPIs
data['kpis'] = {
    'total': len(df),
    'cancel_rate': float(y_test.mean() * 100),
    'auc_xgb': data['roc']['xgb']['auc'],
    'top_10_risk': data['decile']['rates'][-1] if len(data['decile']['rates']) > 0 else 0
}

# Save JSON
OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
with open(OUT_JSON, 'w') as f:
    json.dump(data, f)

print(f"Data processing complete. JSON saved to {OUT_JSON}")
