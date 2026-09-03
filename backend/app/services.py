from datetime import datetime

from fastapi import Cookie, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from .database import get_db
from .models import (
    Admin,
    Candidate,
    CombinedFestival,
    CombinedFestivalMajor,
    CombineRequest,
    CombineRequestMajor,
    LoginAttempt,
    PasswordChangeLog,
    Completion,
    Major,
    MajorSelection,
    Title,
    Voter,
    Vote,
    WholeCandidate,
    WholeSelection,
)
from .security import read_session


def current_year() -> int:
    return datetime.now().year


def combined_target_key(combined_id: int) -> int:
    return -abs(combined_id)


def combined_id_from_target(target_id: int) -> int | None:
    return abs(target_id) if target_id < 0 else None


DEFAULT_TITLES = [
    ("King", "boy"),
    ("Queen", "girl"),
    ("Smart", "boy"),
    ("Style", "girl"),
    ("Mr.Popular", "boy"),
    ("Ms.Popular", "girl"),
]


def title_group(title_id: int) -> str:
    return "boy" if title_id % 2 else "girl"


def ensure_default_titles(db: Session, major_id: int) -> None:
    """Create the six built-in award titles for one target, preserving odd/even gender IDs."""
    next_id = (db.query(func.max(Title.title_id)).scalar() or 0) + 1
    for title_name, group in DEFAULT_TITLES:
        exists = db.query(Title).filter(
            Title.major_id == major_id,
            func.lower(Title.title) == title_name.lower(),
        ).first()
        if exists:
            continue
        if group == "boy" and next_id % 2 == 0:
            next_id += 1
        if group == "girl" and next_id % 2 == 1:
            next_id += 1
        db.add(Title(title_id=next_id, title=title_name, major_id=major_id))
        next_id += 1


def is_popular_title(title: Title) -> bool:
    return title.title.strip().lower() in {"mr.popular", "ms.popular"}




def voter_cookie_name(voter_id: int) -> str:
    return f"voter_session_{int(voter_id)}"


def voter_from_request(
    request: Request,
    db: Session,
    voter_id: int | None = None,
):
    resolved_id = voter_id

    if resolved_id is None:
        raw_id = request.query_params.get("voter_id")
        if raw_id is None:
            raw_id = request.headers.get("X-Voter-Id")
        if raw_id is not None:
            try:
                resolved_id = int(raw_id)
            except (TypeError, ValueError):
                return None

    if resolved_id is not None:
        if resolved_id <= 0:
            return None
        value = request.cookies.get(voter_cookie_name(resolved_id))
        voter = voter_from_session(value, db)
        if voter is None or voter.voter_id != resolved_id:
            return None
        return voter


    return None


def voter_from_session(
    voter_session: str | None,
    db: Session,
):
    if not voter_session:
        return None

    payload = read_session(
        voter_session,
        max_age=43200,
    )

    if not payload or payload.get("type") != "voter":
        return None

    try:
        voter_id = int(payload["id"])
    except (KeyError, TypeError, ValueError):
        return None

    voter = db.get(Voter, voter_id)

    if not voter or not voter.active:
        return None

    return voter


def current_voter(
    request: Request,
    db: Session = Depends(get_db),
):
    voter = voter_from_request(
        request,
        db,
    )

    if not voter:
        raise HTTPException(
            401,
            "Invalid or expired voter QR session",
        )

    return voter




