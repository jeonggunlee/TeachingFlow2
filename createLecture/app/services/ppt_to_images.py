import asyncio
import shutil
from pathlib import Path

from pdf2image import convert_from_path

DEFAULT_DPI = 150


def _resolve_soffice() -> str:
    for name in ("soffice", "libreoffice"):
        if shutil.which(name):
            return name
    raise RuntimeError("LibreOffice (soffice/libreoffice) not found in PATH")


async def _pptx_to_pdf(pptx_path: Path, out_dir: Path) -> Path:
    binary = _resolve_soffice()
    proc = await asyncio.create_subprocess_exec(
        binary,
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        str(out_dir),
        str(pptx_path),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(
            f"LibreOffice conversion failed (exit {proc.returncode}): "
            f"{stderr.decode(errors='replace')}"
        )
    pdf_path = out_dir / (pptx_path.stem + ".pdf")
    if not pdf_path.exists():
        raise RuntimeError(f"Expected PDF not found: {pdf_path}")
    return pdf_path


def _pdf_to_pngs(pdf_path: Path, slides_dir: Path, dpi: int) -> list[Path]:
    slides_dir.mkdir(parents=True, exist_ok=True)
    images = convert_from_path(str(pdf_path), dpi=dpi, fmt="png")
    paths: list[Path] = []
    for i, img in enumerate(images, start=1):
        p = slides_dir / f"slide_{i:03d}.png"
        img.save(p, "PNG")
        paths.append(p)
    return paths


async def convert(
    pptx_path: Path,
    lecture_dir: Path,
    *,
    dpi: int = DEFAULT_DPI,
    force: bool = False,
) -> list[Path]:
    """PPT(X) -> PDF -> PNG per slide. Reuses existing artifacts unless force."""
    slides_dir = lecture_dir / "slides"
    if not force and slides_dir.exists():
        cached = sorted(slides_dir.glob("slide_*.png"))
        if cached:
            return cached

    pdf_path = await _pptx_to_pdf(pptx_path, lecture_dir)
    # _pdf_to_pngs는 CPU-bound 동기 함수 — 스레드 풀에서 실행해 이벤트 루프 차단 방지
    return await asyncio.to_thread(_pdf_to_pngs, pdf_path, slides_dir, dpi)
