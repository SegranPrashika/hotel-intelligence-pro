import pandas as pd
import numpy as np
import json
import xgboost as xgb
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score, precision_recall_curve, auc, roc_curve

print("Loading and cleaning data (Ch 6)...")
df = pd.read_csv("public/hotel_bookings.csv")

# 1. Ch 6 Cleaning
df = df.drop(columns=['company'])
df['children'] = df['children'].fillna(0)
df = df[df['adr'] > 0]
df['arrival_date'] = pd.to_datetime(
    df['arrival_date_year'].astype(str) + '-' + 
    df['arrival_date_month'].astype(str) + '-' + 
    df['arrival_date_day_of_month'].astype(str),
    format='%Y-%B-%d', errors='coerce'
)
df = df.dropna(subset=['arrival_date'])
df = df.drop_duplicates()

# 2. Feature Engineering (Ch 6.1, Slide 9)
df['total_nights'] = df['stays_in_weekend_nights'] + df['stays_in_week_nights']
df['party_size'] = df['adults'] + df['children'] + df['babies']
df['has_children'] = (df['children'] > 0).astype(int)
df['cancel_ratio'] = df['previous_cancellations'] / (df['previous_cancellations'] + df['previous_bookings_not_canceled'] + 1e-6)
df['is_peak_season'] = df['arrival_date'].dt.month.isin([7, 8]).astype(int)

# 3. Leakage Control (Ch 6.1, Slide 7)
df = df.drop(columns=['reservation_status', 'reservation_status_date', 'assigned_room_type'])

# Select features
num_features = ['lead_time', 'total_nights', 'party_size', 'has_children', 'cancel_ratio', 'is_peak_season', 'previous_cancellations', 'booking_changes', 'days_in_waiting_list', 'adr', 'required_car_parking_spaces', 'total_of_special_requests']
cat_features = ['hotel', 'market_segment', 'deposit_type', 'customer_type', 'arrival_date_month']

X = df[num_features + cat_features].copy()
y = df['is_canceled']

# Time split
train_mask = df['arrival_date'] < '2017-01-01'
test_mask = df['arrival_date'] >= '2017-01-01'
X_train, y_train = X[train_mask], y[train_mask]
X_test, y_test = X[test_mask], y[test_mask]

# 4. Same data, different math (Ch 6.1, Slide 11)
print("Encoding features...")
# Logistic Regression: One-Hot Encoding
X_train_lr = pd.get_dummies(X_train, columns=cat_features)
X_test_lr = pd.get_dummies(X_test, columns=cat_features)
X_train_lr, X_test_lr = X_train_lr.align(X_test_lr, join='left', axis=1, fill_value=0)

# XGBoost: Integer Codes
X_train_xgb = X_train.copy()
X_test_xgb = X_test.copy()
for col in cat_features:
    X_train_xgb[col] = X_train_xgb[col].astype('category').cat.codes
    X_test_xgb[col] = X_test_xgb[col].astype('category').cat.codes

# 5. Train Models
print("Training Logistic Regression...")
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train_lr)
X_test_scaled = scaler.transform(X_test_lr)
lr = LogisticRegression(class_weight='balanced', max_iter=1000)
lr.fit(X_train_scaled, y_train)
lr_probs = lr.predict_proba(X_test_scaled)[:, 1]

print("Training XGBoost...")
scale_pos_weight = (len(y_train) - y_train.sum()) / y_train.sum()
xgb_model = xgb.XGBClassifier(
    scale_pos_weight=scale_pos_weight,
    max_depth=6, learning_rate=0.1, n_estimators=150,
    eval_metric='auc'
)
xgb_model.fit(X_train_xgb, y_train)
xgb_probs = xgb_model.predict_proba(X_test_xgb)[:, 1]

# 6. Metrics & Curves
print("Calculating metrics...")
def get_roc(y_true, probs):
    fpr, tpr, _ = roc_curve(y_true, probs)
    return {"fpr": fpr.tolist(), "tpr": tpr.tolist()}

def get_pr(y_true, probs):
    precision, recall, _ = precision_recall_curve(y_true, probs)
    return {"precision": precision.tolist(), "recall": recall.tolist()}

# Decile Lift
df_test = pd.DataFrame({'y_true': y_test, 'prob': xgb_probs})
df_test['decile'] = pd.qcut(df_test['prob'], 10, labels=False, duplicates='drop') + 1
decile_lift = df_test.groupby('decile')['y_true'].mean().to_dict()

# Feature Importance (XGBoost native)
importances = xgb_model.feature_importances_
feat_imp = [{"feature": f, "importance": float(i)} for f, i in zip(X_train_xgb.columns, importances)]
feat_imp.sort(key=lambda x: x["importance"], reverse=True)

output = {
    "meta": {"train_size": len(X_train), "test_size": len(X_test), "cancel_rate_test": float(y_test.mean())},
    "metrics": {
        "lr": {"roc_auc": float(roc_auc_score(y_test, lr_probs)), "pr_auc": float(auc(*precision_recall_curve(y_test, lr_probs)[1::-1]))},
        "xgb": {"roc_auc": float(roc_auc_score(y_test, xgb_probs)), "pr_auc": float(auc(*precision_recall_curve(y_test, xgb_probs)[1::-1]))}
    },
    "curves": {"roc_lr": get_roc(y_test, lr_probs), "roc_xgb": get_roc(y_test, xgb_probs), "pr_lr": get_pr(y_test, lr_probs), "pr_xgb": get_pr(y_test, xgb_probs)},
    "decile_lift": decile_lift,
    "feature_importance": feat_imp
}

with open("public/ml_outputs.json", "w") as f:
    json.dump(output, f)
print("Success! Saved to public/ml_outputs.json")