def current_admin(
    admin_session: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
):
    payload = (
        read_session(admin_session, max_age=28800)
        if admin_session
        else None
    )

    if not payload or payload.get("type") != "admin":
        raise HTTPException(401, "Admin login required")

    try:
        admin_id = int(payload["id"])
        cookie_version = int(payload["session_version"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(401, "Admin session expired. Please log in again")

    admin = db.get(Admin, admin_id)

    if not admin:
        raise HTTPException(401, "Admin account no longer exists")

    if cookie_version != admin.session_version:
        raise HTTPException(
            401,
            "Admin session was revoked. Please log in again",
        )

    return admin




def require_developer(
    developer_session: str | None = Cookie(default=None),
):
    payload = (
        read_session(developer_session, max_age=28800)
        if developer_session
        else None
    )
    if not payload or payload.get("type") != "developer":
        raise HTTPException(401, "Developer login required")
    return payload


def require_major_admin(
    admin: Admin = Depends(current_admin),
):
    if admin.admin_role != "major_admin" or admin.major_id is None:
        raise HTTPException(403, "Major admin access required")

    return admin


def require_whole_admin(
    admin: Admin = Depends(current_admin),
):
    if admin.admin_role != "whole_admin":
        raise HTTPException(403, "Whole admin access required")

    return admin


def combined_member_major_ids(
    db: Session,
    combined_id: int,
) -> list[int]:
    return [
        row[0]
        for row in (
            db.query(CombinedFestivalMajor.major_id)
            .filter(CombinedFestivalMajor.combined_id == combined_id)
            .order_by(CombinedFestivalMajor.major_id)
            .all()
        )
    ]


def target_major_ids(
    db: Session,
    target_id: int,
) -> list[int]:
    if target_id == 0:
        return []

    if target_id > 0:
        return [target_id]

    combined_id = combined_id_from_target(target_id)

    return combined_member_major_ids(
        db,
        combined_id,
    )

def admin_title_major_ids(
    db: Session,
    major_id: int,
) -> list[int]:
    membership = (
        db.query(CombinedFestivalMajor)
        .filter(CombinedFestivalMajor.major_id == major_id)
        .first()
    )

    if not membership:
        return [major_id]

    return combined_member_major_ids(
        db,
        membership.combined_id,
    )

def target_name(
    db: Session,
    target_id: int,
) -> str:
    if target_id == 0:
        return "Whole"

    if target_id > 0:
        major = db.get(Major, target_id)
        return major.major if major else "Unknown Major"

    combined_id = combined_id_from_target(target_id)
    combined = db.get(CombinedFestival, combined_id)

    return combined.combined_name if combined else "Combined Festival"


def organizer_targets(
    admin: Admin,
    db: Session,
) -> list[dict]:
    if admin.admin_role == "whole_admin":
        return [{"target_id": 0, "name": "Whole", "type": "whole", "major_ids": []}]

    if admin.admin_role != "major_admin" or admin.major_id is None:
        raise HTTPException(403, "Organizer access is not available for this account")

    combined = (
        db.query(CombinedFestival)
        .join(CombinedFestivalMajor, CombinedFestivalMajor.combined_id == CombinedFestival.combined_id)
        .filter(CombinedFestivalMajor.major_id == admin.major_id)
        .first()
    )

    if combined:
        return [{
            "target_id": combined_target_key(combined.combined_id),
            "name": combined.combined_name,
            "type": "combined",
            "major_ids": combined_member_major_ids(db, combined.combined_id),
        }]

    return [{
        "target_id": admin.major_id,
        "name": target_name(db, admin.major_id),
        "type": "major",
        "major_ids": [admin.major_id],
    }]

def organizer_target(
    admin: Admin,
    db: Session,
    requested_target: int | None = None,
) -> int:
    targets = organizer_targets(admin, db)
    allowed = {item["target_id"] for item in targets}

    if requested_target is None:
        return targets[0]["target_id"]

    if requested_target not in allowed:
        raise HTTPException(
            403,
            "You cannot organize the selected festival",
        )

    return requested_target



def annual_cleanup_if_needed(db: Session) -> bool:
    """Delete previous-year operational data while preserving majors and titles."""
    year = current_year()
    stored_year = db.query(func.max(Completion.year)).scalar()

    if stored_year is None or stored_year >= year:
        return False

    db.query(Vote).delete(synchronize_session=False)
    db.query(Voter).delete(synchronize_session=False)
    db.query(WholeCandidate).delete(synchronize_session=False)
    db.query(WholeSelection).delete(synchronize_session=False)
    db.query(MajorSelection).delete(synchronize_session=False)
    db.query(Candidate).delete(synchronize_session=False)
    db.query(CombineRequestMajor).delete(synchronize_session=False)
    db.query(CombineRequest).delete(synchronize_session=False)
    db.query(CombinedFestivalMajor).delete(synchronize_session=False)
    db.query(CombinedFestival).delete(synchronize_session=False)
    db.query(PasswordChangeLog).delete(synchronize_session=False)
    db.query(LoginAttempt).delete(synchronize_session=False)
    db.query(Admin).delete(synchronize_session=False)
    db.query(Completion).delete(synchronize_session=False)
    db.commit()
    return True

def ensure_year_rows(db: Session):
    year = current_year()

    target_ids = [0]
    target_ids.extend(
        major.major_id
        for major in db.query(Major).all()
    )
    target_ids.extend(
        combined_target_key(row.combined_id)
        for row in db.query(CombinedFestival).all()
    )

    for target_id in target_ids:
        completion = (
            db.query(Completion)
            .filter(Completion.major_id == target_id)
            .first()
        )

        if not completion:
            db.add(
                Completion(
                    major_id=target_id,
                    status=0,
                    year=year,
                )
            )
        elif completion.year != year:
            completion.year = year
            completion.status = 0

    db.flush()


def festival_context(
    db: Session,
    target_id: int,
) -> dict:
    """Return festival state without performing any database writes.

    This function is used by hot read paths such as QR verification and ballot
    loading.  Calling ``ensure_year_rows`` here caused hundreds of simultaneous
    voters to race while trying to create the same missing system rows, which
    produced MySQL deadlocks under load.

    Missing or stale rows are therefore treated as a closed/default festival.
    Row creation/reset belongs to explicit lifecycle operations such as setup,
    admin flows, and organizer start.
    """
    year = current_year()

    completion = (
        db.query(Completion)
        .filter(Completion.major_id == target_id)
        .first()
    )
    status = (
        int(completion.status)
        if completion is not None and int(completion.year) == year
        else 0
    )

    if target_id > 0:
        membership = db.query(CombinedFestivalMajor).filter(
            CombinedFestivalMajor.major_id == target_id
        ).first()
        if membership:
            combined_completion = db.query(Completion).filter(
                Completion.major_id == combined_target_key(membership.combined_id),
                Completion.year == year,
            ).first()
            if combined_completion is not None:
                combined_status = int(combined_completion.status)
                if combined_status == 2:

                    status = 2
                elif combined_status == 1:
                    status = 1
    return {
        "target_id": target_id,
        "year": year,
        "status": status,
        "voting_open": status == 1,
        "include_popular": True,
        "name": target_name(db, target_id),
        "major_ids": target_major_ids(db, target_id),
    }


def current_titles(
    db: Session,
    target_id: int,
):
    context = festival_context(db, target_id)

    major_ids = [0] if target_id == 0 else context["major_ids"]

    titles = (
        db.query(Title)
        .filter(Title.major_id.in_(major_ids))
        .order_by(Title.title_id)
        .all()
    )

    if target_id < 0:
        unique_titles = []
        seen_names = set()
        for title in titles:
            key = title.title.strip().casefold()
            if key in seen_names:
                continue
            seen_names.add(key)
            unique_titles.append(title)
        return unique_titles

    return titles


def sync_voter_voted(
    voter: Voter,
    db: Session,
):
    required = {
        title.title_id
        for title in current_titles(db, voter.major_id)
    }

    selected = {
        row[0]
        for row in (
            db.query(Vote.title_id)
            .filter(
                Vote.voter_id == voter.voter_id,
                Vote.c_id > 0,
            )
            .all()
        )
    }

    voter.voted = bool(required) and required.issubset(selected)
    db.flush()

    return voter.voted


def candidate_query(
    db: Session,
    target_id: int,
):
    if target_id == 0:
        return (
            db.query(Candidate)
            .join(
                WholeCandidate,
                WholeCandidate.c_id == Candidate.c_id,
            )
        )

    member_ids = target_major_ids(db, target_id)

    return db.query(Candidate).filter(
        Candidate.major_id.in_(member_ids)
    )


def candidate_allowed(
    db: Session,
    target_id: int,
    candidate_id: int,
):
    return (
        candidate_query(db, target_id)
        .filter(Candidate.c_id == candidate_id)
        .first()
    )


def candidate_management_locked(
    db: Session,
    major_id: int,
) -> bool:
    ensure_year_rows(db)

    major_completion = (
        db.query(Completion)
        .filter(
            Completion.major_id == major_id
        )
        .first()
    )

    if (
        major_completion
        and major_completion.status in {1, 2}
    ):
        return True

    combined_ids = (
        db.query(
            CombinedFestivalMajor.combined_id
        )
        .filter(
            CombinedFestivalMajor.major_id == major_id
        )
        .all()
    )

    for row in combined_ids:
        combined_id = row[0]
        target_id = combined_target_key(
            combined_id
        )

        combined_completion = (
            db.query(Completion)
            .filter(
                Completion.major_id == target_id
            )
            .first()
        )

        if (
            combined_completion
            and combined_completion.status in {1, 2}
        ):
            return True

    return False

def calculate_winners(
    db: Session,
    target_id: int,
):
    """Return the ranked top three candidates for every title.

    The function intentionally does not decide the award recipient.  The
    organizer uses this ranking as the manual-selection shortlist after the
    event is ended.
    """
    results = []
    member_ids = target_major_ids(db, target_id)

    for title in current_titles(db, target_id):
        group = title_group(title.title_id)

        query = (
            db.query(
                Candidate.c_id,
                Candidate.c_name,
                Candidate.c_number,
                Candidate.c_photo,
                Candidate.major_id,
                func.coalesce(func.sum(Voter.vote_weight), 0).label("weight"),
            )
            .join(Vote, Vote.c_id == Candidate.c_id)
            .join(Voter, Voter.voter_id == Vote.voter_id)
            .filter(
                Vote.title_id == title.title_id,
                Vote.c_id > 0,
                Voter.major_id == target_id,
                Candidate.c_gender == group,
            )
        )

        if target_id == 0:
            query = query.join(WholeCandidate, WholeCandidate.c_id == Candidate.c_id)
        else:
            query = query.filter(Candidate.major_id.in_(member_ids))

        rows = (
            query
            .group_by(
                Candidate.c_id,
                Candidate.c_name,
                Candidate.c_number,
                Candidate.c_photo,
                Candidate.major_id,
            )
            .order_by(
                func.sum(Voter.vote_weight).desc(),
                Candidate.c_number.asc(),
                Candidate.c_id.asc(),
            )
            .limit(3)
            .all()
        )

        candidates = []
        for row in rows:
            display_number = row.c_number
            if target_id == 0:
                whole_number = (
                    db.query(WholeCandidate.c_w_number)
                    .filter(WholeCandidate.c_id == row.c_id)
                    .scalar()
                )
                if whole_number is not None:
                    display_number = whole_number

            candidates.append({
                "c_id": row.c_id,
                "c_name": row.c_name,
                "c_number": display_number,
                "c_photo": row.c_photo,
                "major_id": row.major_id,
                "total_vote_weight": int(row.weight),
            })

        top_weight = candidates[0]["total_vote_weight"] if candidates else 0
        results.append({
            "title_id": title.title_id,
            "title": title.title,
            "group": group,
            "total_vote_weight": top_weight,
            "winners": candidates,
        })

    return results

def save_winners(
    db: Session,
    target_id: int,
    winners: list,
):
    year = current_year()

    for result in winners:
        if not result["winners"]:
            continue

        winner = sorted(
            result["winners"],
            key=lambda item: (
                item["c_number"],
                item["c_id"],
            ),
        )[0]

        if target_id == 0:
            (
                db.query(WholeSelection)
                .filter(
                    WholeSelection.year == year,
                    WholeSelection.title_id == result["title_id"],
                )
                .delete(synchronize_session=False)
            )
            db.add(
                WholeSelection(
                    c_id=winner["c_id"],
                    title_id=result["title_id"],
                    total_vote_weight=winner["total_vote_weight"],
                    year=year,
                )
            )
            continue

        (
            db.query(MajorSelection)
            .filter(
                MajorSelection.target_id == target_id,
                MajorSelection.year == year,
                MajorSelection.title_id == result["title_id"],
            )
            .delete(synchronize_session=False)
        )

        db.add(
            MajorSelection(
                c_id=winner["c_id"],
                title_id=result["title_id"],
                target_id=target_id,
                total_vote_weight=winner["total_vote_weight"],
                year=year,
            )
        )





def saved_winners(
    db: Session,
    target_id: int,
):
    year = current_year()
    major_names = {
        row.major_id: row.major
        for row in db.query(Major).all()
    }

    if target_id == 0:
        rows = (
            db.query(WholeSelection, Candidate, Title)
            .join(Candidate, Candidate.c_id == WholeSelection.c_id)
            .join(Title, Title.title_id == WholeSelection.title_id)
            .filter(WholeSelection.year == year)
            .order_by(Title.title_id)
            .all()
        )

        result = []
        for selection, candidate, title in rows:
            whole_number = (
                db.query(WholeCandidate.c_w_number)
                .filter(WholeCandidate.c_id == candidate.c_id)
                .scalar()
            )

            number = whole_number if whole_number is not None else candidate.c_number
            weight = int(selection.total_vote_weight or 0)
            result.append({
                "title_id": title.title_id,
                "title": title.title,
                "group": title_group(title.title_id),
                "total_vote_weight": weight,
                "winners": [{
                    "c_id": candidate.c_id,
                    "c_name": candidate.c_name,
                    "c_number": number,
                    "c_photo": candidate.c_photo,
                    "major_id": candidate.major_id,
                    "major": major_names.get(candidate.major_id),
                    "total_vote_weight": weight,
                }],
            })
        return result

    rows = (
        db.query(MajorSelection, Candidate, Title)
        .join(Candidate, Candidate.c_id == MajorSelection.c_id)
        .join(Title, Title.title_id == MajorSelection.title_id)
        .filter(
            MajorSelection.target_id == target_id,
            MajorSelection.year == year,
        )
        .order_by(Title.title_id)
        .all()
    )

    result = []
    for selection, candidate, title in rows:
        weight = int(selection.total_vote_weight or 0)
        result.append({
            "title_id": title.title_id,
            "title": title.title,
            "group": title_group(title.title_id),
            "total_vote_weight": weight,
            "winners": [{
                "c_id": candidate.c_id,
                "c_name": candidate.c_name,
                "c_number": candidate.c_number,
                "c_photo": candidate.c_photo,
                "major_id": candidate.major_id,
                "major": major_names.get(candidate.major_id),
                "total_vote_weight": weight,
            }],
        })

    return result


def major_readiness(db: Session):
    """Return whether every *actual major festival* feeding Whole is finished.

    Standalone majors are checked by their positive major_id.  Majors that are
    members of a combined festival are checked once using the combined target
    id (-combined_id).  The reserved Whole major (id 0) is never treated as an
    input festival.
    """
    ensure_year_rows(db)
    year = current_year()
    missing = []
    checked_combined_ids = set()

    majors = (
        db.query(Major)
        .filter(Major.major_id > 0)
        .order_by(Major.major_id)
        .all()
    )

    for major in majors:
        membership = (
            db.query(CombinedFestivalMajor)
            .filter(CombinedFestivalMajor.major_id == major.major_id)
            .first()
        )

        if membership:
            if membership.combined_id in checked_combined_ids:
                continue
            checked_combined_ids.add(membership.combined_id)

            target_id = combined_target_key(membership.combined_id)
            completion = (
                db.query(Completion)
                .filter(
                    Completion.major_id == target_id,
                    Completion.year == year,
                )
                .first()
            )
            if not completion or int(completion.status) != 2:
                combined = db.get(CombinedFestival, membership.combined_id)
                missing.append(
                    combined.combined_name if combined else f"Combined {membership.combined_id}"
                )
            continue

        completion = (
            db.query(Completion)
            .filter(
                Completion.major_id == major.major_id,
                Completion.year == year,
            )
            .first()
        )
        if not completion or int(completion.status) != 2:
            missing.append(major.major)

    return {
        "ready": not missing,
        "missing_majors": missing,
    }


def initialize_default_whole_candidates(db: Session):
    year = current_year()

    winner_ids = [
        row[0]
        for row in (
            db.query(MajorSelection.c_id)
            .join(
                Title,
                Title.title_id == MajorSelection.title_id,
            )
            .filter(
                MajorSelection.year == year,
                Title.title.in_(["King", "Queen"]),
            )
            .distinct()
            .all()
        )
    ]

    existing_rows = db.query(WholeCandidate).all()
    existing_candidate_ids = {
        row.c_id
        for row in existing_rows
    }
    
    next_number = max(
        (int(row.c_w_number) for row in existing_rows),
        default=0,
    ) + 1

    for candidate_id in winner_ids:
        if candidate_id in existing_candidate_ids:
            continue

        db.add(
            WholeCandidate(
                c_id=candidate_id,
                c_w_number=next_number,
            )
        )

        existing_candidate_ids.add(candidate_id)
        next_number += 1


    db.flush()

