"""Document Processing Handler for Uzbek Transliteration Platform.

Processes:
- .docx: Native OpenXML in-place run mutation preserving tables, images, formatting, shapes.
         Includes adjacent run merging to resolve split digraphs (e.g. S-h, O-').
- .doc: Legacy Word 97-2003 via isolated headless LibreOffice subprocess bridge.
- .txt: Multi-encoding reader & writer.
- Supports converting output to matching format, or .docx, .doc, .pdf, .txt.
"""

import os
import shutil
import subprocess
import uuid
from typing import Optional, Literal
from docx import Document
from docx.oxml import OxmlElement
from docx.text.paragraph import Paragraph

from backend.app.transliterator import transliterate

# Encodings to probe when reading plain text files
TEXT_ENCODINGS = ["utf-8-sig", "utf-8", "windows-1251", "cp1254", "iso-8859-1"]


def get_run_formatting_key(run) -> tuple:
    """Returns a hashable tuple representing the visual formatting of a run."""
    font = run.font
    color_rgb = str(font.color.rgb) if font.color and font.color.rgb else None
    color_theme = str(font.color.theme_color) if font.color and font.color.theme_color else None
    size_pt = font.size.pt if font.size else None

    return (
        run.bold,
        run.italic,
        run.underline,
        font.name,
        size_pt,
        color_rgb,
        color_theme,
        run.style.name if run.style else None,
    )


def merge_identical_adjacent_runs(paragraph: Paragraph) -> None:
    """Merges adjacent runs that share identical formatting properties.

    Resolves Word's run-fragmentation bug where words like 'Shahar' or 'O'zbekiston'
    are split into multiple <w:r> tags with the same formatting.
    """
    runs = paragraph.runs
    if len(runs) <= 1:
        return

    i = 0
    while i < len(runs) - 1:
        current_run = runs[i]
        next_run = runs[i + 1]

        # Check if both runs exist and share identical formatting
        if get_run_formatting_key(current_run) == get_run_formatting_key(next_run):
            # Merge text into current_run
            current_run.text += next_run.text
            # Clear text in next_run
            next_run.text = ""
            # Remove next_run from paragraph element in XML
            r_elem = next_run._r
            parent = r_elem.getparent()
            if parent is not None:
                parent.remove(r_elem)
            # Reload runs list
            runs = paragraph.runs
        else:
            i += 1


def transliterate_paragraph(paragraph: Paragraph, direction: str) -> None:
    """Merges fragmented runs and transliterates all run text in the paragraph."""
    # 1. Merge adjacent runs with matching formatting to unite split digraphs
    merge_identical_adjacent_runs(paragraph)

    # 2. Transliterate remaining runs
    for run in paragraph.runs:
        if run.text:
            run.text = transliterate(run.text, direction)


def process_docx_document(
    input_docx_path: str,
    output_docx_path: str,
    direction: Literal["latin-to-cyrillic", "cyrillic-to-latin"] = "latin-to-cyrillic",
) -> str:
    """Transliterates a .docx document in-place, preserving styles, tables, images, headers, and footers."""
    doc = Document(input_docx_path)

    # 1. Body paragraphs
    for p in doc.paragraphs:
        transliterate_paragraph(p, direction)

    # 2. Table cells
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    transliterate_paragraph(p, direction)

    # 3. Section headers and footers
    for section in doc.sections:
        for header in (section.header, section.first_page_header, section.even_page_header):
            if header and not header.is_linked_to_previous:
                for p in header.paragraphs:
                    transliterate_paragraph(p, direction)
                for table in header.tables:
                    for row in table.rows:
                        for cell in row.cells:
                            for p in cell.paragraphs:
                                transliterate_paragraph(p, direction)

        for footer in (section.footer, section.first_page_footer, section.even_page_footer):
            if footer and not footer.is_linked_to_previous:
                for p in footer.paragraphs:
                    transliterate_paragraph(p, direction)
                for table in footer.tables:
                    for row in table.rows:
                        for cell in row.cells:
                            for p in cell.paragraphs:
                                transliterate_paragraph(p, direction)

    # 4. Floating shapes & text boxes (<w:txbxContent>)
    # Find all paragraph elements inside any text box in the XML tree
    for p_elem in doc.element.xpath(".//w:txbxContent//w:p"):
        p = Paragraph(p_elem, doc)
        transliterate_paragraph(p, direction)

    doc.save(output_docx_path)
    return output_docx_path


