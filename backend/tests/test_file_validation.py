from app.services.file_validation import sanitize_filename, validate_upload

PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
ZIP = b"PK\x03\x04" + b"\x00" * 20
MB = 1024 * 1024


def test_valid_files_accepted():
    assert validate_upload("report.pdf", PDF, MB).ok
    assert validate_upload("pic.PNG", PNG, MB).category == "images"
    assert validate_upload("sheet.xlsx", ZIP, MB).category == "documents"
    assert validate_upload("notes.txt", "héllo wörld".encode(), MB).ok


def test_unlisted_extension_is_policy_violation():
    r = validate_upload("archive.7z", b"7z...", MB)
    assert not r.ok and r.kind == "policy"


def test_executables_flagged_as_threats():
    for name in ("setup.exe", "run.bat", "x.sh", "page.html", "logo.svg", "macro.js"):
        r = validate_upload(name, b"MZ....", MB)
        assert not r.ok and r.kind == "threat", name


def test_extension_content_mismatch_flagged():
    r = validate_upload("invoice.pdf", b"MZ\x90\x00 this is an exe", MB)
    assert not r.ok and r.kind == "threat"
    assert not validate_upload("photo.png", PDF, MB).ok


def test_binary_disguised_as_text_flagged():
    assert not validate_upload("notes.txt", b"\x00\x01\x02binary", MB).ok
    assert not validate_upload("data.csv", b"\xff\xfe\xfa\xfb", MB).ok


def test_size_and_empty_limits():
    assert not validate_upload("big.pdf", PDF + b"0" * (2 * MB), MB).ok
    assert not validate_upload("empty.txt", b"", MB).ok


def test_no_extension_rejected():
    assert not validate_upload("README", b"text", MB).ok


def test_filename_sanitised():
    assert sanitize_filename("../../etc/passwd") == "passwd"
    assert sanitize_filename("C:\\Users\\me\\report.pdf") == "report.pdf"
    assert sanitize_filename('bad<name>?.txt') == "badname.txt"
    assert sanitize_filename("") == "file"
