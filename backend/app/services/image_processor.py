import io
import os
from pathlib import Path
from typing import Tuple, List, Optional, Dict, Any, Union
from PIL import Image, ImageOps, ImageDraw, ImageFont

def create_thumbnail(
    src_data: Union[Path, str, bytes, io.BytesIO], 
    dest_path: Path, 
    max_size: Tuple[int, int] = (360, 480)
) -> Tuple[int, int]:
    """Generates a fast, lightweight WebP thumbnail from an image file or in-memory bytes with ultra-low CPU/RAM footprint."""
    if isinstance(src_data, (bytes, bytearray)):
        src = io.BytesIO(src_data)
    elif isinstance(src_data, str):
        src = Path(src_data)
    else:
        src = src_data

    with Image.open(src) as img:
        img = ImageOps.exif_transpose(img)
        orig_w, orig_h = img.size
        # Fast JPEG/MPO draft decode: skips full-res raster allocation (saves 80% RAM & CPU)
        if getattr(img, "format", "") in ("JPEG", "MPO"):
            img.draft("RGB", max_size)
        img.thumbnail(max_size, Image.Resampling.BILINEAR)
        # Ensure RGB mode for WebP/JPEG saving
        if img.mode in ("RGBA", "LA") and img.mode != "RGBA":
            img = img.convert("RGBA")
        elif img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(dest_path, "WEBP", quality=75, method=1)
        return orig_w, orig_h

def get_image_dimensions(image_path: Path) -> Tuple[int, int]:
    """Fast check of image dimensions without decoding entire raster."""
    with Image.open(image_path) as img:
        img = ImageOps.exif_transpose(img)
        return img.size

def rotate_image(image_path: Path, degrees: int) -> Tuple[int, int]:
    """Rotates an image in-place by given degrees (90, 180, 270) and returns new dimensions."""
    with Image.open(image_path) as img:
        img = ImageOps.exif_transpose(img)
        # 90 clockwise = Image.ROTATE_270 in PIL orientation terms
        if degrees == 90:
            rotated = img.transpose(Image.Transpose.ROTATE_270)
        elif degrees == 180:
            rotated = img.transpose(Image.Transpose.ROTATE_180)
        elif degrees == 270:
            rotated = img.transpose(Image.Transpose.ROTATE_90)
        else:
            rotated = img
        
        fmt = img.format or "JPEG"
        rotated.save(image_path, fmt, quality=95)
        return rotated.size

def split_double_page(src_path: Path, out_path_1: Path, out_path_2: Path, reading_direction: str = "rtl") -> Tuple[Tuple[int, int], Tuple[int, int]]:
    """
    Splits a horizontal double page into two vertical pages.
    - If reading_direction == 'rtl' (Manga): Page 1 is Right half, Page 2 is Left half.
    - If reading_direction == 'ltr' (Comic): Page 1 is Left half, Page 2 is Right half.
    """
    with Image.open(src_path) as img:
        img = ImageOps.exif_transpose(img)
        w, h = img.size
        mid_x = w // 2

        left_crop = img.crop((0, 0, mid_x, h))
        right_crop = img.crop((mid_x, 0, w, h))

        if reading_direction == "rtl":
            page1 = right_crop
            page2 = left_crop
        else:
            page1 = left_crop
            page2 = right_crop

        fmt = img.format or "JPEG"
        page1.save(out_path_1, fmt, quality=95)
        page2.save(out_path_2, fmt, quality=95)

        return page1.size, page2.size

