"""Photos: one upload becomes a JPEG (portals, link previews) and WebP sizes (the website).

Files: MEDIA_DIR/<tenant_id>/<hash>.jpg and <hash>-<width>.webp. The name is the content's hash, so a file
never changes and phones keep it for a year. Location and other EXIF data are dropped.
Sample cars use keys 'samples/<name>': the same files, shipped in static/samples.
"""
import hashlib
import io
import os
from pathlib import Path

from flask import url_for
from PIL import Image, ImageOps

WIDTHS = (400, 800, 1200, 1600)
MAX_SIDE = 1600
LOGO_BOX = (600, 240)
Image.MAX_IMAGE_PIXELS = 80_000_000  # a 12-megapixel phone photo is fine, a decompression bomb isn't


def _open(data: bytes) -> Image.Image | None:
    try:
        img = Image.open(io.BytesIO(data))
        if img.format not in ("JPEG", "PNG", "WEBP", "GIF", "MPO"):
            return None
        if img.format in ("JPEG", "MPO"):
            img.draft("RGB", (MAX_SIDE * 2, MAX_SIDE * 2))  # decode big JPEGs at a smaller scale: much faster
        img.load()
        return ImageOps.exif_transpose(img)
    except Exception:
        return None


def _flatten(img: Image.Image) -> Image.Image:
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        base = Image.new("RGB", img.size, (255, 255, 255))
        base.paste(img, mask=img.getchannel("A"))
        return base
    return img.convert("RGB")


def widths(width: int) -> list[int]:
    """The WebP sizes a photo of this width has."""
    return [w for w in WIDTHS if w < width] + [width]


def _write(path: Path, write):
    if path.exists():
        return
    tmp = path.with_name(path.name + ".tmp")
    write(tmp)
    os.replace(tmp, path)  # never a half-written file under the real name


def save(media_dir: Path, tenant_id: int, data: bytes) -> dict | None:
    """Photo bytes -> {key, width, height, color}; None if it isn't a photo we can read."""
    img = _open(data)
    if img is None or min(img.size) < 120:
        return None
    img = _flatten(img)
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=82, optimize=True, progressive=True)
    jpeg = buf.getvalue()
    name = hashlib.sha256(jpeg).hexdigest()[:16]
    folder = media_dir / str(tenant_id)
    folder.mkdir(parents=True, exist_ok=True)
    _write(folder / f"{name}.jpg", lambda p: p.write_bytes(jpeg))
    for w in widths(img.width):
        size = (w, round(img.height * w / img.width))
        small = img if w == img.width else img.resize(size, Image.Resampling.LANCZOS)
        _write(folder / f"{name}-{w}.webp", lambda p, s=small: s.save(p, "WEBP", quality=76, method=4))
    r, g, b = img.resize((1, 1), Image.Resampling.BOX).getpixel((0, 0))
    return {"key": f"{tenant_id}/{name}", "width": img.width, "height": img.height,
            "color": f"#{r:02x}{g:02x}{b:02x}"}


def save_logo(media_dir: Path, tenant_id: int, data: bytes) -> str | None:
    """A logo keeps its transparency: PNG and WebP, at most 600×240."""
    img = _open(data)
    if img is None:
        return None
    img = img.convert("RGBA")
    box = img.getbbox()  # trim empty transparent edges
    if box:
        img = img.crop(box)
    img.thumbnail(LOGO_BOX, Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    png = buf.getvalue()
    name = "logo-" + hashlib.sha256(png).hexdigest()[:12]
    folder = media_dir / str(tenant_id)
    folder.mkdir(parents=True, exist_ok=True)
    _write(folder / f"{name}.png", lambda p: p.write_bytes(png))
    _write(folder / f"{name}.webp", lambda p: img.save(p, "WEBP", quality=90, method=4))
    return f"{tenant_id}/{name}|{img.width}x{img.height}"


def delete_files(media_dir: Path, key: str, width: int):
    """Remove a photo's files (callers check no other photo row still uses the key)."""
    if key.startswith("samples/") or "/" not in key:
        return
    base = media_dir / key
    for path in [base.with_name(base.name + ".jpg")] + [base.with_name(f"{base.name}-{w}.webp") for w in widths(width)]:
        try:
            path.unlink()
        except FileNotFoundError:
            pass


def delete_logo(media_dir: Path, value: str):
    key = value.split("|")[0]
    if not key or key.startswith("samples/"):
        return
    for ext in ("png", "webp"):
        try:
            (media_dir / f"{key}.{ext}").unlink()
        except FileNotFoundError:
            pass


# --- addresses ----------------------------------------------------------------------

def url(key: str, name: str, external: bool = False) -> str:
    if key.startswith("samples/"):
        return url_for("static", filename=f"{key}{name}", _external=external)
    return url_for("public.media", path=f"{key}{name}", _external=external)


def src(photo, width: int = 800) -> str:
    best = min(widths(photo["width"]), key=lambda w: (w < width, abs(w - width)))
    return url(photo["key"], f"-{best}.webp")


def srcset(photo) -> str:
    return ", ".join(f"{url(photo['key'], f'-{w}.webp')} {w}w" for w in widths(photo["width"]))


def jpeg(photo, external: bool = True) -> str:
    return url(photo["key"], ".jpg", external)


def logo(value: str) -> dict | None:
    """The tenant's logo field -> {src, png, width, height}."""
    if not value:
        return None
    key, _, size = value.partition("|")
    w, _, h = size.partition("x")
    return {"src": url(key, ".webp"), "png": url(key, ".png"), "width": int(w or 0), "height": int(h or 0)}
