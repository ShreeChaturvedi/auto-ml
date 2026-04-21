"""Build 32 faculty Gmail drafts for Agentic AutoML capstone outreach."""

import base64
import csv
import json
import mimetypes
import re
import subprocess
import sys
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from pathlib import Path

REPO = Path("/home/shree/Documents/CSE449/repo")
WORKDIR = REPO / ".tmp" / "faculty-drafts"
CSV_PATH = Path("/home/shree/Documents/miami_cse_faculty.csv")
BOOKLET = WORKDIR / "booklet-q30.pdf"
MANIFEST = WORKDIR / "manifest.json"

FROM = "chaturs@miamioh.edu"
CC = "yadava5@miamioh.edu"
YOUTUBE_PLACEHOLDER = "<YOUTUBE_LINK_PENDING>"

QA_ATTENDEES = {"raodm@miamioh.edu", "mattoxj@miamioh.edu", "khamaisy@miamioh.edu"}
CAPSTONE_ADVISOR = "khamaisy@miamioh.edu"
SKIP = {"stahrlc@miamioh.edu"}  # already handled separately


def parse_prof(name: str) -> tuple[str, str]:
    """Return (title, last_name). Title is 'Dr.' for PhD/DSc, else 'Prof.'."""
    head = name.split(",")[0].strip()
    last = head.split()[-1]
    has_doctorate = bool(re.search(r"\bPh\.?D\.?\b|\bD\.Sc\.?\b", name))
    return ("Dr." if has_doctorate else "Prof.", last)


def template_for(email: str, taken_class: str) -> str:
    if email == CAPSTONE_ADVISOR:
        return "A+"
    if email in QA_ATTENDEES:
        return "A"
    if taken_class.strip().lower() == "true":
        return "B"
    return "C"


def subject_for(template: str) -> str:
    return {
        "A": "Thanks for attending our Q&A (CSE 449 Capstone: Agentic AutoML)",
        "A+": "CSE 449 Capstone wrap-up: Agentic AutoML",
        "B": "CSE 449 Capstone from a former student: Agentic AutoML",
        "C": "CSE 449 Senior Capstone: Agentic AutoML",
    }[template]


def body_text(template: str, title: str, last: str, youtube_url: str = YOUTUBE_PLACEHOLDER) -> str:
    greeting = f"Hi {title} {last},"
    if template == "A":
        return f"""{greeting}

Thanks for making time for our Q&A last week. It was nice seeing you again.

We were a bit rushed in the presentation, so I wanted to share the polished versions of our deliverables:

- Video walkthrough: {youtube_url}
- Technical booklet (attached): 28 pages on the system design and evaluation.

The app is also deployed at https://agentic-automl.vercel.app/ if you want to try it. If you're at Expo, stop by our booth.

Thanks,
Shree Chaturvedi
"""
    if template == "A+":
        return f"""{greeting}

Thanks for coming to the Q&A last week, and for advising Ayush and me across the whole project. We were a bit rushed in the presentation, so I wanted to share the polished versions:

- Video walkthrough: {youtube_url}
- Technical booklet (attached): 28 pages on the system design and evaluation.

The app is deployed at https://agentic-automl.vercel.app/. Hope to see you at our booth on Friday.

Thanks,
Shree Chaturvedi
"""
    if template == "B":
        return f"""{greeting}

I was a student of yours earlier at Miami. Ayush Yadav and I just finished our senior capstone and I wanted to share it in case you have a minute before Expo.

The project is Agentic AutoML, a platform that automates the 80% of a machine learning workflow that isn't model training: upload, exploration, preprocessing, feature engineering, and experimentation. It runs on an agentic LLM backed by sandboxed Python execution.

- Video walkthrough: {youtube_url}
- Technical booklet (attached): 28 pages on the system design and evaluation.
- Live app: https://agentic-automl.vercel.app/

If you're at Expo, stop by our booth.

Thanks,
Shree Chaturvedi
"""
    # C
    return f"""{greeting}

My name is Shree Chaturvedi. I'm a graduating CSE senior. I haven't had the chance to take one of your classes, but Ayush Yadav and I just finished our senior capstone and I wanted to share it with the department.

The project is Agentic AutoML, a platform that automates the 80% of a machine learning workflow that isn't model training: upload, exploration, preprocessing, feature engineering, and experimentation. It runs on an agentic LLM backed by sandboxed Python execution.

- Video walkthrough: {youtube_url}
- Technical booklet (attached): 28 pages on the system design and evaluation.
- Live app: https://agentic-automl.vercel.app/

If you're at Expo, stop by our booth.

Thanks,
Shree Chaturvedi
"""