def convert_and_compress_image(
    src_path: Path, 
    dest_path: Path, 
    target_format: str = "webp", 
    quality: int = 85,
    auto_downscale_oversized: bool = True
):
    """Converts and compresses an image to WebP or JPG, safely handling WebP's 16383px limit."""
    with Image.open(src_path) as img:
        img = ImageOps.exif_transpose(img)
        target_fmt = target_format.lower()
        if target_fmt == "webp":
            if img.width > 16383 or img.height > 16383:
                if auto_downscale_oversized:
                    max_dim = max(img.width, img.height)
                    scale = 16383.0 / max_dim
                    new_w = max(1, int(img.width * scale))
                    new_h = max(1, int(img.height * scale))
                    img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                else:
                    raise ValueError(
                        f"La imagen mide {img.width}×{img.height} px, superando el límite técnico de WebP (16.383 px). "
                        f"Usa el cortador de Webtoon para dividir la página o activa el ajuste automático."
                    )
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGB")
            # method=4 enables full macroblock search for proper WebP compression without excessive CPU time
            img.save(dest_path, "WEBP", quality=quality, method=4)
        elif target_fmt in ("jpg", "jpeg"):
            if img.mode != "RGB":
                img = img.convert("RGB")
            # optimize=True computes optimized Huffman tables, saving 5-10% without altering pixel quality
            img.save(dest_path, "JPEG", quality=quality, optimize=True)
        else:
            # Keep original format
            fmt = img.format or "JPEG"
            img.save(dest_path, fmt)

def split_vertical_at_x(
    src_path: Path, 
    out_path_1: Path, 
    out_path_2: Path, 
    cut_x: int, 
    reading_direction: str = "rtl"
) -> Tuple[Tuple[int, int], Tuple[int, int]]:
    """
    Splits a page vertically at an exact X coordinate.
    - If reading_direction == 'rtl' (Manga): Page 1 is Right half, Page 2 is Left half.
    - If reading_direction == 'ltr' (Comic): Page 1 is Left half, Page 2 is Right half.
    """
    with Image.open(src_path) as img:
        img = ImageOps.exif_transpose(img)
        w, h = img.size
        cut_x = max(10, min(w - 10, int(cut_x)))

        left_crop = img.crop((0, 0, cut_x, h))
        right_crop = img.crop((cut_x, 0, w, h))

        if reading_direction == "rtl":
            page1 = right_crop
            page2 = left_crop
        else:
            page1 = left_crop
            page2 = right_crop

        fmt = img.format or "JPEG"
        if fmt.upper() in ("JPEG", "JPG"):
            if page1.mode in ("RGBA", "P"): page1 = page1.convert("RGB")
            if page2.mode in ("RGBA", "P"): page2 = page2.convert("RGB")
            page1.save(out_path_1, "JPEG", quality=95, subsampling=0)
            page2.save(out_path_2, "JPEG", quality=95, subsampling=0)
        else:
            page1.save(out_path_1, fmt, quality=95)
            page2.save(out_path_2, fmt, quality=95)

        return page1.size, page2.size

def crop_image_box(src_path: Path, dest_path: Path, x: int, y: int, width: int, height: int) -> Tuple[int, int]:
    """Crops an image to a specific rectangle box (x, y, width, height)."""
    with Image.open(src_path) as img:
        img = ImageOps.exif_transpose(img)
        w, h = img.size
        cx = max(0, min(w - 1, int(x)))
        cy = max(0, min(h - 1, int(y)))
        cw = max(10, min(w - cx, int(width)))
        ch = max(10, min(h - cy, int(height)))

        cropped = img.crop((cx, cy, cx + cw, cy + ch))
        fmt = img.format or "JPEG"
        if fmt.upper() in ("JPEG", "JPG"):
            if cropped.mode in ("RGBA", "P"): cropped = cropped.convert("RGB")
            cropped.save(dest_path, "JPEG", quality=95, subsampling=0)
        else:
            cropped.save(dest_path, fmt, quality=95)
        return cropped.size

