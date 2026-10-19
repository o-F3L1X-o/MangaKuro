from pathlib import Path
from typing import List, Tuple
from PIL import Image, ImageOps, ImageStat

def find_best_horizontal_cut(img: Image.Image, target_y: int, search_radius: int = 400) -> int:
    """
    Finds the cleanest seam (lowest color variance or solid gutter/margin)
    within [target_y - search_radius, target_y + search_radius].
    Gives strong preference to cutting at the center of empty spaces (gutters) between panels.
    """
    w, h = img.size
    min_y = max(10, target_y - search_radius)
    max_y = min(h - 10, target_y + search_radius)
    if min_y >= max_y:
        return target_y

    # Convert search crop to grayscale to find minimum row-variance quickly
    search_crop = img.crop((0, min_y, w, max_y)).convert("L")
    crop_w, crop_h = search_crop.size

    pixels = search_crop.load()
    row_variances = []
    
    # Step through pixels horizontally to check variance quickly
    step_x = max(1, crop_w // 60)
    for row_idx in range(crop_h):
        row_vals = [pixels[col, row_idx] for col in range(0, crop_w, step_x)]
        mean_val = sum(row_vals) / len(row_vals)
        variance = sum((v - mean_val) ** 2 for v in row_vals) / len(row_vals)
        
        # Pure white/solid light gutter (>240) or pure black/solid dark gutter (<15)
        is_solid_gutter = (mean_val > 240 and variance < 30) or (mean_val < 15 and variance < 30)
        row_variances.append((variance, is_solid_gutter, row_idx))

    # Look for contiguous runs of solid gutters to cut in the middle of them
    best_gutter_center = None
    longest_gutter_len = 0
    cur_start = None
    
    for idx, (var, is_gutter, r_idx) in enumerate(row_variances):
        if is_gutter:
            if cur_start is None:
                cur_start = r_idx
        else:
            if cur_start is not None:
                gutter_len = r_idx - cur_start
                if gutter_len > longest_gutter_len:
                    longest_gutter_len = gutter_len
                    best_gutter_center = cur_start + gutter_len // 2
                cur_start = None
    if cur_start is not None:
        gutter_len = crop_h - cur_start
        if gutter_len > longest_gutter_len:
            longest_gutter_len = gutter_len
            best_gutter_center = cur_start + gutter_len // 2

    # If we found a solid gutter of at least 15 pixels tall, cut right in its center!
    if best_gutter_center is not None and longest_gutter_len >= 15:
        return min_y + best_gutter_center

    # Otherwise, pick the row with the lowest variance, penalized slightly by distance from target_y
    best_y = target_y
    min_score = float("inf")
    target_rel = target_y - min_y

    for var, is_gutter, r_idx in row_variances:
        dist = abs(r_idx - target_rel)
        score = var + (dist * 0.05)
        if score < min_score:
            min_score = score
            best_y = min_y + r_idx

    return best_y

def slice_webtoon_image(src_path: Path, output_dir: Path, base_name: str, max_height: int = 2500) -> List[Tuple[Path, int, int]]:
    """
    Slices a tall webtoon strip into multiple images at clean panel seams.
    Returns list of (saved_file_path, width, height).
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    results: List[Tuple[Path, int, int]] = []

    with Image.open(src_path) as img:
        img = ImageOps.exif_transpose(img)
        w, h = img.size

        # If already reasonable height, return as-is
        if h <= max_height * 1.15:
            return [(src_path, w, h)]

        fmt = img.format or "JPEG"
        ext = src_path.suffix or ".jpg"

        y_start = 0
        slice_idx = 1
        search_radius = min(500, max(200, max_height // 5))

        while y_start < h:
            remaining_h = h - y_start
            if remaining_h <= max_height * 1.15:
                # Last remaining slice
                y_end = h
            else:
                target_cut = y_start + max_height
                y_end = find_best_horizontal_cut(img, target_cut, search_radius=search_radius)

            # Crop slice
            slice_crop = img.crop((0, y_start, w, y_end))
            out_filename = f"{base_name}_part{slice_idx:02d}{ext}"
            out_path = output_dir / out_filename

            # Save with maximum quality and 4:4:4 chroma subsampling for JPEG
            if ext.lower() in [".jpg", ".jpeg"] or fmt.upper() in ["JPEG", "JPG"]:
                if slice_crop.mode in ("RGBA", "P"):
                    slice_crop = slice_crop.convert("RGB")
                slice_crop.save(out_path, "JPEG", quality=95, subsampling=0)
            else:
                slice_crop.save(out_path, fmt)

            results.append((out_path, slice_crop.width, slice_crop.height))

            y_start = y_end
            slice_idx += 1

    return results

def calculate_suggested_cuts(src_path: Path, max_height: int = 2500) -> List[int]:
    """
    Scans a webtoon strip and returns optimal horizontal cut lines (Y coordinates)
    at gutters between panels.
    """
    cuts: List[int] = []
    with Image.open(src_path) as img:
        img = ImageOps.exif_transpose(img)
        w, h = img.size
        if h <= max_height * 1.15:
            return cuts

        y_start = 0
        search_radius = min(500, max(200, max_height // 5))

        while y_start < h:
            remaining_h = h - y_start
            if remaining_h <= max_height * 1.15:
                break
            target_cut = y_start + max_height
            y_end = find_best_horizontal_cut(img, target_cut, search_radius=search_radius)
            if y_end <= y_start or y_end >= h:
                break
            cuts.append(int(y_end))
            y_start = y_end

    return cuts

def slice_image_at_points(
    src_path: Path, 
    output_dir: Path, 
    base_name: str, 
    cut_points: List[int]
) -> List[Tuple[Path, int, int]]:
    """
    Slices an image at specific user-defined or suggested Y coordinates.
    Returns list of (saved_file_path, width, height).
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    results: List[Tuple[Path, int, int]] = []

    with Image.open(src_path) as img:
        img = ImageOps.exif_transpose(img)
        w, h = img.size
        fmt = img.format or "JPEG"
        ext = src_path.suffix or ".jpg"

        # Sanitize and sort cut points strictly between 10 and h-10
        valid_cuts = sorted(list({int(pt) for pt in cut_points if 10 <= int(pt) <= h - 10}))
        if not valid_cuts:
            return [(src_path, w, h)]

        points = [0] + valid_cuts + [h]
        for idx in range(len(points) - 1):
            y0 = points[idx]
            y1 = points[idx + 1]
            if y1 <= y0:
                continue

            slice_crop = img.crop((0, y0, w, y1))
            out_filename = f"{base_name}_part{idx+1:02d}{ext}"
            out_path = output_dir / out_filename

            if ext.lower() in [".jpg", ".jpeg"] or fmt.upper() in ["JPEG", "JPG"]:
                if slice_crop.mode in ("RGBA", "P"):
                    slice_crop = slice_crop.convert("RGB")
                slice_crop.save(out_path, "JPEG", quality=95, subsampling=0)
            else:
                slice_crop.save(out_path, fmt)

            results.append((out_path, slice_crop.width, slice_crop.height))

    return results