def _video_link_html(youtube_url: str) -> str:
    """Clickable anchor for a real URL, escaped literal for the placeholder."""
    if youtube_url == YOUTUBE_PLACEHOLDER:
        # Escape angle brackets so Gmail actually displays the placeholder text.
        return "&lt;YOUTUBE_LINK_PENDING&gt;"
    return f'<a href="{youtube_url}">{youtube_url}</a>'


def body_html(template: str, title: str, last: str, youtube_url: str = YOUTUBE_PLACEHOLDER) -> str:
    greeting = f"Hi {title} {last},"
    yt = _video_link_html(youtube_url)
    if template == "A":
        return f"""<div dir="ltr">
<div>{greeting}</div>
<div><br></div>
<div>Thanks for making time for our Q&amp;A last week. It was nice seeing you again.</div>
<div><br></div>
<div>We were a bit rushed in the presentation, so I wanted to share the polished versions of our deliverables:</div>
<div><br></div>
<ul>
<li><b>Video walkthrough</b>: {yt}</li>
<li><b>Technical booklet (attached)</b>: 28 pages on the system design and evaluation.</li>
</ul>
<div><br></div>
<div>The app is also deployed at <a href="https://agentic-automl.vercel.app/">https://agentic-automl.vercel.app/</a> if you want to try it. If you're at Expo, stop by our booth.</div>
<div><br></div>
<div>Thanks,</div>
<div>Shree Chaturvedi</div>
</div>"""
    if template == "A+":
        return f"""<div dir="ltr">
<div>{greeting}</div>
<div><br></div>
<div>Thanks for coming to the Q&amp;A last week, and for advising Ayush and me across the whole project. We were a bit rushed in the presentation, so I wanted to share the polished versions:</div>
<div><br></div>
<ul>
<li><b>Video walkthrough</b>: {yt}</li>
<li><b>Technical booklet (attached)</b>: 28 pages on the system design and evaluation.</li>
</ul>
<div><br></div>
<div>The app is deployed at <a href="https://agentic-automl.vercel.app/">https://agentic-automl.vercel.app/</a>. Hope to see you at our booth on Friday.</div>
<div><br></div>
<div>Thanks,</div>
<div>Shree Chaturvedi</div>
</div>"""
    if template == "B":
        return f"""<div dir="ltr">
<div>{greeting}</div>
<div><br></div>
<div>I was a student of yours earlier at Miami. Ayush Yadav and I just finished our senior capstone and I wanted to share it in case you have a minute before Expo.</div>
<div><br></div>
<div>The project is <b>Agentic AutoML</b>, a platform that automates the 80% of a machine learning workflow that isn't model training: upload, exploration, preprocessing, feature engineering, and experimentation. It runs on an agentic LLM backed by sandboxed Python execution.</div>
<div><br></div>
<ul>
<li><b>Video walkthrough</b>: {yt}</li>
<li><b>Technical booklet (attached)</b>: 28 pages on the system design and evaluation.</li>
<li><b>Live app</b>: <a href="https://agentic-automl.vercel.app/">https://agentic-automl.vercel.app/</a></li>
</ul>
<div><br></div>
<div>If you're at Expo, stop by our booth.</div>
<div><br></div>
<div>Thanks,</div>
<div>Shree Chaturvedi</div>
</div>"""
    # C
    return f"""<div dir="ltr">
<div>{greeting}</div>
<div><br></div>
<div>My name is Shree Chaturvedi. I'm a graduating CSE senior. I haven't had the chance to take one of your classes, but Ayush Yadav and I just finished our senior capstone and I wanted to share it with the department.</div>
<div><br></div>
<div>The project is <b>Agentic AutoML</b>, a platform that automates the 80% of a machine learning workflow that isn't model training: upload, exploration, preprocessing, feature engineering, and experimentation. It runs on an agentic LLM backed by sandboxed Python execution.</div>
<div><br></div>
<ul>
<li><b>Video walkthrough</b>: {yt}</li>
<li><b>Technical booklet (attached)</b>: 28 pages on the system design and evaluation.</li>
<li><b>Live app</b>: <a href="https://agentic-automl.vercel.app/">https://agentic-automl.vercel.app/</a></li>
</ul>
<div><br></div>
<div>If you're at Expo, stop by our booth.</div>
<div><br></div>
<div>Thanks,</div>
<div>Shree Chaturvedi</div>
</div>"""


