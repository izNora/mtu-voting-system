from __future__ import annotations

from datetime import date, datetime, time, timedelta
from ipaddress import IPv6Address, ip_address
from math import ceil
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, Request
from sqlalchemy import and_, or_
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from .config import LOGIN_ATTEMPT_TIMEZONE
from .models import LoginAttempt


MAX_DAILY_FAILED_LOGINS = 3
EMAIL_IDENTIFIER = "email"
IP_IDENTIFIER = "ip"

try:
    _LOGIN_TIMEZONE = ZoneInfo(LOGIN_ATTEMPT_TIMEZONE)
except ZoneInfoNotFoundError as exc:
    raise RuntimeError(
        f"Invalid LOGIN_ATTEMPT_TIMEZONE: {LOGIN_ATTEMPT_TIMEZONE!r}"
    ) from exc


def normalized_login_identifier(value: str) -> str:
    """Normalize an email before authentication and rate-limit lookups."""
    return value.strip().lower()


def normalized_client_ip(value: str | None) -> str:
    """Return one canonical value for equivalent IPv4/IPv6 client addresses."""
    raw_value = (value or "").strip()
    if not raw_value:
        return "unknown"

    if raw_value.startswith("[") and raw_value.endswith("]"):
        raw_value = raw_value[1:-1]

    try:
        parsed = ip_address(raw_value)
    except ValueError:
        return raw_value.lower()[:255] or "unknown"

    if isinstance(parsed, IPv6Address) and parsed.ipv4_mapped:
        parsed = parsed.ipv4_mapped
    return parsed.compressed


def request_client_ip(request: Request) -> str:
    return normalized_client_ip(request.client.host if request.client else None)


def login_identifiers(email: str, client_ip: str) -> dict[str, str]:
    """Build the two independent buckets checked for every login."""
    normalized_email = normalized_login_identifier(email)
    return {
        EMAIL_IDENTIFIER: normalized_email[:255],
        IP_IDENTIFIER: normalized_client_ip(client_ip),
    }


def _login_date(today: date | None = None) -> date:
    return today or datetime.now(_LOGIN_TIMEZONE).date()


def _blocked_exception() -> HTTPException:
    now = datetime.now(_LOGIN_TIMEZONE)
    next_day = datetime.combine(now.date() + timedelta(days=1), time.min, _LOGIN_TIMEZONE)
    retry_after = max(1, ceil((next_day - now).total_seconds()))
    return HTTPException(
        status_code=429,
        detail="Too many failed login attempts. Login is blocked until tomorrow.",
        headers={"Retry-After": str(retry_after)},
    )


def _identifier_filter(identifiers: dict[str, str]):
    return or_(
        *(
            and_(
                LoginAttempt.identifier_type == identifier_type,
                LoginAttempt.identifier_value == identifier_value,
            )
            for identifier_type, identifier_value in identifiers.items()
        )
    )


def _today_attempts(
    db: Session,
    account_type: str,
    identifiers: dict[str, str],
    today: date,
) -> list[LoginAttempt]:
    return (
        db.query(LoginAttempt)
        .filter(
            LoginAttempt.account_type == account_type,
            LoginAttempt.attempt_date == today,
            _identifier_filter(identifiers),
        )
        .all()
    )


def cleanup_expired_login_attempts(
    db: Session,
    today: date | None = None,
) -> int:
    """
    Delete every login-attempt row outside the current local calendar day.

    Cleanup runs at application startup and before each login check, so the
    temporary table never accumulates one record per email/IP per day.
    """
    current_day = _login_date(today)
    try:
        deleted = (
            db.query(LoginAttempt)
            .filter(LoginAttempt.attempt_date != current_day)
            .delete(synchronize_session=False)
        )
        if deleted:
            db.commit()
        return deleted
    except Exception:
        db.rollback()
        raise


def _increment_attempt(
    db: Session,
    account_type: str,
    identifier_type: str,
    identifier_value: str,
    today: date,
) -> None:
    values = {
        "account_type": account_type,
        "identifier_type": identifier_type,
        "identifier_value": identifier_value,
        "attempt_date": today,
        "failed_count": 1,
    }
    dialect = db.get_bind().dialect.name

    if dialect == "mysql":
        statement = mysql_insert(LoginAttempt).values(**values)
        statement = statement.on_duplicate_key_update(
            failed_count=LoginAttempt.failed_count + 1
        )
        db.execute(statement)
        return

    if dialect == "sqlite":
        statement = sqlite_insert(LoginAttempt).values(**values)
        statement = statement.on_conflict_do_update(
            index_elements=[
                "account_type",
                "identifier_type",
                "identifier_value",
                "attempt_date",
            ],
            set_={"failed_count": LoginAttempt.failed_count + 1},
        )
        db.execute(statement)
        return

    attempt = (
        db.query(LoginAttempt)
        .filter(
            LoginAttempt.account_type == account_type,
            LoginAttempt.identifier_type == identifier_type,
            LoginAttempt.identifier_value == identifier_value,
            LoginAttempt.attempt_date == today,
        )
        .with_for_update()
        .first()
    )
    if attempt:
        attempt.failed_count += 1
    else:
        db.add(LoginAttempt(**values))


def reserve_login_attempt(
    db: Session,
    account_type: str,
    identifiers: dict[str, str],
    today: date | None = None,
) -> dict[str, int]:
    """
    Atomically reserve one credential check for both the email and IP buckets.

    The reservation happens before password verification. This prevents a burst
    of simultaneous requests from all passing a separate read-only limit check
    and performing more than three password guesses. A successful login removes
    the reservation; a failed login leaves it as that day's failed attempt.
    """
    current_day = _login_date(today)
    cleanup_expired_login_attempts(db, current_day)
    try:
        for identifier_type, identifier_value in identifiers.items():
            _increment_attempt(
                db,
                account_type,
                identifier_type,
                identifier_value,
                current_day,
            )

        attempts = _today_attempts(db, account_type, identifiers, current_day)
        counts = {attempt.identifier_type: attempt.failed_count for attempt in attempts}
    except Exception:
        db.rollback()
        raise

    if any(count > MAX_DAILY_FAILED_LOGINS for count in counts.values()):
        db.rollback()
        raise _blocked_exception()

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    return counts


def reject_failed_login(counts: dict[str, int]) -> None:
    """Turn a reserved credential check into the appropriate failure response."""
    if any(count >= MAX_DAILY_FAILED_LOGINS for count in counts.values()):
        raise _blocked_exception()

    remaining = min(
        MAX_DAILY_FAILED_LOGINS - counts.get(identifier_type, 0)
        for identifier_type in (EMAIL_IDENTIFIER, IP_IDENTIFIER)
    )
    raise HTTPException(
        status_code=401,
        detail=f"Invalid credentials. {remaining} attempt(s) remaining today.",
    )


def clear_failed_logins(
    db: Session,
    account_type: str,
    identifiers: dict[str, str],
    today: date | None = None,
) -> None:
    current_day = _login_date(today)
    try:
        deleted = (
            db.query(LoginAttempt)
            .filter(
                LoginAttempt.account_type == account_type,
                LoginAttempt.attempt_date == current_day,
                _identifier_filter(identifiers),
            )
            .delete(synchronize_session=False)
        )
        if deleted:
            db.commit()
    except Exception:
        db.rollback()
        raise
