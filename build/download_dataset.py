import kagglehub
import shutil
import os
from pathlib import Path

print("Downloading 515K Hotel Reviews dataset from Kaggle...")
print("(This may take 1-3 minutes; the dataset is ~250 MB)")

path = kagglehub.dataset_download("jiashenliu/515k-hotel-reviews-data-in-europe")
print(f"Downloaded to: {path}")

src = Path(path) / "Hotel_Reviews.csv"
dst_dir = Path("public")
dst_dir.mkdir(exist_ok=True)
dst = dst_dir / "Hotel_Reviews.csv"

if not src.exists():
    # Search for the CSV anywhere in the downloaded folder
    candidates = list(Path(path).rglob("*.csv"))
    if not candidates:
        raise FileNotFoundError(f"No CSV found in {path}")
    src = candidates[0]

shutil.copy2(src, dst)
size_mb = dst.stat().st_size / 1024 / 1024
print(f"Copied to: {dst.resolve()}")
print(f"Size: {size_mb:.1f} MB")