def get_available_font(font_size: int = 24):
    """Returns an authentic Comic Lettering font with Unicode support, with fallback to system fonts."""
    # 1. Primary choice: Bundled Comic Lettering font (Comic Neue Bold)
    bundled_comic = Path(__file__).parent.parent / "assets" / "fonts" / "ComicNeue-Bold.ttf"
    if bundled_comic.exists():
        try:
            return ImageFont.truetype(str(bundled_comic), font_size)
        except Exception as e:
            logger.debug(f"Could not load bundled ComicNeue font: {e}")

    # 2. System fonts with comic / unicode support
    windir = os.environ.get("WINDIR", "C:\\Windows")
    font_candidates = [
        "comicbd.ttf",       # Comic Sans MS Bold
        "comic.ttf",         # Comic Sans MS
        "malgunbd.ttf",      # Malgun Gothic Bold (Korean + Latin)
        "malgun.ttf",        # Malgun Gothic
        "segoeuib.ttf",      # Segoe UI Bold
        "arialbd.ttf",       # Arial Bold
        "msgothic.ttc"       # MS Gothic (Japanese + Latin)
    ]
    for name in font_candidates:
        fpath = os.path.join(windir, "Fonts", name)
        if os.path.exists(fpath):
            try:
                return ImageFont.truetype(fpath, font_size)
            except Exception:
                pass
    try:
        return ImageFont.load_default()
    except Exception:
        return None

def hex_to_rgb(hex_code: str, default: Tuple[int, int, int] = (255, 255, 255)) -> Tuple[int, int, int]:
    try:
        clean = hex_code.lstrip("#")
        if len(clean) == 3:
            clean = "".join(c*2 for c in clean)
        return tuple(int(clean[i:i+2], 16) for i in (0, 2, 4))
    except Exception:
        return default

def wrap_text_to_width(text: str, font: ImageFont.ImageFont, max_w: int, draw: ImageDraw.ImageDraw) -> str:
    """Wraps text so lines do not exceed max_w while preserving user newlines."""
    if max_w <= 0:
        return text
    lines = []
    for paragraph in text.split("\n"):
        if not paragraph.strip():
            lines.append("")
            continue
        words = paragraph.split(" ")
        cur_line = ""
        for w in words:
            candidate = f"{cur_line} {w}".strip() if cur_line else w
            bbox = draw.textbbox((0, 0), candidate, font=font)
            if (bbox[2] - bbox[0]) <= max_w:
                cur_line = candidate
            else:
                if cur_line:
                    lines.append(cur_line)
                    cur_line = w
                else:
                    lines.append(w)
                    cur_line = ""
        if cur_line:
            lines.append(cur_line)
    return "\n".join(lines)

