from datetime import date, datetime
from pathlib import Path
import hmac
import logging
import re
import uuid
import anyio
import anyio.to_thread
from fastapi import Cookie, Depends, FastAPI, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse as StarletteJSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, text
from sqlalchemy.exc import DBAPIError, IntegrityError, OperationalError, TimeoutError as SQLAlchemyTimeoutError
from sqlalchemy.orm import Session
from pydantic import BaseModel
from .config import COOKIE_SECURE, CORS_ORIGINS, FRONTEND_URL, DEVELOPER_EMAIL, DEVELOPER_PASSWORD, SYNC_THREAD_LIMIT, API_DB_CONCURRENCY_LIMIT
from .database import SessionLocal, get_db, engine
from .models import (
    Admin,
    Candidate,
    CombinedFestival,
    CombinedFestivalMajor,
    CombineRequest,
    CombineRequestMajor,
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
from .qr_service import build_role_zip, clear_qr_artifacts, ensure_all_targets, qr_counts
from .security import create_session, hash_password, verify_password, verify_qr_token
from .storage_service import delete_candidate_photo, ensure_storage_ready, upload_candidate_photo
from .login_security import (
    cleanup_expired_login_attempts,
    clear_failed_logins,
    login_identifiers,
    normalized_login_identifier,
    reject_failed_login,
    request_client_ip,
    reserve_login_attempt,
)
from .services import (
    annual_cleanup_if_needed,
    calculate_winners,
    candidate_allowed,
    candidate_management_locked,
    candidate_query,
    combined_target_key,
    current_admin,
    current_titles,
    current_voter,
    voter_from_session,
    voter_from_request,
    voter_cookie_name,
    ensure_year_rows,
    festival_context,
    initialize_default_whole_candidates,
    major_readiness,
    organizer_target,
    organizer_targets,
    require_developer,
    require_major_admin,
    require_whole_admin,
    save_winners,
    saved_winners,
    sync_voter_voted,
    target_major_ids,
    target_name,
    title_group,
    admin_title_major_ids,
    ensure_default_titles
)


logger = logging.getLogger("qr_voting.api")

_api_db_gate = anyio.Semaphore(max(1, API_DB_CONCURRENCY_LIMIT))


def request_error_id(request: Request) -> str:
    """Return a stable per-request id for frontend error reporting/server logs."""
    request_id = getattr(request.state, "request_id", None)
    if request_id:
        return request_id
    request_id = uuid.uuid4().hex
    request.state.request_id = request_id
    return request_id


def mysql_error_code(exc: BaseException) -> int | None:
    """Extract a MySQL/PyMySQL numeric error code without exposing SQL text."""
    original = getattr(exc, "orig", None)
    args = getattr(original, "args", ()) if original is not None else ()
    try:
        return int(args[0]) if args else None
    except (TypeError, ValueError):
        return None


def database_busy_response(request: Request, exc: BaseException):
    request_id = request_error_id(request)
    code = mysql_error_code(exc)

    if isinstance(exc, SQLAlchemyTimeoutError):
        error_code = "database_pool_exhausted"
        message = "The voting service is temporarily at database capacity. Please retry shortly."
    elif code == 1213:
        error_code = "database_deadlock"
        message = "The database was busy resolving simultaneous updates. Please retry the request."
    elif code == 1205:
        error_code = "database_lock_timeout"
        message = "The database is temporarily busy. Please retry the request."
    elif code == 1040:
        error_code = "database_connection_limit"
        message = "The voting service is temporarily at database capacity. Please retry shortly."
    else:
        error_code = "database_temporarily_unavailable"
        message = "The database is temporarily unavailable. Please retry shortly."

    logger.exception(
        "Database API failure request_id=%s path=%s mysql_code=%s",
        request_id,
        request.url.path,
        code,
        exc_info=exc,
    )
    return StarletteJSONResponse(
        status_code=503,
        headers={"Retry-After": "1", "X-Request-ID": request_id},
        content={
            "success": False,
            "status": 503,
            "detail": message,
            "error": {
                "code": error_code,
                "type": "database_error",
                "message": message,
                "retryable": True,
                "mysql_code": code,
                "request_id": request_id,
            },
        },
    )


class JSONResponse(StarletteJSONResponse):
    """Uniform envelope for every successful JSON API response.

    Existing top-level keys are preserved for the bundled frontend while every
    success response now also has: success, status, and data. Raw arrays are
    placed in data. Error responses (4xx/5xx) are left untouched and are
    normalized by the exception handlers below.
    """

    def __init__(self, content=None, status_code=200, headers=None, media_type=None, background=None):
        if 200 <= status_code < 300:
            original = {} if content is None else content

            envelope = {
                "success": True,
                "http_status": status_code,
                "data": original,
            }
            if isinstance(original, dict):
                envelope.update(original)
                envelope["success"] = True
                envelope["http_status"] = status_code
                envelope["data"] = original

                if "status" not in original:
                    envelope["status"] = status_code
            else:
                envelope["status"] = status_code
            content = envelope
        elif status_code >= 400 and isinstance(content, dict):
            normalized = dict(content)
            normalized["success"] = False
            normalized["status"] = status_code
            message = normalized.get("detail") or "Request failed"
            normalized.setdefault(
                "error",
                {
                    "code": normalized.get("reason") or f"http_{status_code}",
                    "type": "api_error",
                    "message": message,
                },
            )
            content = normalized
        super().__init__(content=content, status_code=status_code, headers=headers, media_type=media_type, background=background)


class DatabaseConflictError(Exception):
    def __init__(
        self,
        *,
        code: str,
        message: str,
        resource: str,
        constraint: str | None = None,
        fields: dict | None = None,
    ):
        self.code = code
        self.message = message
        self.resource = resource
        self.constraint = constraint
        self.fields = fields or {}
        super().__init__(message)


def integrity_constraint(exc: IntegrityError) -> str | None:
    """Return the MySQL constraint/key name without exposing SQL details."""
    try:
        message = str(exc.orig.args[1])
    except Exception:
        message = str(exc)
    match = re.search(r"for key ['`]?([^'`]+)['`]?", message, flags=re.IGNORECASE)
    if not match:
        return None
    key = match.group(1)

    return key.rsplit('.', 1)[-1]


def raise_known_conflict(
    *,
    code: str,
    message: str,
    resource: str,
    constraint: str | None = None,
    fields: dict | None = None,
):
    raise DatabaseConflictError(
        code=code,
        message=message,
        resource=resource,
        constraint=constraint,
        fields=fields,
    )


def raise_database_conflict(
    exc: IntegrityError,
    *,
    code: str,
    message: str,
    resource: str,
    fields: dict | None = None,
):
    raise DatabaseConflictError(
        code=code,
        message=message,
        resource=resource,
        constraint=integrity_constraint(exc),
        fields=fields,
    ) from exc




class QRVerifyRequest(BaseModel):
    public_id: str
    secret: str


class BallotSelection(BaseModel):
    title_id: int
    candidate_id: int


class BallotSubmitRequest(BaseModel):
    selections: list[BallotSelection]


class ManualWinnerSelection(BaseModel):
    title_id: int
    candidate_id: int


class ManualWinnerSubmitRequest(BaseModel):
    selections: list[ManualWinnerSelection]

app = FastAPI(title='Parallel Major QR Voting API', version='4.0.0', docs_url=None, redoc_url=None, openapi_url=None, default_response_class=JSONResponse)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True, allow_methods=['*'], allow_headers=['*'])


@app.on_event("startup")
def remove_obsolete_festival_state_table():
    """Festival lifecycle now lives entirely in completion; remove legacy table."""
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS festival_state"))


@app.on_event("startup")
def remove_expired_login_attempts_on_startup():
    """Keep only today's temporary email/IP login counters."""
    db = SessionLocal()
    try:
        cleanup_expired_login_attempts(db)
    finally:
        db.close()


@app.on_event("startup")
def ensure_builtin_titles_on_startup():
    """Backfill default titles for existing majors and the reserved Whole target."""
    db = SessionLocal()
    try:
        year = datetime.now().year
        whole = db.get(Major, 0)
        if whole is None:
            db.execute(text("SET SESSION sql_mode = CONCAT(@@sql_mode, ',NO_AUTO_VALUE_ON_ZERO')"))
            db.add(Major(major_id=0, major="Whole"))
            db.flush()
        if not db.query(Completion).filter(Completion.major_id == 0).first():
            db.add(Completion(major_id=0, status=0, year=year))

        for row in db.query(Title).filter(func.lower(Title.title) == "ms.popular").all():
            duplicate = db.query(Title).filter(
                Title.major_id == row.major_id,
                func.lower(Title.title) == "mrs.popular",
                Title.title_id != row.title_id,
            ).first()
            if duplicate:
                db.delete(row)
            else:
                row.title = "Ms.Popular"

        major_ids = [m.major_id for m in db.query(Major).all()]
        for major_id in major_ids:
            ensure_default_titles(db, major_id)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Unable to backfill built-in titles during startup")
        raise
    finally:
        db.close()


@app.on_event("startup")
async def configure_sync_worker_limit():
    """
    Prevent sync request threads from outnumbering available DB connections.

    FastAPI runs this application's synchronous endpoints/dependencies in AnyIO's
    worker-thread pool. If more threads can block waiting for SQLAlchemy connections
    than the QueuePool can provide, yielded `get_db()` dependencies may be delayed
    from reaching their `finally: db.close()` cleanup, causing a pool-starvation
    cascade. Queuing excess requests at the thread limiter avoids that failure mode.
    """
    limiter = anyio.to_thread.current_default_thread_limiter()
    limiter.total_tokens = max(1, SYNC_THREAD_LIMIT)
    logger.info("Configured sync worker-thread limit=%s", limiter.total_tokens)


@app.middleware("http")
async def limit_database_api_concurrency(request: Request, call_next):
    """
    Queue excess database-backed API requests before FastAPI resolves dependencies.

    This prevents a large burst from checking out more SQLAlchemy connections than
    the per-process QueuePool can safely serve. Waiting requests stay asynchronous
    and do not consume a DB connection.
    """
    path = request.url.path
    if path.startswith("/api/"):
        async with _api_db_gate:
            return await call_next(request)
    return await call_next(request)


