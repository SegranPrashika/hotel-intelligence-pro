import pandas as pd

df = pd.read_csv("public/hotel_bookings.csv")
unique = df.drop_duplicates()

print("rows:", len(df))
print("unique rows:", len(unique))
print("unique canceled:", int(unique["is_canceled"].sum()))
print("unique cancellation rate:", round(unique["is_canceled"].mean(), 6))
print("pandas version:", pd.__version__)