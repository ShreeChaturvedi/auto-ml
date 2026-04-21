"""Finalize step: update Lynn's draft with YouTube link and send all 32 faculty emails.

Usage:
    python3 .tmp/faculty-drafts/finalize.py            # full run
    python3 .tmp/faculty-drafts/finalize.py --dry-run  # build MIME, skip gws calls
    python3 .tmp/faculty-drafts/finalize.py --lynn-only
    python3 .tmp/faculty-drafts/finalize.py --faculty-only

The faculty loop is idempotent: successful sends are appended to send_log.jsonl
and skipped on re-run. A single failure aborts to avoid cascading damage.
"""

import argparse
import json
import mimetypes
import subprocess
import sys
import time
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from pathlib import Path

REPO = Path("/home/shree/Documents/CSE449/repo")
WORKDIR = REPO / ".tmp" / "faculty-drafts"
MANIFEST = WORKDIR / "manifest.json"
SEND_LOG = WORKDIR / "send_log.jsonl"
BOOKLET = WORKDIR / "booklet-q30.pdf"
POSTER = REPO / "poster" / "dist" / "poster.pdf"

YOUTUBE_URL = "https://youtu.be/T44QV_ZRlmQ"
DELAY_SECONDS = 10

FROM = "chaturs@miamioh.edu"

# ---- Lynn-specific constants (derived from the existing draft/thread) ----
LYNN_DRAFT_ID = "r3279822654913545679"
LYNN_THREAD_ID = "19dac6a2eb41f114"
LYNN_TO = "stahrlc@miamioh.edu"
LYNN_CC = "yadava5@miamioh.edu"
LYNN_SUBJECT = "Re: NEED A RESPONSE ABOUT EXPO"
LYNN_IN_REPLY_TO = "<CAPg-eficLA0gVkzLF2sFHOh927YMmGtAHRPXZW8efCmJ1QpP0w@mail.gmail.com>"
LYNN_REFERENCES = (
    "<CAPg-efiqBk5=NF-+AUk50FBNUPAhUQUzZxZdOA7kmCPspkr8dA@mail.gmail.com> "
    "<CA+pSiYzKq7S1s2j0n4gFdXSBd7fgcTUBMoBt=oj9KH7uYvLNQA@mail.gmail.com> "
    "<CAPg-eficLA0gVkzLF2sFHOh927YMmGtAHRPXZW8efCmJ1QpP0w@mail.gmail.com>"
)

sys.path.insert(0, str(WORKDIR))
from build_drafts import build_mime  # noqa: E402


def _attach_pdf(msg: EmailMessage, path: Path, filename: str) -> None:
    ctype, _ = mimetypes.guess_type(str(path))
    if not ctype:
        ctype = "application/pdf"
    maintype, subtype = ctype.split("/", 1)
    msg.add_attachment(path.read_bytes(), maintype=maintype, subtype=subtype, filename=filename)