def draw_text_annotations(src_path: Path, dest_path: Path, annotations: List[Dict[str, Any]]) -> Tuple[int, int]:
    """
    Burns translation notes, speech bubbles, narration boxes and SFX text directly into the image.
    Uses authentic comic lettering font, minimal padding right to the border, and automatic wrapping.
    """
    with Image.open(src_path) as base_img:
        orig_fmt = getattr(base_img, "format", None) or "JPEG"
        base_img = ImageOps.exif_transpose(base_img)
        orig_mode = base_img.mode
        w, h = base_img.size

        # Create RGBA canvas for clean alpha-blended badges and text
        canvas = base_img.convert("RGBA")
        overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        for ann in annotations:
            raw_text = str(ann.get("text", "")).strip()
            if not raw_text:
                continue

            x = int(ann.get("x", 0))
            y = int(ann.get("y", 0))
            custom_w = int(ann.get("width") or ann.get("box_width") or 0)
            custom_h = int(ann.get("height") or ann.get("box_height") or 0)
            font_size = max(10, min(400, int(ann.get("font_size", 28))))
            style = str(ann.get("style", "badge_light")).lower()
            align = str(ann.get("align", "center")).lower()
            if align not in ("left", "center", "right"):
                align = "center"

            font = get_available_font(font_size)

            # Minimal 1px padding so text reaches right to the limits of the speech bubble
            pad_x = 1
            pad_y = 1

            # Auto-wrap text within available custom width if provided
            if custom_w > (pad_x * 2):
                wrapped_text = wrap_text_to_width(raw_text, font, custom_w - (pad_x * 2), draw)
            else:
                wrapped_text = raw_text

            bbox = draw.multiline_textbbox((0, 0), wrapped_text, font=font, align=align)
            text_w = bbox[2] - bbox[0]
            text_h = bbox[3] - bbox[1]

            # If custom box dimensions are provided, ensure text fits inside without overflowing
            if custom_w > 0 and custom_h > 0:
                max_box_w = max(10, custom_w - (pad_x * 2))
                max_box_h = max(10, custom_h - (pad_y * 2))
                while font_size > 10 and (text_w > max_box_w or text_h > max_box_h):
                    font_size -= 1
                    font = get_available_font(font_size)
                    wrapped_text = wrap_text_to_width(raw_text, font, max_box_w, draw)
                    bbox = draw.multiline_textbbox((0, 0), wrapped_text, font=font, align=align)
                    text_w = bbox[2] - bbox[0]
                    text_h = bbox[3] - bbox[1]

            # Determine final box dimensions (either explicit custom size or auto-fitted to text)
            box_w = max(custom_w, text_w + (pad_x * 2)) if custom_w > 0 else (text_w + (pad_x * 2))
            box_h = max(custom_h, text_h + (pad_y * 2)) if custom_h > 0 else (text_h + (pad_y * 2))

            box_x0 = x
            box_y0 = y
            box_x1 = box_x0 + box_w
            box_y1 = box_y0 + box_h

            # Calculate text position inside the box with vertical centering and chosen alignment
            offset_y = max(pad_y, (box_h - text_h) // 2) if box_h > text_h else pad_y
            text_y = box_y0 + offset_y - bbox[1]

            if align == "center":
                text_x = box_x0 + (box_w - text_w) // 2 - bbox[0]
            elif align == "right":
                text_x = box_x1 - pad_x - text_w - bbox[0]
            else: # left
                text_x = box_x0 + pad_x - bbox[0]

            text_pos = (text_x, text_y)

            # Borders are disabled by default (no borders for speech bubbles)
            border_w = max(0, int(ann.get("border_width", 0)))
            has_border = bool(ann.get("border", False)) and border_w > 0

            # Mode 1: Speech Bubble (Bocadillo de Diálogo - Pure clean white, 0 borders)
            if style in ("badge_light", "speech_bubble", "bocadillo"):
                opacity = float(ann.get("bg_opacity", 1.0))
                bg_alpha = int(255 * opacity)
                bg_color = (255, 255, 255, bg_alpha)
                text_color = (15, 15, 15, 255)
                outline_color = (30, 30, 30, 220) if has_border else None
                rad = min(4, box_w // 8, box_h // 8)

                draw.rounded_rectangle((box_x0, box_y0, box_x1, box_y1), radius=rad, fill=bg_color, outline=outline_color, width=border_w if outline_color else 0)
                draw.multiline_text(text_pos, wrapped_text, font=font, fill=text_color, align=align)

            # Mode 2: Narration Box (Cartela de Narración)
            elif style in ("cartela", "narration", "box"):
                opacity = float(ann.get("bg_opacity", 1.0))
                bg_alpha = int(255 * opacity)
                bg_color = (255, 255, 250, bg_alpha) # Very subtle comic cream white
                text_color = (10, 10, 10, 255)
                outline_color = (20, 20, 20, 240) if has_border else None
                rad = 1 # Crisp caption box

                draw.rounded_rectangle((box_x0, box_y0, box_x1, box_y1), radius=rad, fill=bg_color, outline=outline_color, width=border_w if outline_color else 0)
                draw.multiline_text(text_pos, wrapped_text, font=font, fill=text_color, align=align)

            # Mode 3: SFX / Margin Note (Efectos de sonido o notas flotantes)
            elif style in ("sfx", "outline", "margin"):
                stroke_w = max(2, int(font_size / 8))
                custom_text = hex_to_rgb(str(ann.get("text_color", "#FFFFFF")), (255, 255, 255))
                # If background requested for SFX
                if ann.get("bg_color") or ann.get("bg_opacity", 0) > 0.4:
                    bg_rgb = hex_to_rgb(str(ann.get("bg_color", "#000000")), (0, 0, 0))
                    opacity = float(ann.get("bg_opacity", 0.75))
                    bg_alpha = int(255 * opacity)
                    draw.rounded_rectangle((box_x0, box_y0, box_x1, box_y1), radius=3, fill=(bg_rgb[0], bg_rgb[1], bg_rgb[2], bg_alpha))

                draw.multiline_text(
                    text_pos, wrapped_text, font=font,
                    fill=(custom_text[0], custom_text[1], custom_text[2], 255),
                    stroke_width=stroke_w,
                    stroke_fill=(0, 0, 0, 240),
                    align=align
                )

            elif style == "badge_dark":
                # Dark translucent badge
                opacity = float(ann.get("bg_opacity", 0.85))
                bg_alpha = int(255 * opacity)
                bg_color = (0, 0, 0, bg_alpha)
                text_color = (255, 255, 255, 255)
                outline_color = (255, 255, 255, 120) if has_border else None
                rad = min(4, box_w // 8, box_h // 8)

                draw.rounded_rectangle((box_x0, box_y0, box_x1, box_y1), radius=rad, fill=bg_color, outline=outline_color, width=border_w if outline_color else 0)
                draw.multiline_text(text_pos, wrapped_text, font=font, fill=text_color, align=align)

            elif style == "sticky_yellow":
                # Soft yellow sticky margin note
                opacity = float(ann.get("bg_opacity", 0.95))
                bg_alpha = int(255 * opacity)
                bg_color = (254, 240, 138, bg_alpha)
                text_color = (30, 20, 10, 255)
                outline_color = (202, 138, 4, 180) if has_border else None
                rad = min(4, box_w // 8, box_h // 8)

                draw.rounded_rectangle((box_x0, box_y0, box_x1, box_y1), radius=rad, fill=bg_color, outline=outline_color, width=border_w if outline_color else 0)
                draw.multiline_text(text_pos, wrapped_text, font=font, fill=text_color, align=align)

            elif style == "outline":
                # Text with dark stroke/shadow, transparent background
                stroke_w = max(2, int(font_size / 9))
                custom_text = hex_to_rgb(str(ann.get("text_color", "#FFFFFF")), (255, 255, 255))
                draw.multiline_text(
                    text_pos, wrapped_text, font=font,
                    fill=(custom_text[0], custom_text[1], custom_text[2], 255),
                    stroke_width=stroke_w,
                    stroke_fill=(0, 0, 0, 240),
                    align=align
                )

            else:
                # Plain or custom color background
                custom_text = hex_to_rgb(str(ann.get("text_color", "#FFFFFF")), (255, 255, 255))
                if ann.get("bg_color"):
                    bg_rgb = hex_to_rgb(str(ann.get("bg_color")), (0, 0, 0))
                    opacity = float(ann.get("bg_opacity", 0.85))
                    bg_alpha = int(255 * opacity)
                    outline_color = (0, 0, 0, 180) if ann.get("border", True) else None
                    draw.rounded_rectangle((box_x0, box_y0, box_x1, box_y1), radius=rad, fill=(bg_rgb[0], bg_rgb[1], bg_rgb[2], bg_alpha), outline=outline_color, width=border_w)
                draw.multiline_text(text_pos, wrapped_text, font=font, fill=(custom_text[0], custom_text[1], custom_text[2], 255), align=align)

        # Alpha composite overlay onto canvas
        final_img = Image.alpha_composite(canvas, overlay)

        # Determine actual output format from dest_path suffix or orig_fmt
        ext = dest_path.suffix.lower()
        if ext in (".jpg", ".jpeg"):
            out_fmt = "JPEG"
        elif ext == ".webp":
            out_fmt = "WEBP"
        elif ext == ".png":
            out_fmt = "PNG"
        elif ext == ".gif":
            out_fmt = "GIF"
        else:
            out_fmt = orig_fmt or "JPEG"

        dest_path.parent.mkdir(parents=True, exist_ok=True)
        if out_fmt == "JPEG":
            if final_img.mode != "RGB":
                final_img = final_img.convert("RGB")
            final_img.save(dest_path, "JPEG", quality=95, subsampling=0)
        elif out_fmt == "WEBP":
            final_img.save(dest_path, "WEBP", quality=95)
        elif out_fmt == "PNG":
            final_img.save(dest_path, "PNG", optimize=True)
        else:
            if orig_mode != "RGBA" and final_img.mode == "RGBA":
                final_img = final_img.convert(orig_mode)
            final_img.save(dest_path, out_fmt, quality=95)

        return final_img.size

def ocr_image_region(
    img_path: Path,
    x: Optional[int] = None,
    y: Optional[int] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
    language: str = "auto"
) -> Dict[str, Any]:
    """
    Performs OCR on an image or cropped speech bubble region using Tesseract.
    Supports Korean (Manhwa/Webtoon), Japanese (Manga), Spanish, English, and auto.
    """
    import pytesseract
    from PIL import ImageEnhance

    with Image.open(img_path) as img:
        img = ImageOps.exif_transpose(img)
        img_w, img_h = img.size

        # Determine crop rectangle
        if x is not None and y is not None and width and height and width > 15 and height > 15:
            pad = 8
            crop_x0 = max(0, int(x) - pad)
            crop_y0 = max(0, int(y) - pad)
            crop_x1 = min(img_w, int(x) + int(width) + pad)
            crop_y1 = min(img_h, int(y) + int(height) + pad)
            cropped = img.crop((crop_x0, crop_y0, crop_x1, crop_y1))
            box_info = {"x": crop_x0, "y": crop_y0, "width": crop_x1 - crop_x0, "height": crop_y1 - crop_y0}
        else:
            cropped = img.copy()
            box_info = {"x": 0, "y": 0, "width": img_w, "height": img_h}

        # Language selection
        try:
            available = pytesseract.get_languages()
        except Exception:
            available = ["eng"]

        lang_choice = (language or "auto").lower().strip()
        if lang_choice in ("kor", "korean", "coreano"):
            selected_langs = [l for l in ["kor", "kor_vert", "eng"] if l in available]
        elif lang_choice in ("jpn", "japanese", "japones", "japonés"):
            selected_langs = [l for l in ["jpn", "jpn_vert", "eng"] if l in available]
        elif lang_choice in ("spa", "spanish", "es", "español", "espanol"):
            selected_langs = [l for l in ["spa", "eng"] if l in available]
        elif lang_choice in ("eng", "english", "en"):
            selected_langs = [l for l in ["eng"] if l in available]
        else: # auto
            selected_langs = [l for l in ["spa", "eng", "kor", "jpn"] if l in available]

        lang_str = "+".join(selected_langs) if selected_langs else "eng"

        # Preprocessing for comic text extraction
        w, h = cropped.size
        if w < 400 or h < 300:
            scale = max(2, int(450 / max(1, w)))
            cropped = cropped.resize((w * scale, h * scale), Image.Resampling.LANCZOS)

        gray = cropped.convert("L")
        inverted = ImageOps.invert(gray)

        # Try candidates across normal and inverted contrast with PSM modes
        candidates = []
        for variant in [gray, inverted]:
            enh = ImageEnhance.Contrast(variant).enhance(1.6)
            for psm in [6, 11, 3]:
                try:
                    txt = pytesseract.image_to_string(enh, lang=lang_str, config=f"--psm {psm}").strip()
                    if txt:
                        clean = "\n".join(line.strip() for line in txt.splitlines() if line.strip())
                        if clean:
                            candidates.append((len(clean), clean))
                except Exception as e:
                    logger.debug(f"OCR attempt with PSM {psm} failed: {e}")

        best_text = ""
        if candidates:
            candidates.sort(key=lambda c: c[0], reverse=True)
            best_text = candidates[0][1]

        return {
            "success": True,
            "text": best_text,
            "language": lang_str,
            "box": box_info
        }