@app.middleware("http")
async def add_request_id_header(request: Request, call_next):
    request.state.request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
    try:
        response = await call_next(request)
    except Exception:
        
        raise
    response.headers["X-Request-ID"] = request.state.request_id
    return response


@app.exception_handler(OperationalError)
async def operational_database_error_json(request: Request, exc: OperationalError):
    if request.url.path.startswith("/api/"):
        return database_busy_response(request, exc)
    logger.exception("Database operational error path=%s", request.url.path, exc_info=exc)
    return StarletteJSONResponse(status_code=503, content={"detail": "Database temporarily unavailable"})


@app.exception_handler(SQLAlchemyTimeoutError)
async def database_pool_timeout_json(request: Request, exc: SQLAlchemyTimeoutError):
    if request.url.path.startswith("/api/"):
        return database_busy_response(request, exc)
    logger.exception("Database pool timeout path=%s", request.url.path, exc_info=exc)
    return StarletteJSONResponse(status_code=503, content={"detail": "Database temporarily unavailable"})


@app.exception_handler(DBAPIError)
async def generic_database_error_json(request: Request, exc: DBAPIError):
    if request.url.path.startswith("/api/"):
        return database_busy_response(request, exc)
    logger.exception("Database error path=%s", request.url.path, exc_info=exc)
    return StarletteJSONResponse(status_code=503, content={"detail": "Database temporarily unavailable"})


@app.exception_handler(DatabaseConflictError)
async def database_conflict_json(request: Request, exc: DatabaseConflictError):
    return StarletteJSONResponse(
        status_code=409,
        content={
            "success": False,
            "status": 409,
            "detail": exc.message,
            "error": {
                "code": exc.code,
                "type": "database_conflict",
                "message": exc.message,
                "resource": exc.resource,
                "constraint": exc.constraint,
                "fields": exc.fields,
            },
        },
    )


@app.exception_handler(IntegrityError)
async def unhandled_integrity_conflict_json(request: Request, exc: IntegrityError):
    if request.url.path.startswith("/api/"):
        return StarletteJSONResponse(
            status_code=409,
            content={
                "success": False,
                "status": 409,
                "detail": "The request conflicts with current database data.",
                "error": {
                    "code": "database_conflict",
                    "type": "database_conflict",
                    "message": "The request conflicts with current database data.",
                    "resource": "database",
                    "constraint": integrity_constraint(exc),
                    "fields": {},
                },
            },
        )
    return StarletteJSONResponse(status_code=409, content={"detail": "Database conflict"})


@app.exception_handler(HTTPException)
async def http_exception_json(request: Request, exc: HTTPException):
    if request.url.path.startswith("/api/"):
        message = exc.detail if isinstance(exc.detail, str) else "Request failed"
        content = {
            "success": False,
            "status": exc.status_code,
            "detail": exc.detail,
            "error": {
                "code": f"http_{exc.status_code}",
                "type": "http_error",
                "message": message,
            },
        }
        if request.url.path.startswith("/api/voter/") and exc.status_code in {401, 403}:
            content["valid"] = False
        return StarletteJSONResponse(status_code=exc.status_code, content=content, headers=exc.headers)

    return StarletteJSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=exc.headers,
    )



@app.exception_handler(RequestValidationError)
async def validation_exception_json(request: Request, exc: RequestValidationError):
    if request.url.path.startswith("/api/"):
        return JSONResponse(
            status_code=422,
            content={
                "success": False,
                "status": 422,
                "detail": "Invalid request data",
                "error": {
                    "code": "validation_error",
                    "type": "validation_error",
                    "message": "Invalid request data",
                },
                "errors": exc.errors(),
            },
        )
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


ensure_storage_ready()
app.mount('/uploads', StaticFiles(directory='uploads'), name='uploads')

def combined_member_ids_for_major(db: Session, major_id: int) -> list[int]:
    membership = (
        db.query(CombinedFestivalMajor)
        .filter(CombinedFestivalMajor.major_id == major_id)
        .first()
    )

    if not membership:
        return [major_id]

    return [
        row[0]
        for row in (
            db.query(CombinedFestivalMajor.major_id)
            .filter(
                CombinedFestivalMajor.combined_id
                == membership.combined_id
            )
            .all()
        )
    ]


def lock_major_rows(db: Session, major_ids: list[int]) -> None:
    """Serialize operations that span the same Major set.

    Sorted locking order avoids deadlocks when two requests touch the same
    Majors in different input orders.
    """
    ids = sorted({int(mid) for mid in major_ids if mid is not None})
    if ids:
        (
            db.query(Major)
            .filter(Major.major_id.in_(ids))
            .order_by(Major.major_id)
            .with_for_update()
            .all()
        )


def lock_candidate_number_scope(db: Session, major_id: int) -> list[int]:
    member_ids = combined_member_ids_for_major(db, major_id)
    lock_major_rows(db, member_ids)
    return member_ids


def candidate_number_conflict(
    db: Session,
    major_id: int,
    gender: str,
    number: int,
    exclude_candidate_id: int | None = None,
):
    member_ids = combined_member_ids_for_major(
        db,
        major_id,
    )

    query = db.query(Candidate).filter(
        Candidate.major_id.in_(member_ids),
        Candidate.c_number == number,
    )

    if exclude_candidate_id is not None:
        query = query.filter(
            Candidate.c_id != exclude_candidate_id
        )

    return query.first()


def combination_number_conflicts(
    db: Session,
    major_ids: list[int],
) -> list[dict]:
    rows = (
        db.query(Candidate)
        .filter(Candidate.major_id.in_(major_ids))
        .order_by(
            Candidate.c_gender,
            Candidate.c_number,
            Candidate.major_id,
        )
        .all()
    )

    majors = {
        row.major_id: row.major
        for row in (
            db.query(Major)
            .filter(Major.major_id.in_(major_ids))
            .all()
        )
    }

    grouped = {}

    for candidate in rows:
        key = candidate.c_number
        grouped.setdefault(key, []).append(candidate)

    conflicts = []

    for number, candidates in grouped.items():
        candidate_majors = {
            candidate.major_id
            for candidate in candidates
        }

        if len(candidate_majors) < 2:
            continue

        conflicts.append(
            {
                "candidate_number": number,
                "candidates": [
                    {
                        "c_id": candidate.c_id,
                        "c_name": candidate.c_name,
                        "major_id": candidate.major_id,
                        "major": majors.get(candidate.major_id),
                    }
                    for candidate in candidates
                ],
            }
        )

    return conflicts


@app.exception_handler(Exception)
async def unhandled_api_exception_json(request: Request, exc: Exception):
    """Never send HTML/plain-text 500 bodies from /api/* endpoints.

    Full traceback is kept in server logs and the frontend receives a safe
    request_id that can be matched to that log entry.
    """
    request_id = request_error_id(request)
    logger.exception(
        "Unhandled API exception request_id=%s path=%s",
        request_id,
        request.url.path,
        exc_info=exc,
    )
    if request.url.path.startswith("/api/"):
        return StarletteJSONResponse(
            status_code=500,
            headers={"X-Request-ID": request_id},
            content={
                "success": False,
                "status": 500,
                "detail": "An unexpected server error occurred.",
                "error": {
                    "code": "internal_server_error",
                    "type": "server_error",
                    "message": "An unexpected server error occurred.",
                    "retryable": False,
                    "request_id": request_id,
                },
            },
        )
    return StarletteJSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "request_id": request_id},
        headers={"X-Request-ID": request_id},
    )

@app.get("/", include_in_schema=False)
def frontend_home():
    return RedirectResponse(f"{FRONTEND_URL}/", status_code=307)


@app.get("/admin", include_in_schema=False)
def frontend_admin():
    return RedirectResponse(f"{FRONTEND_URL}/admin", status_code=307)


@app.get("/developer", include_in_schema=False)
def frontend_developer():
    return RedirectResponse(f"{FRONTEND_URL}/developer", status_code=307)

@app.get("/developer/dashboard", include_in_schema=False)
def frontend_developer_dashboard():
    return RedirectResponse(f"{FRONTEND_URL}/developer/dashboard", status_code=307)

@app.get("/admin/dashboard", include_in_schema=False)
def frontend_admin_dashboard():
    return RedirectResponse(f"{FRONTEND_URL}/admin/dashboard", status_code=307)

@app.get("/admin/organizer", include_in_schema=False)
def frontend_admin_organizer():
    return RedirectResponse(f"{FRONTEND_URL}/admin/organizer", status_code=307)

@app.get("/admin/results", include_in_schema=False)
def frontend_admin_results():
    return RedirectResponse(f"{FRONTEND_URL}/admin/results", status_code=307)