def run_libreoffice_conversion(
    input_file_path: str,
    target_format: str,
    output_dir: str,
    timeout_sec: int = 45,
) -> str:
    """Invokes headless LibreOffice in an isolated sandbox to convert files."""
    session_id = str(uuid.uuid4())
    profile_dir = f"/tmp/soffice_profile_{session_id}"
    os.makedirs(profile_dir, exist_ok=True)

    # Determine command binary
    soffice_cmd = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice_cmd:
        raise RuntimeError("LibreOffice executable (soffice/libreoffice) not found on system PATH.")

    cmd = [
        soffice_cmd,
        "--headless",
        "--nodefault",
        "--nofirststartwizard",
        "--nolockcheck",
        f"-env:UserInstallation=file://{profile_dir}",
        "--convert-to",
        target_format,
        input_file_path,
        "--outdir",
        output_dir,
    ]

    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout_sec,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"LibreOffice conversion failed with code {proc.returncode}: {proc.stderr}")

        # Locate converted file
        input_basename = os.path.splitext(os.path.basename(input_file_path))[0]
        # In case target_format contains options like 'txt:Text'
        ext = target_format.split(":")[0]
        expected_output = os.path.join(output_dir, f"{input_basename}.{ext}")

        if not os.path.exists(expected_output):
            # Check if any file with matching basename and extension exists in output_dir
            for f in os.listdir(output_dir):
                if f.startswith(input_basename) and f.endswith(f".{ext}"):
                    return os.path.join(output_dir, f)
            raise FileNotFoundError(f"Expected converted file not found: {expected_output}")

        return expected_output
    finally:
        # Guarantee removal of sandbox user installation profile
        shutil.rmtree(profile_dir, ignore_errors=True)


def read_text_file(file_path: str) -> str:
    """Reads a text file trying several common encodings."""
    for enc in TEXT_ENCODINGS:
        try:
            with open(file_path, "r", encoding=enc) as f:
                return f.read()
        except (UnicodeDecodeError, LookupError):
            continue

    # Fallback with replacement
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()


def process_document(
    input_file_path: str,
    output_dir: str,
    direction: Literal["latin-to-cyrillic", "cyrillic-to-latin"] = "latin-to-cyrillic",
    target_format: Optional[str] = None,
) -> str:
    """Master document processing entrypoint.

    Accepts .docx, .doc, and .txt files.
    Optionally converts output to requested target format (.docx, .doc, .pdf, .txt).
    Defaults to preserving original input file format.
    """
    os.makedirs(output_dir, exist_ok=True)
    filename = os.path.basename(input_file_path)
    base_name, in_ext = os.path.splitext(filename)
    in_ext = in_ext.lower().lstrip(".")

    # Default target format to the same format as uploaded,
    # but for legacy .doc default to modern .docx (Option 3: Modernize .doc -> .docx)
    if not target_format or target_format.lower() == "same":
        out_format = "docx" if in_ext == "doc" else in_ext
    else:
        out_format = target_format.lower().lstrip(".")

    # A. Plain Text (.txt)
    if in_ext == "txt":
        raw_text = read_text_file(input_file_path)
        converted_text = transliterate(raw_text, direction)
        output_txt_path = os.path.join(output_dir, f"{base_name}.txt")
        with open(output_txt_path, "w", encoding="utf-8") as f:
            f.write(converted_text)

        if out_format == "txt":
            return output_txt_path
        elif out_format in ("pdf", "docx", "doc"):
            # Use LibreOffice to convert .txt to pdf/docx/doc
            return run_libreoffice_conversion(output_txt_path, out_format, output_dir)
        else:
            return output_txt_path

    # B. OpenXML Document (.docx)
    elif in_ext == "docx":
        transliterated_docx = os.path.join(output_dir, f"{base_name}_transliterated.docx")
        process_docx_document(input_file_path, transliterated_docx, direction)

        if out_format == "docx":
            final_path = os.path.join(output_dir, f"{base_name}.docx")
            if final_path != transliterated_docx:
                shutil.move(transliterated_docx, final_path)
            return final_path
        elif out_format in ("pdf", "doc", "txt"):
            return run_libreoffice_conversion(transliterated_docx, out_format, output_dir)
        else:
            return transliterated_docx

    # C. Legacy Word 97-2003 (.doc)
    elif in_ext == "doc":
        # 1. Convert legacy .doc -> modern .docx via LibreOffice
        intermediate_dir = os.path.join(output_dir, "intermediate")
        os.makedirs(intermediate_dir, exist_ok=True)
        intermediate_docx = run_libreoffice_conversion(input_file_path, "docx", intermediate_dir)

        # 2. Transliterate .docx through OpenXML engine
        processed_docx = os.path.join(output_dir, f"{base_name}_temp.docx")
        process_docx_document(intermediate_docx, processed_docx, direction)

        # 3. Output in desired format
        if out_format == "docx":
            final_path = os.path.join(output_dir, f"{base_name}.docx")
            shutil.move(processed_docx, final_path)
            return final_path
        elif out_format == "doc":
            # Convert back to legacy .doc as requested by user
            converted_doc = run_libreoffice_conversion(processed_docx, "doc", output_dir)
            return converted_doc
        elif out_format == "pdf":
            return run_libreoffice_conversion(processed_docx, "pdf", output_dir)
        elif out_format == "txt":
            return run_libreoffice_conversion(processed_docx, "txt:Text", output_dir)
        else:
            final_path = os.path.join(output_dir, f"{base_name}.doc")
            return run_libreoffice_conversion(processed_docx, "doc", output_dir)

    else:
        raise ValueError(f"Unsupported document format: .{in_ext}. Only .docx, .doc, and .txt are supported.")