def build_lynn_mime(youtube_url: str) -> bytes:
    body_text = f"""Hi Prof. Stahr,

Thank you again for your patience. I wanted to let you know that all of our deliverables are now complete and submitted:

- Video: submitted via the Canvas assignment. The YouTube link is {youtube_url}.
- Poster: submitted via the Google Form. I've also attached a copy here for your convenience.
- Project book: submitted via the Google Form. I've also attached a copy here for your convenience.

Please let me know if there is anything else you need from us ahead of Expo.

Thank you so much for all of your guidance and support throughout this project.

Best Regards,
Shree Chaturvedi
"""
    body_html = f"""<div dir="ltr">
<div>Hi Prof. Stahr,</div>
<div><br></div>
<div>Thank you again for your patience. I wanted to let you know that all of our deliverables are now complete and submitted:</div>
<div><br></div>
<ul>
  <li><b>Video</b>: submitted via the Canvas assignment. The YouTube link is <a href="{youtube_url}">{youtube_url}</a>.</li>
  <li><b>Poster</b>: submitted via the Google Form. I've also attached a copy here for your convenience.</li>
  <li><b>Project book</b>: submitted via the Google Form. I've also attached a copy here for your convenience.</li>
</ul>
<div><br></div>
<div>Please let me know if there is anything else you need from us ahead of Expo.</div>
<div><br></div>
<div>Thank you so much for all of your guidance and support throughout this project.</div>
<div><br></div>
<div>Best Regards,</div>
<div>Shree Chaturvedi</div>
</div>"""
    msg = EmailMessage()
    msg["From"] = FROM
    msg["To"] = LYNN_TO
    msg["Cc"] = LYNN_CC
    msg["Subject"] = LYNN_SUBJECT
    msg["In-Reply-To"] = LYNN_IN_REPLY_TO
    msg["References"] = LYNN_REFERENCES
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain="mail.gmail.com")
    msg.set_content(body_text)
    msg.add_alternative(body_html, subtype="html")
    _attach_pdf(msg, BOOKLET, "booklet.pdf")
    _attach_pdf(msg, POSTER, "poster.pdf")
    return msg.as_bytes()


def run_gws(args: list[str], timeout: int = 300) -> tuple[dict | None, int, str]:
    """Run a gws command from REPO, strip keyring preamble, and parse JSON output.

    Returns ({}, 0, "") on successful empty responses (e.g. HTTP 204 from drafts.delete).
    """
    proc = subprocess.run(
        ["gws", *args],
        capture_output=True,
        text=True,
        cwd=REPO,
        timeout=timeout,
    )
    out = proc.stdout or ""
    if out.startswith("Using keyring backend:"):
        nl = out.find("\n")
        out = out[nl + 1 :] if nl >= 0 else ""
    out = out.strip()
    if proc.returncode != 0:
        return None, proc.returncode, (proc.stderr or proc.stdout).strip()
    if not out:
        return {}, 0, ""
    try:
        return json.loads(out), 0, ""
    except Exception as exc:
        return None, -1, f"json parse error: {exc}\n{proc.stdout}"


def update_lynn(dry_run: bool) -> bool:
    print(f"\n[Lynn] Updating draft {LYNN_DRAFT_ID} with YouTube link…")
    mime = build_lynn_mime(YOUTUBE_URL)
    eml_path = WORKDIR / "lynn_updated.eml"
    eml_path.write_bytes(mime)
    rel = eml_path.relative_to(REPO)
    size_mb = len(mime) / 1024 / 1024
    print(f"[Lynn] built raw MIME: {size_mb:.2f} MB at {rel}")

    if dry_run:
        print("[Lynn] --dry-run: skipping gws call.")
        return True

    # Attempt drafts.update first so the draft ID remains stable.
    body = {"id": LYNN_DRAFT_ID, "message": {"threadId": LYNN_THREAD_ID}}
    result, rc, err = run_gws([
        "gmail", "users", "drafts", "update",
        "--params", json.dumps({"userId": "me", "id": LYNN_DRAFT_ID}),
        "--json", json.dumps(body),
        "--upload", str(rel),
        "--upload-content-type", "message/rfc822",
    ])
    if rc == 0 and result:
        print(f"[Lynn] drafts.update OK: id={result.get('id')}")
        return True

    print(f"[Lynn] drafts.update failed ({err[:200]}), falling back to delete + create…")
    run_gws([
        "gmail", "users", "drafts", "delete",
        "--params", json.dumps({"userId": "me", "id": LYNN_DRAFT_ID}),
    ])
    result, rc, err = run_gws([
        "gmail", "users", "drafts", "create",
        "--params", json.dumps({"userId": "me"}),
        "--json", json.dumps({"message": {"threadId": LYNN_THREAD_ID}}),
        "--upload", str(rel),
        "--upload-content-type", "message/rfc822",
    ])
    if rc != 0 or not result:
        print(f"[Lynn] FAILED to recreate draft: {err[:400]}")
        return False
    print(f"[Lynn] recreated draft: id={result.get('id')}")
    return True


