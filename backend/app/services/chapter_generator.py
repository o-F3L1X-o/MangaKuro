import os
import uuid
from pathlib import Path
from typing import Optional, Tuple
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def get_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    """Finds a clean system font (Windows or Linux) with fallback."""
    candidate_fonts = [
        # Windows fonts
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\calibrib.ttf" if bold else r"C:\Windows\Fonts\calibri.ttf",
        r"C:\Windows\Fonts\georgiab.ttf" if bold else r"C:\Windows\Fonts\georgia.ttf",
        # Linux / Docker fonts
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
    ]

    for font_path in candidate_fonts:
        if os.path.exists(font_path):
            try:
                return ImageFont.truetype(font_path, size)
            except Exception:
                pass

    return ImageFont.load_default()

def wrap_text(text: str, font: ImageFont.ImageFont, max_width: int, draw: ImageDraw.ImageDraw) -> list:
    """Wraps text so it fits within max_width."""
    words = text.split()
    if not words:
        return []

    lines = []
    current_line = []

    for word in words:
        test_line = " ".join(current_line + [word])
        bbox = draw.textbbox((0, 0), test_line, font=font)
        w = bbox[2] - bbox[0]
        if w <= max_width:
            current_line.append(word)
        else:
            if current_line:
                lines.append(" ".join(current_line))
                current_line = [word]
            else:
                lines.append(word)
                current_line = []

    if current_line:
        lines.append(" ".join(current_line))

    return lines

def generate_chapter_card(
    output_path: Path,
    chapter_number: str,
    chapter_title: str,
    series_name: Optional[str] = "",
    style: str = "minimal_white", # "minimal_white", "minimal_dark", "overlay_bg"
    bg_image_path: Optional[Path] = None,
    width: int = 1800,
    height: int = 2500
) -> Tuple[int, int]:
    """
    Generates a high-resolution chapter title page (portadilla de capítulo)
    ideal for Tankōbon format.
    """
    # 1. Base canvas setup
    if style == "overlay_bg" and bg_image_path and bg_image_path.exists():
        with Image.open(bg_image_path) as bg:
            img = bg.convert("RGB")
            width, height = img.size
    elif style == "minimal_dark":
        img = Image.new("RGB", (width, height), color=(15, 23, 42)) # Slate 900
    else:
        # minimal_white default
        img = Image.new("RGB", (width, height), color=(255, 255, 255))

    draw = ImageDraw.Draw(img)

    # 2. Scale font sizes dynamically based on canvas height
    scale = height / 2000.0
    series_font_size = max(24, int(36 * scale))
    number_font_size = max(40, int(72 * scale))
    title_font_size = max(36, int(58 * scale))

    series_font = get_font(series_font_size, bold=False)
    number_font = get_font(number_font_size, bold=True)
    title_font = get_font(title_font_size, bold=True)

    # If overlay_bg, draw an elegant frosted-glass or semi-transparent banner in the center
    if style == "overlay_bg":
        # Create translucent overlay
        overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        overlay_draw = ImageDraw.Draw(overlay)

        card_w = int(width * 0.82)
        card_h = int(height * 0.32)
        card_x = (width - card_w) // 2
        card_y = (height - card_h) // 2

        # Draw rounded rectangle with dark glass effect
        overlay_draw.rounded_rectangle(
            [card_x, card_y, card_x + card_w, card_y + card_h],
            radius=int(24 * scale),
            fill=(10, 15, 30, 220), # Deep dark semi-transparent
            outline=(255, 255, 255, 160),
            width=max(2, int(3 * scale))
        )

        img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
        draw = ImageDraw.Draw(img)

        # Colors for text on dark card
        primary_color = (255, 255, 255)
        accent_color = (129, 140, 248) # Indigo 400
        muted_color = (203, 213, 225) # Slate 300
        center_y_start = card_y + int(35 * scale)
    elif style == "minimal_dark":
        primary_color = (255, 255, 255)
        accent_color = (129, 140, 248)
        muted_color = (148, 163, 184)
        center_y_start = int(height * 0.38)
    else:
        # Minimal white (Tankōbon classic)
        primary_color = (15, 23, 42)
        accent_color = (79, 70, 229)
        muted_color = (100, 116, 139)
        center_y_start = int(height * 0.38)

    current_y = center_y_start

    # Render Series Name (optional header)
    if series_name and series_name.strip():
        s_text = series_name.strip().upper()
        bbox = draw.textbbox((0, 0), s_text, font=series_font)
        s_w = bbox[2] - bbox[0]
        draw.text(((width - s_w) // 2, current_y), s_text, font=series_font, fill=muted_color)
        current_y += int(s_font_h := (bbox[3] - bbox[1]) + 20 * scale)

        # Subtle decorative divider line
        line_w = int(width * 0.15)
        draw.line(
            [(width - line_w) // 2, current_y, (width + line_w) // 2, current_y],
            fill=accent_color,
            width=max(2, int(3 * scale))
        )
        current_y += int(35 * scale)

    # Render Chapter Number (e.g., "CAPÍTULO 1")
    if chapter_number and chapter_number.strip():
        c_text = chapter_number.strip()
        bbox = draw.textbbox((0, 0), c_text, font=number_font)
        c_w = bbox[2] - bbox[0]
        draw.text(((width - c_w) // 2, current_y), c_text, font=number_font, fill=accent_color)
        current_y += int((bbox[3] - bbox[1]) + 25 * scale)

    # Render Chapter Title (wrapped if long)
    if chapter_title and chapter_title.strip():
        max_text_w = int(width * 0.72)
        lines = wrap_text(chapter_title.strip(), title_font, max_text_w, draw)
        for line in lines:
            bbox = draw.textbbox((0, 0), line, font=title_font)
            l_w = bbox[2] - bbox[0]
            draw.text(((width - l_w) // 2, current_y), line, font=title_font, fill=primary_color)
            current_y += int((bbox[3] - bbox[1]) + 15 * scale)

    # For minimal styles, add a clean geometric frame or decorative accent
    if style in ("minimal_white", "minimal_dark"):
        border_inset = int(60 * scale)
        border_color = (226, 232, 240) if style == "minimal_white" else (30, 41, 59)
        draw.rectangle(
            [border_inset, border_inset, width - border_inset, height - border_inset],
            outline=border_color,
            width=max(1, int(2 * scale))
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, "JPEG", quality=95)
    return width, height