def build_mime(
    email: str,
    name: str,
    template: str,
    title: str,
    last: str,
    youtube_url: str = YOUTUBE_PLACEHOLDER,
) -> bytes:
    msg = EmailMessage()
    msg["From"] = FROM
    msg["To"] = email
    msg["Cc"] = CC
    msg["Subject"] = subject_for(template)
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain="mail.gmail.com")
    msg.set_content(body_text(template, title, last, youtube_url))
    msg.add_alternative(body_html(template, title, last, youtube_url), subtype="html")

    ctype, _ = mimetypes.guess_type(str(BOOKLET))
    if not ctype:
        ctype = "application/pdf"
    maintype, subtype = ctype.split("/", 1)
    with BOOKLET.open("rb") as f:
        data = f.read()
    msg.add_attachment(data, maintype=maintype, subtype=subtype, filename="booklet.pdf")
    return msg.as_bytes()


def create_draft(eml_path: Path) -> dict:
    rel = eml_path.relative_to(REPO)
    result = subprocess.run(
        [
            "gws",
            "gmail",
            "users",
            "drafts",
            "create",
            "--params",
            '{"userId": "me"}',
            "--json",
            '{}',
            "--upload",
            str(rel),
            "--upload-content-type",
            "message/rfc822",
        ],
        capture_output=True,
        text=True,
        cwd=REPO,
        timeout=180,
    )
    # gws emits a leading "Using keyring backend: keyring" line; strip before parsing JSON
    stdout = result.stdout
    # Find the first '{' on a line by itself to start JSON
    idx = stdout.find("\n{")
    if idx >= 0:
        stdout = stdout[idx + 1 :]
    try:
        return json.loads(stdout)
    except Exception as e:
        sys.stderr.write(f"FAILED to parse draft create response:\n{result.stdout}\n{result.stderr}\n")
        raise


def main():
    with CSV_PATH.open() as f:
        rows = list(csv.DictReader(f))

    # Filter out the one we skip (Lynn)
    rows = [r for r in rows if r["email"].strip() not in SKIP]

    manifest = {
        "youtube_placeholder": YOUTUBE_PLACEHOLDER,
        "booklet_path": str(BOOKLET),
        "drafts": [],
    }

    for row in rows:
        name = row["name"].strip()
        email = row["email"].strip()
        taken = row.get("taken_class", "").strip()
        template = template_for(email, taken)
        title, last = parse_prof(name)
        print(f"[{template:2}] {title} {last:15} <{email}>")

        mime_bytes = build_mime(email, name, template, title, last)
        safe_email = email.replace("@", "_at_")
        eml_path = WORKDIR / f"{safe_email}.eml"
        eml_path.write_bytes(mime_bytes)

        response = create_draft(eml_path)
        draft_id = response.get("id")
        message_id = response.get("message", {}).get("id")
        manifest["drafts"].append(
            {
                "email": email,
                "name": name,
                "title": title,
                "last_name": last,
                "template": template,
                "taken_class": taken,
                "draft_id": draft_id,
                "message_id": message_id,
                "subject": subject_for(template),
                "eml_path": str(eml_path),
            }
        )
        # Write manifest after each success so partial progress is recoverable
        MANIFEST.write_text(json.dumps(manifest, indent=2))
        print(f"     -> draft_id={draft_id}")

    # Summary
    from collections import Counter
    counts = Counter(d["template"] for d in manifest["drafts"])
    print("\n=== SUMMARY ===")
    for t in ["A", "A+", "B", "C"]:
        print(f"  Template {t}: {counts.get(t, 0)}")
    print(f"  TOTAL:       {sum(counts.values())}")
    print(f"\nManifest: {MANIFEST}")


if __name__ == "__main__":
    main()
