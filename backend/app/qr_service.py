import csv
import shutil
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw
from sqlalchemy.orm import Session

from .config import FRONTEND_URL
from .models import Voter
from .security import create_qr_token


QR_ROOT = Path("qr_codes")


def scope_folder(target_id: int) -> str:
    if target_id == 0:
        return "whole"

    if target_id < 0:
        return f"combined_{abs(target_id)}"

    return f"major_{target_id}"


def save_qr(
    url: str,
    path: Path,
    role: str,
):
    image = qrcode.make(url).convert("RGB")

    if role == "teacher":
        width, height = image.size

        canvas = Image.new(
            "RGB",
            (width, height + 24),
            "white",
        )
        canvas.paste(image, (0, 0))

        draw = ImageDraw.Draw(canvas)
        draw.rectangle(
            (
                18,
                height + 9,
                width - 18,
                height + 15,
            ),
            fill="red",
        )

        image = canvas

    image.save(path)


def ensure_qr_target(
    target_id: int,
    role: str,
    target: int,
    db: Session,
):
    if role not in {"student", "teacher"}:
        raise ValueError("Invalid role")

    if target < 0:
        raise ValueError("Target cannot be negative")

    current = (
        db.query(Voter)
        .filter(
            Voter.major_id == target_id,
            Voter.role == role,
        )
        .count()
    )
    to_create = max(
        0,
        target - current,
    )

    folder = (
        QR_ROOT
        / scope_folder(target_id)
        / f"{role}s"
    )
    folder.mkdir(
        parents=True,
        exist_ok=True,
    )

    manifest = folder / "manifest.csv"
    new_file = not manifest.exists()
    created = []

    with manifest.open(
        "a",
        newline="",
        encoding="utf-8",
    ) as file:
        writer = csv.writer(file)

        if new_file:
            writer.writerow(
                [
                    "voter_id",
                    "festival_target_id",
                    "role",
                    "vote_weight",
                    "qr_file",
                    "url",
                ]
            )

        for _ in range(to_create):
            public_id, secret, stored_token = (
                create_qr_token()
            )

            voter = Voter(
                major_id=target_id,
                role=role,
                token=stored_token,
                active=True,
                vote_weight=(
                    1
                    if role == "student"
                    else 3
                ),
                voted=False,
            )

            db.add(voter)
            db.commit()
            db.refresh(voter)

            url = (
                f"{FRONTEND_URL}/qr-entry#"
                f"{public_id}/{secret}"
            )
            path = (
                folder
                / f"{role}_{voter.voter_id}.png"
            )

            save_qr(
                url,
                path,
                role,
            )

            writer.writerow(
                [
                    voter.voter_id,
                    target_id,
                    role,
                    voter.vote_weight,
                    str(path),
                    url,
                ]
            )

            created.append(
                {
                    "voter_id": voter.voter_id,
                    "qr_file": str(path),
                }
            )

    return {
        "role": role,
        "festival_target_id": target_id,
        "previous_count": current,
        "target": target,
        "created_count": to_create,
        "created": created,
    }


def ensure_all_targets(
    target_id: int,
    students: int,
    teachers: int,
    db: Session,
):
    return {
        "students": ensure_qr_target(
            target_id,
            "student",
            students,
            db,
        ),
        "teachers": ensure_qr_target(
            target_id,
            "teacher",
            teachers,
            db,
        ),
    }


def qr_counts(
    db: Session,
    target_id: int,
):
    return {
        "students": (
            db.query(Voter)
            .filter(
                Voter.major_id == target_id,
                Voter.role == "student",
            )
            .count()
        ),
        "teachers": (
            db.query(Voter)
            .filter(
                Voter.major_id == target_id,
                Voter.role == "teacher",
            )
            .count()
        ),
    }


def build_role_zip(
    target_id: int,
    role: str,
):
    if role not in {"student", "teacher"}:
        raise ValueError("Invalid role")

    folder = (
        QR_ROOT
        / scope_folder(target_id)
        / f"{role}s"
    )
    folder.mkdir(
        parents=True,
        exist_ok=True,
    )

    downloads = QR_ROOT / "downloads"
    downloads.mkdir(
        parents=True,
        exist_ok=True,
    )

    base = (
        downloads
        / f"{scope_folder(target_id)}_{role}s_qr_codes"
    )

    return Path(
        shutil.make_archive(
            str(base),
            "zip",
            root_dir=folder,
        )
    )


def clear_qr_artifacts(
    target_id: int,
):
    base = (
        QR_ROOT
        / scope_folder(target_id)
    )

    if base.exists():
        shutil.rmtree(base)