@app.post('/api/developer/login')
def developer_login(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    annual_cleanup_if_needed(db)
    ident = normalized_login_identifier(email)
    identifiers = login_identifiers(ident, request_client_ip(request))
    attempt_counts = reserve_login_attempt(db, 'developer', identifiers)


    email_matches = hmac.compare_digest(
        ident.encode('utf-8'),
        DEVELOPER_EMAIL.encode('utf-8'),
    )
    password_matches = hmac.compare_digest(
        password.encode('utf-8'),
        DEVELOPER_PASSWORD.encode('utf-8'),
    )
    if not email_matches or not password_matches:
        reject_failed_login(attempt_counts)
    clear_failed_logins(db, 'developer', identifiers)
    r = JSONResponse({'ok': True, 'role': 'developer', 'email': DEVELOPER_EMAIL})
    r.set_cookie('developer_session', create_session('developer', 'developer'), httponly=True, samesite='strict', secure=COOKIE_SECURE, max_age=28800)
    return r

@app.get('/api/developer/me')
def developer_me(_=Depends(require_developer)):
    return JSONResponse({'ok': True, 'role': 'developer', 'email': DEVELOPER_EMAIL})

@app.get('/api/developer/majors')
def dev_majors(_=Depends(require_developer), db: Session=Depends(get_db)):
    rows = db.query(Major).filter(Major.major_id != 0).order_by(Major.major_id).all()
    return JSONResponse({'majors': [{'major_id': major.major_id, 'major': major.major} for major in rows]})

@app.post('/api/developer/majors')
def dev_add_major(
    major: str = Form(...),
    _ = Depends(require_developer),
    db: Session = Depends(get_db),
):
    name = major.strip()
    if not name:
        raise HTTPException(400, 'Major name is required')
    if db.query(Major).filter(func.lower(Major.major) == name.lower()).first():
        raise_known_conflict(
            code="major_conflict",
            message="Major already exists",
            resource="major",
            constraint="majors.major",
            fields={"major": name},
        )
    row = Major(major=name)
    try:
        db.add(row)
        db.flush()
        year = datetime.now().year
        db.add(Completion(major_id=row.major_id, status=0, year=year))
        ensure_default_titles(db, row.major_id)
        db.commit()
        db.refresh(row)
    except IntegrityError as exc:
        db.rollback()
        raise_database_conflict(
            exc,
            code="major_conflict",
            message="The major could not be created because its name or generated festival state conflicts with existing data.",
            resource="major",
            fields={"major": name},
        )
    return JSONResponse(status_code=201, content={'ok': True, 'major_id': row.major_id, 'major': row.major})

@app.get('/api/developer/accounts')
def dev_accounts(_=Depends(require_developer), db: Session=Depends(get_db)):
    majors = {major.major_id: major.major for major in db.query(Major).all()}
    rows = db.query(Admin).order_by(Admin.admin_id).all()
    return JSONResponse({'accounts': [{'admin_id': admin.admin_id, 'admin_name': admin.admin_name, 'admin_role': admin.admin_role, 'major_id': admin.major_id, 'major': majors.get(admin.major_id), 'admin_gmail': admin.admin_gmail} for admin in rows]})

@app.post('/api/developer/accounts')
def dev_add_account(
    admin_name: str = Form(...),
    admin_role: str = Form(...),
    gmail: str = Form(...),
    password: str = Form(...),
    major_id: int | None = Form(None),
    _ = Depends(require_developer),
    db: Session = Depends(get_db),
):
    role = admin_role.strip().lower()
    if role not in {'major_admin', 'whole_admin'}:
        raise HTTPException(400, 'Invalid admin_role')
    if role == 'major_admin':
        if major_id is None or not db.get(Major, major_id):
            raise HTTPException(400, 'major_id is required for major_admin')
        
        lock_major_rows(db, [major_id])
        if db.query(Admin).filter(Admin.major_id == major_id).first():
            raise_known_conflict(
                code="admin_major_conflict",
                message="This Major already has an admin",
                resource="admin_account",
                constraint="admin_table.major_id",
                fields={"major_id": major_id},
            )
    else:
        major_id = 0

        (
            db.query(Completion)
            .filter(Completion.major_id == 0)
            .with_for_update()
            .first()
        )
    if role == 'whole_admin' and db.query(Admin).filter(Admin.admin_role == role).first():
        raise_known_conflict(
            code="admin_role_conflict",
            message=f"{role} already exists",
            resource="admin_account",
            fields={"admin_role": role},
        )
    email = gmail.strip().lower()
    if db.query(Admin).filter(Admin.admin_gmail == email).first():
        raise_known_conflict(
            code="admin_email_conflict",
            message="Email already exists",
            resource="admin_account",
            constraint="admin_table.admin_gmail",
            fields={"gmail": email},
        )
    if len(password) < 8:
        raise HTTPException(400, 'Password must contain at least 8 characters')
    a = Admin(admin_name=admin_name.strip(), major_id=major_id, admin_role=role, admin_gmail=email, admin_pswd=hash_password(password))
    try:
        db.add(a)
        db.commit()
        db.refresh(a)
    except IntegrityError as exc:
        db.rollback()
        raise_database_conflict(
            exc,
            code="admin_account_conflict",
            message="The admin account conflicts with an existing Gmail address, Major assignment, or unique role assignment.",
            resource="admin_account",
            fields={"gmail": email, "major_id": major_id, "admin_role": role},
        )
    return JSONResponse(status_code=201, content={'ok': True, 'admin_id': a.admin_id, 'admin_role': a.admin_role})

@app.put('/api/developer/accounts/{admin_id}')
def dev_update_account(
    admin_id: int,
    admin_name: str = Form(...),
    gmail: str = Form(...),
    password: str = Form(''),
    _ = Depends(require_developer),
    db: Session = Depends(get_db),
):
    admin = db.get(Admin, admin_id)
    if not admin:
        raise HTTPException(404, 'Account not found')

    new_name = admin_name.strip()
    new_email = gmail.strip().lower()

    duplicate_email = db.query(Admin).filter(
        Admin.admin_gmail == new_email,
        Admin.admin_id != admin_id,
    ).first()
    if duplicate_email:
        raise_known_conflict(
            code="admin_email_conflict",
            message="Email already exists",
            resource="admin_account",
            constraint="admin_table.admin_gmail",
            fields={"gmail": new_email, "admin_id": admin_id},
        )

    email_changed = new_email != admin.admin_gmail
    password_changed = bool(password)

    if password_changed:
        if len(password) < 8:
            raise HTTPException(400, 'Password must contain at least 8 characters')

        changed_today = db.query(PasswordChangeLog).filter(
            PasswordChangeLog.admin_id == admin_id,
            PasswordChangeLog.change_date == date.today(),
        ).first()
        if changed_today:
            raise HTTPException(
                429,
                'This admin password has already been changed today',
            )

        admin.admin_pswd = hash_password(password)
        db.add(
            PasswordChangeLog(
                admin_id=admin_id,
                change_date=date.today(),
            )
        )

    admin.admin_name = new_name
    admin.admin_gmail = new_email

    sessions_revoked = email_changed or password_changed
    if sessions_revoked:
        admin.session_version += 1

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise_database_conflict(
            exc,
            code="admin_account_update_conflict",
            message="The account update conflicts with an existing Gmail address or today's password-change record.",
            resource="admin_account",
            fields={"admin_id": admin_id, "gmail": new_email},
        )

    return JSONResponse({
        'ok': True,
        'password_changed': password_changed,
        'email_changed': email_changed,
        'sessions_revoked': sessions_revoked,
    })



@app.delete('/api/developer/accounts/{admin_id}')
def dev_delete_account(
    admin_id: int,
    _ = Depends(require_developer),
    db: Session = Depends(get_db),
):
    admin = db.get(Admin, admin_id)
    if not admin:
        raise HTTPException(404, 'Account not found')
    if db.query(Candidate).filter(Candidate.admin_id == admin_id).first():
        raise HTTPException(409, 'This admin still owns candidate records')
    db.delete(admin)
    db.commit()
    return JSONResponse({'ok': True, 'deleted_admin_id': admin_id, 'sessions_revoked': True})

@app.delete('/api/developer/majors/{major_id}')
def dev_delete_major(
    major_id: int,
    _ = Depends(require_developer),
    db: Session = Depends(get_db),
):
    major = db.get(Major, major_id)
    if not major:
        raise HTTPException(404, 'Major not found')
    if db.query(Admin).filter(Admin.major_id == major_id).first():
        raise HTTPException(409, 'Delete the major admin account first')
    if db.query(Candidate).filter(Candidate.major_id == major_id).first():
        raise HTTPException(409, 'This major still has candidate records')
    if db.query(CombinedFestivalMajor).filter(CombinedFestivalMajor.major_id == major_id).first():
        raise HTTPException(409, 'Remove this major from its combined festival first')
    completion = db.query(Completion).filter(Completion.major_id == major_id).first()
    if completion and completion.status != 0:
        raise HTTPException(409, 'A started or completed major cannot be deleted')
    db.query(Completion).filter(Completion.major_id == major_id).delete(synchronize_session=False)
    db.delete(major)
    db.commit()
    return JSONResponse({'ok': True, 'deleted_major_id': major_id})





@app.post('/api/admin/login')
def admin_login(
    request: Request,
    gmail: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    annual_cleanup_if_needed(db)
    ident = normalized_login_identifier(gmail)
    identifiers = login_identifiers(ident, request_client_ip(request))
    attempt_counts = reserve_login_attempt(db, 'admin', identifiers)
    a = db.query(Admin).filter(Admin.admin_gmail == ident).first()
    if not a or not verify_password(password, a.admin_pswd):
        reject_failed_login(attempt_counts)
    clear_failed_logins(db, 'admin', identifiers)
    dashboard = '/organizer' if a.admin_role in {'major_admin', 'whole_admin'} else '/admin'
    r = JSONResponse({'admin_name': a.admin_name, 'admin_role': a.admin_role, 'major_id': a.major_id, 'dashboard': dashboard})
    r.set_cookie('admin_session', create_session('admin', a.admin_id, a.session_version), httponly=True, samesite='strict', secure=COOKIE_SECURE, max_age=28800)
    return r

@app.get('/api/admin/me')
def admin_me(a: Admin=Depends(current_admin), db: Session=Depends(get_db)):
    m = db.get(Major, a.major_id) if a.major_id else None
    return JSONResponse({'admin_name': a.admin_name, 'admin_gmail': a.admin_gmail, 'admin_role': a.admin_role, 'major_id': a.major_id, 'major': m.major if m else None, 'can_organize': a.admin_role in {'major_admin', 'whole_admin'}})

@app.get('/api/admin/candidate-management-status')
def candidate_management_status(
    a: Admin = Depends(require_major_admin),
    db: Session = Depends(get_db),
):
    locked = candidate_management_locked(db, a.major_id)
    return JSONResponse({'major_id': a.major_id, 'locked': locked, 'message': 'Candidate management is locked because this major has already started or completed a festival' if locked else 'Candidate management is available'})


@app.get('/api/admin/combine/available-majors')
def admin_combine_available_majors(
    a: Admin = Depends(require_major_admin),
    db: Session = Depends(get_db),
):
    if candidate_management_locked(db, a.major_id):
        raise HTTPException(409, 'Your major is already running or completed')

    own_membership = db.query(CombinedFestivalMajor).filter(
        CombinedFestivalMajor.major_id == a.major_id
    ).first()
    current_member_ids = set()
    if own_membership:
        current_member_ids = {
            row[0] for row in db.query(CombinedFestivalMajor.major_id).filter(
                CombinedFestivalMajor.combined_id == own_membership.combined_id
            ).all()
        }

    rows = []
    for major in db.query(Major).filter(Major.major_id != 0).order_by(Major.major).all():
        if major.major_id == a.major_id:
            continue
        if candidate_management_locked(db, major.major_id):
            continue
        existing_membership = db.query(CombinedFestivalMajor).filter(
            CombinedFestivalMajor.major_id == major.major_id
        ).first()
        if existing_membership and major.major_id not in current_member_ids:
            continue
        pending_request = (
            db.query(CombineRequestMajor)
            .join(CombineRequest, CombineRequest.request_id == CombineRequestMajor.request_id)
            .filter(
                CombineRequestMajor.major_id == major.major_id,
                CombineRequest.status == 'pending',
            )
            .first()
        )
        if pending_request:
            continue
        rows.append({'major_id': major.major_id, 'major': major.major})

    return JSONResponse({
        'own_major': {'major_id': a.major_id, 'major': db.get(Major, a.major_id).major},
        'available_majors': rows,
    })


@app.get('/api/admin/combine')
def admin_combined_festivals(
    a: Admin = Depends(require_major_admin),
    db: Session = Depends(get_db),
):
    major_names = {m.major_id: m.major for m in db.query(Major).all()}
    result = []

    memberships = db.query(CombinedFestivalMajor).filter(
        CombinedFestivalMajor.major_id == a.major_id
    ).all()
    for membership in memberships:
        combined = db.get(CombinedFestival, membership.combined_id)
        member_ids = [row[0] for row in db.query(CombinedFestivalMajor.major_id).filter(
            CombinedFestivalMajor.combined_id == combined.combined_id
        ).all()]
        status = festival_context(db, combined_target_key(combined.combined_id))['status']
        result.append({
            'combined_id': combined.combined_id,
            'target_id': combined_target_key(combined.combined_id),
            'combined_name': combined.combined_name,
            'major_ids': member_ids,
            'majors': [major_names.get(mid) for mid in member_ids],
            'status': status,
            'editable': status == 0,
        })

    request_ids = [row[0] for row in db.query(CombineRequestMajor.request_id).filter(
        CombineRequestMajor.major_id == a.major_id
    ).all()]
    requests = []
    if request_ids:
        for req in db.query(CombineRequest).filter(CombineRequest.request_id.in_(request_ids)).order_by(CombineRequest.request_id.desc()).all():
            members = db.query(CombineRequestMajor).filter(CombineRequestMajor.request_id == req.request_id).all()
            requests.append({
                'request_id': req.request_id,
                'combined_name': req.combined_name,
                'request_type': req.request_type,
                'status': req.status,
                'requester_admin_id': req.requester_admin_id,
                'is_requester': req.requester_admin_id == a.admin_id,
                'member_major_ids': [m.major_id for m in members],
                'majors': [major_names.get(m.major_id) for m in members],
                'my_response': next((m.response for m in members if m.major_id == a.major_id), None),
                'rejection_message': req.rejection_message,
            })

    return JSONResponse({'combined_festivals': result, 'requests': requests})



@app.post('/api/admin/combine')
def admin_create_combined_festival(
    combined_name: str = Form(...),
    major_ids: list[int] = Form(...),
    a: Admin = Depends(require_major_admin),
    db: Session = Depends(get_db),
):
    name = combined_name.strip()
    if not name:
        raise HTTPException(400, 'Combined festival name is required')
    selected = list(dict.fromkeys([a.major_id, *major_ids]))
    lock_major_rows(db, selected)

    if len(selected) < 2:
        raise HTTPException(400, 'Select at least one other major')
    if candidate_management_locked(db, a.major_id):
        raise HTTPException(409, 'Your major is already running or completed')
    if db.query(CombinedFestivalMajor).filter(CombinedFestivalMajor.major_id == a.major_id).first():
        raise HTTPException(409, 'Your major is already in a combined festival')
    if db.query(CombineRequestMajor).join(CombineRequest, CombineRequest.request_id == CombineRequestMajor.request_id).filter(CombineRequestMajor.major_id == a.major_id, CombineRequest.status == 'pending').first():
        raise HTTPException(409, 'Your major already has a pending combination request')

    for major_id in selected:
        if not db.get(Major, major_id):
            raise HTTPException(400, 'One or more selected majors do not exist')
        if candidate_management_locked(db, major_id):
            raise HTTPException(409, 'One of the selected majors is already running or completed')
        if db.query(CombinedFestivalMajor).filter(CombinedFestivalMajor.major_id == major_id).first():
            raise HTTPException(409, 'One selected major is already in a combined festival')

    request = CombineRequest(
        requester_admin_id=a.admin_id,
        combined_name=name,
        request_type='create',
        status='pending',
    )
    try:
        db.add(request)
        db.flush()

        for major_id in selected:
            db.add(CombineRequestMajor(
                request_id=request.request_id,
                major_id=major_id,
                response='accepted' if major_id == a.major_id else 'pending',
            ))

        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise_database_conflict(
            exc,
            code="combine_request_conflict",
            message="The combination request conflicts with current Combined Festival or membership data. Refresh the dashboard and try again.",
            resource="combine_request",
            fields={"combined_name": name, "major_ids": selected},
        )
    return JSONResponse(status_code=201, content={
        'ok': True,
        'request_id': request.request_id,
        'status': 'pending',
        'message': 'Combination request sent to the selected major admins.',
    })



@app.put('/api/admin/combine/{combined_id}')
def admin_edit_combined_festival(
    combined_id: int,
    combined_name: str = Form(...),
    major_ids: list[int] = Form(...),
    a: Admin = Depends(require_major_admin),
    db: Session = Depends(get_db),
):
    combined = db.get(CombinedFestival, combined_id)
    if not combined:
        raise HTTPException(404, 'Combined festival not found')

    member_ids = [row[0] for row in db.query(CombinedFestivalMajor.major_id).filter(
        CombinedFestivalMajor.combined_id == combined_id
    ).all()]
    if a.major_id not in member_ids:
        raise HTTPException(403, 'You can edit only your combined festival')

    target_id = combined_target_key(combined_id)
    if festival_context(db, target_id)['status'] != 0:
        raise HTTPException(409, 'A running or completed combined festival cannot be edited')
    if db.query(Voter).filter(Voter.major_id == target_id).first():
        raise HTTPException(409, 'Delete generated Combined Festival QR voters before editing')

    name = combined_name.strip()
    if not name:
        raise HTTPException(400, 'Combined festival name is required')

    selected = list(dict.fromkeys([a.major_id, *major_ids]))
    lock_major_rows(db, selected)
    if len(selected) < 2:
        raise HTTPException(400, 'A combined festival needs at least two majors')

    for major_id in selected:
        if not db.get(Major, major_id):
            raise HTTPException(400, 'One or more selected majors do not exist')
        if candidate_management_locked(db, major_id):
            membership = db.query(CombinedFestivalMajor).filter(
                CombinedFestivalMajor.major_id == major_id
            ).first()
            if not membership or membership.combined_id != combined_id:
                raise HTTPException(409, 'One of the selected majors is already running or completed')
        other_membership = db.query(CombinedFestivalMajor).filter(
            CombinedFestivalMajor.major_id == major_id,
            CombinedFestivalMajor.combined_id != combined_id,
        ).first()
        if other_membership:
            raise HTTPException(409, 'One selected major is already in another combined festival')

    request = CombineRequest(
        requester_admin_id=a.admin_id,
        combined_id=combined_id,
        combined_name=name,
        request_type='edit',
        status='pending',
    )
    try:
        db.add(request)
        db.flush()

        for major_id in selected:
            if not db.get(Major, major_id):
                raise HTTPException(400, 'One or more selected majors do not exist')
            db.add(CombineRequestMajor(
                request_id=request.request_id,
                major_id=major_id,
                response='accepted' if major_id == a.major_id else 'pending',
            ))

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise_database_conflict(
            exc,
            code="combine_request_conflict",
            message="The Combined Festival edit request conflicts with current membership data. Refresh and try again.",
            resource="combine_request",
            fields={"combined_id": combined_id, "major_ids": selected},
        )
    return JSONResponse({'ok': True, 'request_id': request.request_id, 'status': 'pending'})



@app.put("/api/admin/combine/requests/{request_id}/response")
def respond_combine_request(
    request_id: int,
    response: str=Form(...),
    message: str=Form(""),
    a: Admin=Depends(require_major_admin),
    db: Session=Depends(get_db),
):
    try:
        req = (
            db.query(CombineRequest)
            .filter(CombineRequest.request_id == request_id)
            .with_for_update()
            .first()
        )

        if not req or req.status != "pending":
            raise HTTPException(
                404,
                "Pending combination request not found",
            )

        member = (
            db.query(CombineRequestMajor)
            .filter(
                CombineRequestMajor.request_id == request_id,
                CombineRequestMajor.major_id == a.major_id,
            )
            .with_for_update()
            .first()
        )

        if not member:
            raise HTTPException(
                403,
                "This request was not sent to your major",
            )

        if req.requester_admin_id == a.admin_id:
            raise HTTPException(
                400,
                "Requester cannot respond to their own request",
            )

        answer = response.strip().lower()

        if answer not in {"accepted", "rejected"}:
            raise HTTPException(
                400,
                "response must be accepted or rejected",
            )

        if member.response != "pending":
            raise HTTPException(
                409,
                "Your major has already responded to this request",
            )

        member.response = answer

        if answer == "rejected":
            req.status = "rejected"
            req.rejected_by_major_id = a.major_id
            req.rejection_message = (
                message.strip()
                or "Combination request rejected."
            )
            db.commit()

            return JSONResponse(
                {
                    "ok": True,
                    "status": "rejected",
                    "combined_created": False,
                }
            )

        db.flush()

        pending_count = (
            db.query(CombineRequestMajor)
            .filter(
                CombineRequestMajor.request_id == request_id,
                CombineRequestMajor.response == "pending",
            )
            .count()
        )

        if pending_count > 0:
            db.commit()

            return JSONResponse(
                {
                    "ok": True,
                    "status": "pending",
                    "combined_created": False,
                    "pending_responses": pending_count,
                    "message": (
                        "Your acceptance was saved. "
                        "Waiting for the remaining major admins."
                    ),
                }
            )

        selected = [
            row[0]
            for row in (
                db.query(CombineRequestMajor.major_id)
                .filter(
                    CombineRequestMajor.request_id == request_id
                )
                .all()
            )
        ]

        lock_major_rows(db, selected)

        for major_id in selected:
            if not db.get(Major, major_id):
                raise HTTPException(409, 'One selected major no longer exists')
            memberships = db.query(CombinedFestivalMajor).filter(
                CombinedFestivalMajor.major_id == major_id
            ).all()
            if req.request_type == 'create':
                if memberships:
                    raise HTTPException(409, 'One selected major is already in a combined festival')
            else:
                if any(m.combined_id != req.combined_id for m in memberships):
                    raise HTTPException(409, 'One selected major is already in another combined festival')

        conflicts = combination_number_conflicts(db, selected)

        if conflicts:
            first = conflicts[0]
            names = ", ".join(
                f"{item['major']}: {item['c_name']}"
                for item in first['candidates']
            )
            raise HTTPException(
                409,
                (
                    f"Cannot combine these majors. "
                    f"Candidate number {first['candidate_number']} "
                    f"is duplicated across majors, even across different genders: "
                    f"{names}. Change one candidate number first."
                ),
            )

        if req.request_type == "create":
            combined = CombinedFestival(
                combined_name=req.combined_name,
                requester_admin_id=req.requester_admin_id,
            )
            db.add(combined)
            db.flush()

            req.combined_id = combined.combined_id

            for major_id in selected:
                db.add(
                    CombinedFestivalMajor(
                        combined_id=combined.combined_id,
                        major_id=major_id,
                    )
                )

            target_id = combined_target_key(
                combined.combined_id
            )

            db.add(
                Completion(
                    major_id=target_id,
                    status=0,
                    year=datetime.now().year,
                )
            )

        else:
            combined = db.get(
                CombinedFestival,
                req.combined_id,
            )

            if not combined:
                raise HTTPException(
                    404,
                    "Combined festival to edit no longer exists",
                )

            combined.combined_name = req.combined_name

            (
                db.query(CombinedFestivalMajor)
                .filter(
                    CombinedFestivalMajor.combined_id
                    == combined.combined_id
                )
                .delete(synchronize_session=False)
            )

            for major_id in selected:
                db.add(
                    CombinedFestivalMajor(
                        combined_id=combined.combined_id,
                        major_id=major_id,
                    )
                )

        req.status = "accepted"
        db.flush()
        combined_id = req.combined_id
        combined_name = req.combined_name
        db.commit()

        return JSONResponse(
            {
                "ok": True,
                "status": "accepted",
                "combined_created": True,
                "combined_id": combined_id,
                "target_id": combined_target_key(combined_id),
                "combined_name": combined_name,
                "major_ids": selected,
            }
        )

    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise_database_conflict(
            exc,
            code="combined_festival_conflict",
            message="The Combined Festival conflicts with an existing festival name or Major membership. Refresh and try again.",
            resource="combined_festival",
            fields={"request_id": request_id},
        )
    except Exception:
        db.rollback()
        raise




@app.get('/api/admin/combined-candidates')
def admin_combined_candidates(
    a: Admin = Depends(require_major_admin),
    db: Session = Depends(get_db),
):
    membership = db.query(CombinedFestivalMajor).filter(
        CombinedFestivalMajor.major_id == a.major_id
    ).first()
    if not membership:
        return JSONResponse({'combined': None, 'candidates': []})

    combined = db.get(CombinedFestival, membership.combined_id)
    target_id = combined_target_key(combined.combined_id)
    names = {m.major_id: m.major for m in db.query(Major).all()}
    rows = candidate_query(db, target_id).order_by(Candidate.major_id, Candidate.c_gender, Candidate.c_number).all()
    return JSONResponse({
        'combined': {'combined_id': combined.combined_id, 'name': combined.combined_name},
        'candidates': [{
            'c_id': c.c_id,
            'c_name': c.c_name,
            'c_number': c.c_number,
            'c_photo': c.c_photo,
            'c_gender': c.c_gender,
            'major_id': c.major_id,
            'major': names.get(c.major_id),
        } for c in rows],
    })

@app.get('/api/admin/titles')
def admin_titles(
    a: Admin = Depends(require_major_admin),
    db: Session = Depends(get_db),
):

    locked = candidate_management_locked(db, a.major_id)

    major_ids = admin_title_major_ids(db, a.major_id)

    rows = (
        db.query(Title)
        .filter(Title.major_id.in_(major_ids))
        .order_by(Title.title_id)
        .all()
    )


    if len(major_ids) > 1:
        unique_rows = []
        seen_names = set()
        for row in rows:
            key = row.title.strip().casefold()
            if key in seen_names:
                continue
            seen_names.add(key)
            unique_rows.append(row)
        rows = unique_rows

    return JSONResponse({
        'locked': locked,
        'titles': [
            {
                'title_id': t.title_id,
                'title': t.title,
                'group': title_group(t.title_id)
            }
            for t in rows
        ]
    })

@app.post('/api/admin/titles')
def admin_add_title(
    title: str = Form(...),
    group: str = Form(...),
    a: Admin = Depends(require_major_admin),
    db: Session = Depends(get_db),
):
    if candidate_management_locked(db, a.major_id):
        raise HTTPException(
            409,
            'Titles are locked after this festival has started or completed'
        )

    name = title.strip()
    if not name:
        raise HTTPException(400, 'Title name is required')

    major_ids = admin_title_major_ids(db, a.major_id)
    lock_major_rows(db, major_ids)

    if db.query(Title).filter(
        Title.major_id.in_(major_ids),
        func.lower(Title.title) == name.lower()
    ).first():
        raise_known_conflict(
            code="title_conflict",
            message="Title already exists",
            resource="title",
            constraint="uq_title_major",
            fields={"title": name},
        )

    gender = group.strip().lower()

    if gender not in {'boy', 'girl'}:
        raise HTTPException(
            400,
            'group must be boy or girl'
        )

    max_id = db.query(
        func.max(Title.title_id)
    ).scalar() or 0

    new_id = max_id + 1

    if gender == 'boy' and new_id % 2 == 0:
        new_id += 1

    if gender == 'girl' and new_id % 2 == 1:
        new_id += 1

    try:
        db.add(
            Title(
                title_id=new_id,
                title=name,
                major_id=a.major_id
            )
        )

        db.commit()

    except IntegrityError as exc:
        db.rollback()

        raise_database_conflict(
            exc,
            code="title_conflict",
            message="The title conflicts with an existing title or another title was created at the same time. Refresh and try again.",
            resource="title",
            fields={
                "title": name,
                "group": gender,
                "title_id": new_id,
            },
        )

    return JSONResponse(
        status_code=201,
        content={
            'ok': True,
            'title_id': new_id,
            'title': name,
            'group': gender,
        }
    )


@app.delete('/api/admin/titles/{title_id}')
def admin_delete_title(
    title_id: int,
    a: Admin = Depends(require_major_admin),
    db: Session = Depends(get_db),
):
    if candidate_management_locked(db, a.major_id):
        raise HTTPException(
            409,
            'Titles are locked after this festival has started or completed'
        )

    major_ids = admin_title_major_ids(db, a.major_id)

    title = (
        db.query(Title)
        .filter(
            Title.title_id == title_id,
            Title.major_id.in_(major_ids)
        )
        .first()
    )

    if not title:
        raise HTTPException(
            404,
            'Title not found'
        )

    if (
        db.query(Vote).filter(Vote.title_id == title_id).first()
        or db.query(MajorSelection).filter(
            MajorSelection.title_id == title_id
        ).first()
        or db.query(WholeSelection).filter(
            WholeSelection.title_id == title_id
        ).first()
    ):
        raise HTTPException(
            409,
            'Title is already referenced by voting data'
        )

    db.delete(title)
    db.commit()


@app.post('/api/voter/qr/verify')
def verify_voter_qr(
    payload: QRVerifyRequest,
    db: Session=Depends(get_db),
):
    public_id = payload.public_id.strip()
    secret = payload.secret.strip()

    if not public_id or not secret:
        return JSONResponse(
            status_code=400,
            content={
                'success': False,
                'valid': False,
                'reason': 'missing_credentials',
                'detail': 'QR credentials are required',
            },
        )

    row = (
        db.query(Voter)
        .filter(Voter.token.like(f'{public_id}$%'))
        .first()
    )

    if not row:
        return JSONResponse(
            status_code=403,
            content={
                'success': False,
                'valid': False,
                'reason': 'qr_not_found',
                'detail': (
                    'This QR code is not registered. '
                    'Generate/download a current QR code and try again.'
                ),
            },
        )

    if not row.active:
        return JSONResponse(
            status_code=403,
            content={
                'success': False,
                'valid': False,
                'reason': 'qr_inactive',
                'detail': 'This QR code is inactive',
            },
        )

    if not verify_qr_token(
        public_id,
        secret,
        row.token,
    ):
        return JSONResponse(
            status_code=403,
            content={
                'success': False,
                'valid': False,
                'reason': 'secret_mismatch',
                'detail': (
                    'The QR secret does not match this voter. '
                    'Use the current generated QR code.'
                ),
            },
        )

    context = festival_context(db, row.major_id)

    if not context['voting_open']:

        return JSONResponse(
            status_code=403,
            content={
                'success': False,
                'valid': True,
                'reason': 'festival_not_running',
                'detail': (
                    f"{context['name']} voting is not currently open"
                ),
                'festival_target_id': row.major_id,
                'festival': context['name'],
            },
        )

    redirect = f'/vote?voter_id={row.voter_id}'

    response = JSONResponse({
        'success': True,
        'valid': True,
        'reason': 'verified',
        'redirect': redirect,
        'voter_id': row.voter_id,
        'festival_target_id': row.major_id,
        'festival': context['name'],
    })
    response.set_cookie(
        voter_cookie_name(row.voter_id),
        create_session('voter', row.voter_id),
        httponly=True,
        samesite='strict',
        secure=COOKIE_SECURE,
        max_age=43200,
    )
    return response




@app.get('/api/voter/session')
def voter_session_status(
    request: Request,
    voter_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    voter = voter_from_request(
        request,
        db,
        voter_id=voter_id,
    )

    if not voter:
        return JSONResponse(
            status_code=401,
            content={
                'success': False,
                'valid': False,
                'detail': 'Invalid or expired voter QR session',
            },
        )

    context = festival_context(db, voter.major_id)

    if not context['voting_open']:
        return JSONResponse(
            status_code=403,
            content={
                'success': False,
                'valid': False,
                'detail': (
                    'This voter session is not currently allowed to vote'
                ),
            },
        )

    return JSONResponse({
        'success': True,
        'valid': True,
        'voter_id': voter.voter_id,
        'festival_target_id': voter.major_id,
        'festival': context['name'],
        'submitted': bool(voter.submitted),
    })




@app.get('/api/voter/ballot')
def ballot(
    v: Voter=Depends(current_voter),
    db: Session=Depends(get_db),
):
    context = festival_context(db, v.major_id)

    if not context['voting_open']:
        raise HTTPException(
            403,
            'Voting is not open for this QR',
        )

    vote_rows = (
        db.query(Vote)
        .filter(Vote.voter_id == v.voter_id)
        .all()
    )
    votes = {
        vote.title_id: vote.c_id
        for vote in vote_rows
    }

    title_rows = current_titles(db, v.major_id)
    titles = [
        {
            'title_id': title.title_id,
            'title': title.title,
            'group': title_group(title.title_id),
            'selected_candidate_id': votes.get(
                title.title_id,
                0,
            ),
        }
        for title in title_rows
    ]

    major_names = {
        major.major_id: major.major
        for major in db.query(Major).all()
    }

    candidates = []
    candidate_map = {}

    for candidate in (
        candidate_query(db, v.major_id)
        .order_by(
            Candidate.c_gender,
            Candidate.c_number,
        )
        .all()
    ):
        candidate_number = candidate.c_number

        if v.major_id == 0:
            candidate_number = (
                db.query(WholeCandidate.c_w_number)
                .filter(
                    WholeCandidate.c_id == candidate.c_id
                )
                .scalar()
            )

        item = {
            'c_id': candidate.c_id,
            'c_name': candidate.c_name,
            'c_number': candidate_number,
            'c_photo': candidate.c_photo,
            'major_id': candidate.major_id,
            'major': major_names.get(candidate.major_id),
            'c_gender': candidate.c_gender,
        }
        candidates.append(item)
        candidate_map[candidate.c_id] = item

    submitted_votes = []

    if v.submitted:
        title_map = {
            title.title_id: title.title
            for title in title_rows
        }

        for vote in vote_rows:
            if vote.c_id <= 0:
                continue

            candidate = candidate_map.get(vote.c_id)

            if not candidate:
                continue

            submitted_votes.append({
                'title_id': vote.title_id,
                'title': title_map.get(
                    vote.title_id,
                    str(vote.title_id),
                ),
                'candidate_id': candidate['c_id'],
                'candidate_number': candidate['c_number'],
                'candidate_name': candidate['c_name'],
                'major': candidate['major'],
            })

        submitted_votes.sort(
            key=lambda item: item['title_id']
        )

    return JSONResponse({
        'success': True,
        'valid': True,
        'voter_id': v.voter_id,
        'festival_target_id': v.major_id,
        'festival': context['name'],
        'titles': titles,
        'candidates': candidates,
        'complete': bool(v.voted),
        'submitted': bool(v.submitted),
        'submitted_votes': submitted_votes,
    })


@app.post('/api/voter/submit')
def submit_ballot(
    payload: BallotSubmitRequest,
    v: Voter=Depends(current_voter),
    db: Session=Depends(get_db),
):
    try:

        completion = (
            db.query(Completion)
            .filter(Completion.major_id == v.major_id)
            .with_for_update(read=True)
            .one_or_none()
        )
        if not completion or completion.year != datetime.now().year or completion.status != 1:
            raise HTTPException(409, 'Voting is not open')

        locked = (
            db.query(Voter)
            .filter(Voter.voter_id == v.voter_id, Voter.major_id == v.major_id)
            .with_for_update()
            .one_or_none()
        )
        if not locked or not locked.active:
            raise HTTPException(401, 'Invalid or expired voter QR session')
        if locked.submitted:
            raise HTTPException(409, 'Your ballot has already been submitted')

        titles = current_titles(db, locked.major_id)
        title_map = {row.title_id: row for row in titles}

        supplied = {}
        for item in payload.selections:
            if item.title_id in supplied:
                raise HTTPException(400, f'Duplicate title {item.title_id} in ballot')
            if item.title_id not in title_map:
                raise HTTPException(400, f'Title {item.title_id} is not active')
            supplied[item.title_id] = item.candidate_id

        if len(supplied) != len(title_map) or set(supplied) != set(title_map):
            raise HTTPException(400, 'One candidate is required for every title before submitting')
        if any(candidate_id <= 0 for candidate_id in supplied.values()):
            raise HTTPException(400, 'One candidate is required for every title before submitting')

        used_candidates = set()
        for title_id, candidate_id in supplied.items():
            if candidate_id in used_candidates:
                raise HTTPException(
                    400,
                    'The same candidate cannot receive multiple titles from one voter',
                )
            candidate = candidate_allowed(db, locked.major_id, candidate_id)
            if not candidate or candidate.c_gender != title_group(title_id):
                raise HTTPException(
                    400,
                    f'Candidate {candidate_id} is not valid for title {title_id}',
                )
            used_candidates.add(candidate_id)

        existing_votes = (
            db.query(Vote)
            .filter(Vote.voter_id == locked.voter_id)
            .all()
        )
        existing_by_title = {row.title_id: row for row in existing_votes}

        for title_id, candidate_id in supplied.items():
            row = existing_by_title.get(title_id)
            if row is None:
                db.add(Vote(
                    voter_id=locked.voter_id,
                    c_id=candidate_id,
                    title_id=title_id,
                ))
            else:
                row.c_id = candidate_id

        valid_title_ids = set(supplied)
        for row in existing_votes:
            if row.title_id not in valid_title_ids:
                db.delete(row)

        locked.voted = bool(title_map) and set(supplied) == set(title_map)
        locked.submitted = True
        db.flush()
        db.commit()

        return JSONResponse({
            'success': True,
            'ok': True,
            'submitted': True,
            'message': 'Ballot submitted successfully. Your votes can no longer be edited.',
        })

    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise_database_conflict(
            exc,
            code="ballot_submission_conflict",
            message="The ballot conflicts with another request. Refresh and try again.",
            resource="ballot",
            fields={"voter_id": v.voter_id},
        )
    except (OperationalError, SQLAlchemyTimeoutError, DBAPIError):
        db.rollback()
        raise



@app.get('/api/admin/candidates')
def admin_candidates(a: Admin=Depends(require_major_admin), db: Session=Depends(get_db)):
    return JSONResponse([{'c_id': c.c_id, 'c_name': c.c_name, 'c_number': c.c_number, 'c_photo': c.c_photo, 'c_gender': c.c_gender} for c in db.query(Candidate).filter(Candidate.major_id == a.major_id).order_by(Candidate.c_gender, Candidate.c_number).all()])

@app.post('/api/admin/candidates')
def add_candidate(
    c_name: str=Form(...),
    c_number: int=Form(...),
    c_gender: str=Form(...),
    c_photo: UploadFile=File(...),
    a: Admin=Depends(require_major_admin),
    db: Session=Depends(get_db),
):
    if candidate_management_locked(db, a.major_id):
        raise HTTPException(
            409,
            'Candidate management is locked because this major has already started or completed a festival',
        )

    gender = c_gender.lower()

    if gender not in {'boy', 'girl'}:
        raise HTTPException(
            400,
            'c_gender must be boy or girl',
        )

    lock_candidate_number_scope(db, a.major_id)
    duplicate = candidate_number_conflict(
        db,
        a.major_id,
        gender,
        c_number,
    )

    if duplicate:
        other_major = db.get(Major, duplicate.major_id)
        raise_known_conflict(
            code="candidate_number_conflict",
            message=(
                f'Candidate number {c_number} '
                'is already used by '
                f'{duplicate.c_name} in '
                f'{other_major.major if other_major else "another combined major"}'
            ),
            resource="candidate",
            constraint="uq_candidate_number_major_gender",
            fields={
                "major_id": a.major_id,
                "candidate_number": c_number,
            },
        )

    photo_url = upload_candidate_photo(c_photo)
    candidate = Candidate(
        admin_id=a.admin_id,
        c_name=c_name.strip(),
        c_number=c_number,
        c_photo=photo_url,
        major_id=a.major_id,
        c_photo_type=c_photo.content_type,
        c_gender=gender,
    )
    try:
        db.add(candidate)
        db.commit()
        db.refresh(candidate)
    except IntegrityError as exc:
        db.rollback()
        if photo_url:
            delete_candidate_photo(photo_url)
        raise_database_conflict(
            exc,
            code="candidate_number_conflict",
            message=(
                f"Candidate number {c_number} was assigned by "
                "another request at the same time. Refresh the candidate list and choose another number."
            ),
            resource="candidate",
            fields={
                "major_id": a.major_id,
                "candidate_number": c_number,
            },
        )

    return JSONResponse(
        status_code=201,
        content={
            'ok': True,
            'c_id': candidate.c_id,
        },
    )


@app.put('/api/admin/candidates/{candidate_id}')
def edit_candidate(
    candidate_id: int,
    c_name: str=Form(...),
    c_number: int=Form(...),
    c_photo: UploadFile | None=File(None),
    a: Admin=Depends(require_major_admin),
    db: Session=Depends(get_db),
):
    if candidate_management_locked(db, a.major_id):
        raise HTTPException(
            409,
            'Candidate management is locked because this major has already started or completed a festival',
        )

    candidate = (
        db.query(Candidate)
        .filter(
            Candidate.c_id == candidate_id,
            Candidate.major_id == a.major_id,
        )
        .first()
    )

    if not candidate:
        raise HTTPException(404, 'Candidate not found')

    candidate_gender = candidate.c_gender
    lock_candidate_number_scope(db, a.major_id)
    duplicate = candidate_number_conflict(
        db,
        a.major_id,
        candidate_gender,
        c_number,
        exclude_candidate_id=candidate.c_id,
    )

    if duplicate:
        other_major = db.get(Major, duplicate.major_id)
        raise_known_conflict(
            code="candidate_number_conflict",
            message=(
                f'Candidate number {c_number} '
                'is already used by '
                f'{duplicate.c_name} in '
                f'{other_major.major if other_major else "another combined major"}'
            ),
            resource="candidate",
            constraint="uq_candidate_number_major_gender",
            fields={
                "candidate_id": candidate_id,
                "major_id": a.major_id,
                "candidate_number": c_number,
            },
        )

    candidate.c_name = c_name.strip()
    candidate.c_number = c_number

    old_photo = None
    new_photo = None
    if c_photo is not None and c_photo.filename:
        old_photo = candidate.c_photo
        new_photo = upload_candidate_photo(c_photo)
        candidate.c_photo = new_photo
        candidate.c_photo_type = c_photo.content_type

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if new_photo:
            delete_candidate_photo(new_photo)
        raise_database_conflict(
            exc,
            code="candidate_number_conflict",
            message=(
                f"Candidate number {c_number} was assigned by "
                "another request at the same time. Refresh the candidate list and choose another number."
            ),
            resource="candidate",
            fields={
                "candidate_id": candidate_id,
                "major_id": a.major_id,
                "candidate_number": c_number,
            },
        )

    if old_photo and new_photo:
        delete_candidate_photo(old_photo)

    return JSONResponse({
        'ok': True,
        'c_id': candidate.c_id,
        'c_name': candidate.c_name,
        'c_number': candidate.c_number,
        'c_photo': candidate.c_photo,
    })



@app.delete('/api/admin/candidates/{candidate_id}')
def delete_candidate(
    candidate_id: int,
    a: Admin = Depends(require_major_admin),
    db: Session = Depends(get_db),
):
    if candidate_management_locked(db, a.major_id):
        raise HTTPException(409, 'Candidate management is locked because this major has already started or completed a festival')
    candidate = db.query(Candidate).filter(Candidate.c_id == candidate_id, Candidate.major_id == a.major_id).first()
    if not candidate:
        raise HTTPException(404, 'Candidate not found')
    awarded = db.query(MajorSelection).filter(MajorSelection.c_id == candidate.c_id).first() or db.query(WholeSelection).filter(WholeSelection.c_id == candidate.c_id).first()
    if awarded:
        raise HTTPException(409, 'Awarded candidates cannot be deleted')
    old_photo = candidate.c_photo
    db.delete(candidate)
    db.commit()
    delete_candidate_photo(old_photo)
    return JSONResponse({'ok': True, 'deleted_candidate_id': candidate_id})

@app.get('/api/admin/whole-candidates')
def whole_candidates(
    a: Admin=Depends(require_whole_admin),
    db: Session=Depends(get_db),
):
    ready = major_readiness(db)

    if not ready['ready']:
        return JSONResponse({
            'ready': False,
            **ready,
        })

    year = datetime.now().year

    rows = (
        db.query(WholeCandidate, Candidate, Major)
        .join(
            Candidate,
            Candidate.c_id == WholeCandidate.c_id,
        )
        .join(
            Major,
            Major.major_id == Candidate.major_id,
        )
        .order_by(WholeCandidate.c_w_number)
        .all()
    )

    candidates = []

    for whole_candidate, candidate, major in rows:
        awards = (
            db.query(Title.title)
            .join(
                MajorSelection,
                MajorSelection.title_id == Title.title_id,
            )
            .filter(
                MajorSelection.c_id == candidate.c_id,
                MajorSelection.year == year,
            )
            .order_by(Title.title_id)
            .all()
        )

        candidates.append({
            'c_w_id': whole_candidate.c_w_id,
            'c_id': candidate.c_id,
            'c_name': candidate.c_name,
            'c_w_number': whole_candidate.c_w_number,
            'c_photo': candidate.c_photo,
            'belonging_major': major.major,
            'major': major.major,
            'c_gender': candidate.c_gender,
            'awarded_titles': [row[0] for row in awards],
        })

    return JSONResponse({
        'ready': True,
        'candidates': candidates,
    })


@app.get('/api/admin/whole-candidates/available')
def whole_available(
    a: Admin=Depends(require_whole_admin),
    db: Session=Depends(get_db),
):
    ready = major_readiness(db)

    if not ready['ready']:
        return JSONResponse({
            'ready': False,
            **ready,
        })

    year = datetime.now().year
    selected = {
        row[0]
        for row in db.query(WholeCandidate.c_id).all()
    }

    winner_rows = (
        db.query(Candidate, Major, MajorSelection, Title)
        .join(Major, Major.major_id == Candidate.major_id)
        .join(
            MajorSelection,
            MajorSelection.c_id == Candidate.c_id,
        )
        .join(
            Title,
            Title.title_id == MajorSelection.title_id,
        )
        .filter(MajorSelection.year == year)
        .order_by(
            Candidate.major_id,
            Candidate.c_gender,
            Candidate.c_number,
            Title.title_id,
        )
        .all()
    )

    grouped = {}

    for candidate, major, award, title in winner_rows:
        item = grouped.setdefault(
            candidate.c_id,
            {
                'c_id': candidate.c_id,
                'c_name': candidate.c_name,
                'c_number': candidate.c_number,
                'belonging_major': major.major,
                'major': major.major,
                'c_gender': candidate.c_gender,
                'awarded_titles': [],
                'selected': candidate.c_id in selected,
            },
        )
        item['awarded_titles'].append(title.title)

    return JSONResponse({
        'ready': True,
        'available_candidates': list(grouped.values()),
    })


@app.post('/api/admin/whole-candidates/{candidate_id}')
def whole_add(
    candidate_id: int,
    a: Admin = Depends(require_whole_admin),
    db: Session = Depends(get_db),
):
    if festival_context(db, 0)['status'] in {1, 2}:
        raise HTTPException(
            409,
            'Whole candidate management is locked because the Whole festival has already started or completed',
        )

    if not major_readiness(db)['ready']:
        raise HTTPException(
            409,
            'All major festivals must be completed first',
        )

    try:

        (
            db.query(Completion)
            .filter(Completion.major_id == 0)
            .with_for_update()
            .first()
        )

        if (
            db.query(WholeCandidate)
            .filter(WholeCandidate.c_id == candidate_id)
            .first()
        ):
            raise HTTPException(
                409,
                'Candidate already selected',
            )

        year = datetime.now().year

        if not (
            db.query(MajorSelection)
            .filter(
                MajorSelection.c_id == candidate_id,
                MajorSelection.year == year,
            )
            .first()
        ):
            raise HTTPException(
                404,
                'Candidate is not a current major winner',
            )

        max_number = db.query(func.max(WholeCandidate.c_w_number)).scalar()
        number = int(max_number or 0) + 1

        db.add(
            WholeCandidate(
                c_id=candidate_id,
                c_w_number=number,
            )
        )
        db.commit()

        return JSONResponse({
            'success': True,
            'ok': True,
            'c_w_number': number,
        })

    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise_database_conflict(
            exc,
            code="whole_candidate_conflict",
            message="Whole candidate data changed at the same time. Refresh and try again.",
            resource="whole_candidate",
            fields={"candidate_id": candidate_id},
        )


@app.delete('/api/admin/whole-candidates/{candidate_id}')
def whole_remove(
    candidate_id: int,
    a: Admin = Depends(require_whole_admin),
    db: Session = Depends(get_db),
):
    if festival_context(db, 0)['status'] in {1, 2}:
        raise HTTPException(409, 'Whole candidate management is locked because the Whole festival has already started or completed')
    row = db.query(WholeCandidate).filter(WholeCandidate.c_id == candidate_id).first()
    if not row:
        raise HTTPException(404, 'Whole candidate not found')
    db.delete(row)
    db.commit()
    return JSONResponse({'ok': True})

@app.put('/api/admin/whole-candidates/{candidate_id}')
def whole_number(
    candidate_id: int,
    c_w_number: int = Form(...),
    c_photo: UploadFile | None = File(None),
    a: Admin = Depends(require_whole_admin),
    db: Session = Depends(get_db),
):
    if festival_context(db, 0)['status'] in {1, 2}:
        raise HTTPException(409, 'Whole candidate management is locked because the Whole festival has already started or completed')

    row = db.query(WholeCandidate).filter(WholeCandidate.c_id == candidate_id).first()
    if not row:
        raise HTTPException(404, 'Whole candidate not found')

    candidate = db.query(Candidate).filter(Candidate.c_id == candidate_id).first()
    if not candidate:
        raise HTTPException(404, 'Candidate not found')

    if c_w_number < 1:
        raise HTTPException(400, 'Whole candidate number must be at least 1')

    if db.query(WholeCandidate).filter(WholeCandidate.c_w_number == c_w_number, WholeCandidate.c_id != candidate_id).first():
        raise HTTPException(409, 'Whole candidate number already exists')

    row.c_w_number = c_w_number

    old_photo = None
    new_photo = None
    if c_photo is not None and c_photo.filename:
        old_photo = candidate.c_photo
        new_photo = upload_candidate_photo(c_photo)
        candidate.c_photo = new_photo
        candidate.c_photo_type = c_photo.content_type

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if new_photo:
            delete_candidate_photo(new_photo)
        raise_database_conflict(
            exc,
            code="whole_candidate_number_conflict",
            message="That Whole candidate number was assigned by another request. Refresh and choose another number.",
            resource="whole_candidate",
            fields={"candidate_id": candidate_id, "c_w_number": c_w_number},
        )

    if old_photo and new_photo:
        delete_candidate_photo(old_photo)

    return JSONResponse({
        'ok': True,
        'c_id': candidate.c_id,
        'c_w_number': row.c_w_number,
        'c_photo': candidate.c_photo,
    })

@app.get('/api/organizer/targets')
def organizer_target_options(
    a: Admin = Depends(current_admin),
    db: Session = Depends(get_db),
):
    return JSONResponse({'targets': organizer_targets(a, db)})

@app.get('/api/organizer/status')
def organizer_status(
    target_id: int | None = Query(None),
    a: Admin = Depends(current_admin),
    db: Session = Depends(get_db),
):
    target = organizer_target(a, db, target_id)
    context = festival_context(db, target)
    completion = db.query(Completion).filter(
        Completion.major_id == target,
        Completion.year == datetime.now().year,
    ).first()
    exact_status = int(completion.status) if completion is not None else 0
    context['status'] = exact_status
    context['voting_open'] = exact_status == 1
    starter_id = None
    can_start = exact_status == 0
    can_end = exact_status == 1
    action_message = ''

    if target < 0:
        combined = db.get(CombinedFestival, abs(target))
        starter_id = combined.started_by_admin_id
        if context['status'] == 1:
            can_start = False
            can_end = starter_id == a.admin_id
            if not can_end:
                starter = db.get(Admin, starter_id) if starter_id else None
                action_message = f"Festival was started by {starter.admin_name if starter else 'another admin'}. Only that admin can end it."
        elif context['status'] == 2:
            can_start = False
            can_end = False

    if context['status'] == 2:
        can_start = False
        can_end = False

    return JSONResponse({
        'target_id': target,
        'major_id': target,
        'major': context['name'],
        'festival_type': 'whole' if target == 0 else 'combined' if target < 0 else 'major',
        'status': context['status'],
        'voting_open': context['voting_open'],
        'year': context['year'],
        'include_popular': context['include_popular'],
        'major_ids': context['major_ids'],
        'qr_counts': qr_counts(db, target),
        'started_by_admin_id': starter_id,
        'can_start': can_start,
        'can_end': can_end,
        'action_message': action_message,
    })


@app.post("/api/organizer/start")
def organizer_start(
    target_id: int | None=Form(None),
    a: Admin=Depends(current_admin),
    db: Session=Depends(get_db),
):
    target = organizer_target(a, db, target_id)

    ensure_year_rows(db)
    db.commit()

    if target == 0 and not major_readiness(db)["ready"]:
        raise HTTPException(
            409,
            "All major festivals must be completed first",
        )

    member_ids = target_major_ids(db, target)

    try:
        completion = (
            db.query(Completion)
            .filter(Completion.major_id == target)
            .with_for_update()
            .one()
        )

        if completion.status == 1:
            raise HTTPException(409, "This festival is already running")

        if completion.status == 2:
            raise HTTPException(409, "This festival is already completed")

        if target < 0:
            member_rows = (
                db.query(Completion)
                .filter(Completion.major_id.in_(member_ids))
                .with_for_update()
                .all()
            )

            if any(row.status != 0 for row in member_rows):
                raise HTTPException(
                    409,
                    "One of the combined majors has already started or completed another festival",
                )

            combined = db.get(CombinedFestival, abs(target))
            if not combined:
                raise HTTPException(404, "Combined festival not found")

            combined.started_by_admin_id = a.admin_id

        completion.status = 1

        voter_ids = [
            row[0]
            for row in (
                db.query(Voter.voter_id)
                .filter(Voter.major_id == target)
                .all()
            )
        ]

        if voter_ids:
            (
                db.query(Vote)
                .filter(Vote.voter_id.in_(voter_ids))
                .delete(synchronize_session=False)
            )

        voters = (
            db.query(Voter)
            .filter(Voter.major_id == target)
            .with_for_update()
            .all()
        )

        for voter in voters:
            voter.voted = False
            voter.submitted = False

        db.commit()

        return JSONResponse({
            "ok": True,
            "target_id": target,
            "major_id": target,
            "major": target_name(db, target),
            "year": datetime.now().year,
            "status": 1,
            "voting_open": True,
            "major_ids": member_ids,
            "started_by_admin_id": a.admin_id if target < 0 else None,
        })

    except HTTPException:
        db.rollback()
        raise



@app.post("/api/organizer/stop")
def organizer_stop(
    target_id: int | None=Form(None),
    a: Admin=Depends(current_admin),
    db: Session=Depends(get_db),
):
    target = organizer_target(
        a,
        db,
        target_id,
    )

    member_ids = target_major_ids(
        db,
        target,
    )

    try:
        completion = (
            db.query(Completion)
            .filter(Completion.major_id == target)
            .with_for_update()
            .one()
        )

        if completion.status != 1:
            raise HTTPException(
                409,
                "This festival is not running",
            )

        if target < 0:
            combined = db.get(
                CombinedFestival,
                abs(target),
            )

            if not combined:
                raise HTTPException(
                    404,
                    "Combined festival not found",
                )

            if combined.started_by_admin_id != a.admin_id:
                starter = (
                    db.get(
                        Admin,
                        combined.started_by_admin_id,
                    )
                    if combined.started_by_admin_id
                    else None
                )

                raise HTTPException(
                    403,
                    (
                        "Only "
                        f"{starter.admin_name if starter else 'the admin who started this festival'} "
                        "can end this combined festival"
                    ),
                )
            
        winners = calculate_winners(db, target)
        completion.status = 2

        (
            db.query(Voter)
            .filter(Voter.major_id == target)
            .update({Voter.active: False}, synchronize_session=False)
        )

        db.commit()

    except HTTPException:
        db.rollback()
        raise

    clear_qr_artifacts(target)

    return JSONResponse(
        {
            "ok": True,
            "target_id": target,
            "major_id": target,
            "major": target_name(db, target),
            "year": datetime.now().year,
            "status": 2,
            "voting_open": False,
            "major_ids": member_ids,
            "winners": winners,
            "selection_pending": True,
            "qr_counts": {
                "students": 0,
                "teachers": 0,
            },
        }
    )


@app.post('/api/organizer/generate-qr')
def organizer_generate_qr(
    students: int = Form(...),
    teachers: int = Form(...),
    target_id: int | None = Form(None),
    a: Admin = Depends(current_admin),
    db: Session = Depends(get_db),
):
    target = organizer_target(a, db, target_id)
    context = festival_context(db, target)
    if context['status'] == 2:
        raise HTTPException(409, 'QR credentials cannot be generated after the festival is completed')
    if students < 0 or teachers < 0:
        raise HTTPException(400, 'Targets cannot be negative')
    return JSONResponse({
        'success': True,
        'result': ensure_all_targets(target, students, teachers, db),
        'counts': qr_counts(db, target),
        'target_id': target,
        'major_id': target,
        'festival': target_name(db, target),
    })

@app.get('/api/organizer/download-qr/{role}')
def organizer_download(
    role: str,
    target_id: int | None = Query(None),
    a: Admin = Depends(current_admin),
    db: Session = Depends(get_db),
):
    target = organizer_target(a, db, target_id)
    try:
        path = build_role_zip(target, role)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return FileResponse(path, media_type='application/zip', filename=path.name)

@app.get('/api/organizer/winners')
def organizer_winners(
    target_id: int | None = Query(None),
    a: Admin = Depends(current_admin),
    db: Session = Depends(get_db),
):
    target = organizer_target(a, db, target_id)
    context = festival_context(db, target)

    if context["status"] != 2:
        raise HTTPException(409, 'End the festival before viewing final title results')

    final_titles = saved_winners(db, target)
    expected_title_count = len(current_titles(db, target))
    finalized = expected_title_count > 0 and len(final_titles) == expected_title_count

    if finalized:
        titles = final_titles
        source = "final"
    else:
        titles = calculate_winners(db, target)
        source = "manual_selection"

    return JSONResponse({
        'target_id': target,
        'major_id': target,
        'major': target_name(db, target),
        'status': context["status"],
        'source': source,
        'finalized': finalized,
        'titles': titles,
    })


@app.post('/api/organizer/winners/finalize')
def organizer_finalize_winners(
    payload: ManualWinnerSubmitRequest,
    target_id: int | None = Query(None),
    a: Admin = Depends(current_admin),
    db: Session = Depends(get_db),
):
    target = organizer_target(a, db, target_id)
    context = festival_context(db, target)

    if context["status"] != 2:
        raise HTTPException(409, 'End the festival before selecting final title recipients')

    existing_final = saved_winners(db, target)
    if existing_final and len(existing_final) == len(current_titles(db, target)):
        raise HTTPException(409, 'Title recipients have already been finalized')

    titles = current_titles(db, target)
    title_ids = {title.title_id for title in titles}
    submitted = {item.title_id: item.candidate_id for item in payload.selections}

    if len(payload.selections) != len(submitted):
        raise HTTPException(400, 'Each title may be selected only once')
    if set(submitted) != title_ids:
        raise HTTPException(400, 'Select exactly one candidate for every title')

    selected_candidate_ids = list(submitted.values())
    if len(selected_candidate_ids) != len(set(selected_candidate_ids)):
        raise HTTPException(400, 'A candidate can receive only one title in this result set')

    rankings = calculate_winners(db, target)
    by_title = {item["title_id"]: item for item in rankings}
    selected_results = []

    for title_id, candidate_id in submitted.items():
        ranking = by_title.get(title_id)
        if not ranking:
            raise HTTPException(400, 'Invalid title selection')
        allowed = {candidate["c_id"]: candidate for candidate in ranking["winners"]}
        winner = allowed.get(candidate_id)
        if winner is None:
            raise HTTPException(400, 'A selected candidate is not in that title top 3')
        selected_results.append({
            "title_id": ranking["title_id"],
            "title": ranking["title"],
            "group": ranking["group"],
            "total_vote_weight": winner["total_vote_weight"],
            "winners": [winner],
        })

    try:
        save_winners(db, target, selected_results)

        if target != 0 and major_readiness(db)["ready"]:
            initialize_default_whole_candidates(db)

        voter_ids = [
            row[0]
            for row in db.query(Voter.voter_id).filter(Voter.major_id == target).all()
        ]
        if voter_ids:
            db.query(Vote).filter(Vote.voter_id.in_(voter_ids)).delete(synchronize_session=False)
        db.query(Voter).filter(Voter.major_id == target).delete(synchronize_session=False)

        db.commit()
    except Exception:
        db.rollback()
        raise

    clear_qr_artifacts(target)

    return JSONResponse({
        'ok': True,
        'target_id': target,
        'major': target_name(db, target),
        'finalized': True,
        'titles': saved_winners(db, target),
    })
