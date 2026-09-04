import os
import sys
import tkinter as tk
from tkinter import filedialog
import win32com.client as win32

REPLACEMENTS = [
    # Apostrophe variants
    ("‘", "'"), ("’", "'"), ("`", "'"), ("ʻ", "'"), ("ʼ", "'"),

    # Digraphs & composite vowels (Case-sensitive, ordered)
    ("Sh", "Ш"), ("SH", "Ш"), ("sh", "ш"),
    ("Ch", "Ч"), ("CH", "Ч"), ("ch", "ч"),
    ("Yo", "Ё"), ("YO", "Ё"), ("yo", "ё"),
    ("Yu", "Ю"), ("YU", "Ю"), ("yu", "ю"),
    ("Ya", "Я"), ("YA", "Я"), ("ya", "я"),
    ("Ye", "Е"), ("YE", "Е"), ("ye", "е"),
    ("O'", "Ў"), ("o'", "ў"),
    ("G'", "Ғ"), ("g'", "ғ"),

    # Single letters
    ("A", "А"), ("a", "а"),
    ("B", "Б"), ("b", "б"),
    ("D", "Д"), ("d", "д"),
    ("E", "Е"), ("e", "е"),
    ("F", "Ф"), ("f", "ф"),
    ("G", "Г"), ("g", "г"),
    ("H", "Ҳ"), ("h", "ҳ"),
    ("I", "И"), ("i", "и"),
    ("J", "Ж"), ("j", "ж"),
    ("K", "К"), ("k", "к"),
    ("L", "Л"), ("l", "л"),
    ("M", "М"), ("m", "м"),
    ("N", "Н"), ("n", "н"),
    ("O", "О"), ("o", "о"),
    ("P", "П"), ("p", "п"),
    ("Q", "Қ"), ("q", "қ"),
    ("R", "Р"), ("r", "р"),
    ("S", "С"), ("s", "с"),
    ("T", "Т"), ("t", "т"),
    ("U", "У"), ("u", "у"),
    ("V", "В"), ("v", "в"),
    ("X", "Х"), ("x", "х"),
    ("Y", "Й"), ("y", "й"),
    ("Z", "З"), ("z", "з"),
    ("'", "ъ"),
]

def replace_in_range(rng, find_text, replace_text):
    find = rng.Find
    find.ClearFormatting()
    find.Replacement.ClearFormatting()
    find.Text = find_text
    find.Replacement.Text = replace_text
    find.Forward = True
    find.Wrap = 0
    find.Format = False
    find.MatchCase = True
    find.MatchWholeWord = False
    find.MatchWildcards = False
    find.Execute(Replace=2)

def process_document(doc):
    for find_str, replace_str in REPLACEMENTS:
        # Body text and tables
        replace_in_range(doc.Content, find_str, replace_str)

        # Headers and footers
        for section in doc.Sections:
            for header in section.Headers:
                if header.Exists:
                    replace_in_range(header.Range, find_str, replace_str)
            for footer in section.Footers:
                if footer.Exists:
                    replace_in_range(footer.Range, find_str, replace_str)

        # Floating shapes & text boxes
        for shape in doc.Shapes:
            if shape.TextFrame.HasText:
                replace_in_range(shape.TextFrame.TextRange, find_str, replace_str)

def get_target_files():
    # 1. From Command Line Arguments or Drag & Drop
    if len(sys.argv) > 1:
        paths = sys.argv[1:]
        valid_files = [
            os.path.normpath(os.path.abspath(p))
            for p in paths
            if os.path.isfile(p) and p.lower().endswith(".doc")
        ]
        if valid_files:
            return valid_files

    # 2. From File Picker Dialog
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)

    desktop_path = os.path.normpath(os.path.join(os.path.expanduser("~"), "Desktop"))
    selected_files = filedialog.askopenfilenames(
        title="Select .doc Files to Convert",
        initialdir=desktop_path,
        filetypes=[("Word 97-2003 Documents", "*.doc")]
    )
    root.destroy()

    # Convert POSIX forward slashes to standard Windows backslashes
    return [os.path.normpath(os.path.abspath(f)) for f in selected_files]

def main():
    files = get_target_files()

    if not files:
        print("No valid .doc files selected. Exiting.")
        return

    print(f"\nFound {len(files)} file(s) to process.")

    word = win32.gencache.EnsureDispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = False

    try:
        for idx, file_path in enumerate(files, start=1):
            file_name = os.path.basename(file_path)

            if file_name.startswith("~$"):
                print(f"[{idx}/{len(files)}] Skipping temporary lock file: {file_name}")
                continue

            print(f"[{idx}/{len(files)}] Converting: {file_name} ...", end="", flush=True)

            try:
                # Use fully qualified, normalized Windows path
                clean_path = os.path.normpath(os.path.abspath(file_path))
                doc = word.Documents.Open(clean_path)
                
                process_document(doc)
                
                doc.Save()
                doc.Close(SaveChanges=False)
                print(" Done.")
            except Exception as e:
                print(f" Failed! Error: {e}")

        print("\nAll files processed successfully!")
    finally:
        word.Quit()

if __name__ == "__main__":
    main()