def load_sent_emails() -> set[str]:
    sent: set[str] = set()
    if not SEND_LOG.exists():
        return sent
    for line in SEND_LOG.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
            if entry.get("status") == "sent":
                sent.add(entry["email"])
        except Exception:
            pass
    return sent


def send_faculty(dry_run: bool) -> bool:
    manifest = json.loads(MANIFEST.read_text())
    drafts = manifest["drafts"]
    already_sent = load_sent_emails()
    remaining = [d for d in drafts if d["email"] not in already_sent]
    print(f"\n[Faculty] {len(already_sent)} already sent; {len(remaining)} to send; {len(drafts)} total.")

    for idx, d in enumerate(remaining, start=1):
        email = d["email"]
        name = d["name"]
        template = d["template"]
        title = d["title"]
        last = d["last_name"]
        placeholder_draft_id = d["draft_id"]

        print(f"\n[{idx}/{len(remaining)}] {title} {last} <{email}> [tmpl {template}]")

        mime = build_mime(email, name, template, title, last, YOUTUBE_URL)
        safe = email.replace("@", "_at_")
        eml_path = WORKDIR / f"send_{safe}.eml"
        eml_path.write_bytes(mime)
        rel = eml_path.relative_to(REPO)
        size_mb = len(mime) / 1024 / 1024
        print(f"    built {size_mb:.2f} MB → {rel}")

        if dry_run:
            print("    --dry-run: skipping send + delete")
            eml_path.unlink(missing_ok=True)
            continue

        result, rc, err = run_gws([
            "gmail", "users", "messages", "send",
            "--params", json.dumps({"userId": "me"}),
            "--json", "{}",
            "--upload", str(rel),
            "--upload-content-type", "message/rfc822",
        ])
        if rc != 0 or not result:
            print(f"    ! SEND FAILED: {err[:400]}")
            with SEND_LOG.open("a") as f:
                f.write(json.dumps({
                    "email": email, "status": "failed", "template": template,
                    "error": err[:500],
                }) + "\n")
            print("    Aborting faculty send loop. Investigate, then re-run; sent emails will be skipped.")
            return False
        sent_id = result.get("id")
        thread_id = result.get("threadId")
        print(f"    ✓ sent id={sent_id} thread={thread_id}")

        with SEND_LOG.open("a") as f:
            f.write(json.dumps({
                "email": email, "status": "sent", "template": template,
                "sent_message_id": sent_id, "sent_thread_id": thread_id,
                "placeholder_draft_id": placeholder_draft_id,
            }) + "\n")

        # Tidy up: delete the placeholder draft and the temp eml file.
        del_result, del_rc, del_err = run_gws([
            "gmail", "users", "drafts", "delete",
            "--params", json.dumps({"userId": "me", "id": placeholder_draft_id}),
        ])
        if del_rc == 0:
            print(f"    ✓ deleted placeholder draft {placeholder_draft_id}")
        else:
            print(f"    ⚠ could not delete draft {placeholder_draft_id}: {del_err[:200]}")
        eml_path.unlink(missing_ok=True)

        if idx < len(remaining):
            print(f"    … sleeping {DELAY_SECONDS}s")
            time.sleep(DELAY_SECONDS)

    print(f"\n[Faculty] Finished. Total sent this run: {len(remaining)}.")
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--lynn-only", action="store_true")
    parser.add_argument("--faculty-only", action="store_true")
    args = parser.parse_args()

    if not BOOKLET.exists():
        print(f"Missing attachment: {BOOKLET}", file=sys.stderr)
        return 1
    if not args.faculty_only and not POSTER.exists():
        print(f"Missing poster for Lynn: {POSTER}", file=sys.stderr)
        return 1

    if not args.faculty_only:
        if not update_lynn(args.dry_run):
            return 2
    if not args.lynn_only:
        if not send_faculty(args.dry_run):
            return 3

    print("\nAll requested steps completed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
