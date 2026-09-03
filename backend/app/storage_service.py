from pathlib import Path
import secrets
from fastapi import HTTPException, UploadFile
from .config import LOCAL_UPLOAD_DIR, MAX_PHOTO_BYTES, PHOTO_STORAGE_PROVIDER, PUBLIC_UPLOAD_BASE_URL
ALLOWED_IMAGE_TYPES = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp'}
UPLOAD_DIR = Path(LOCAL_UPLOAD_DIR)

def ensure_storage_ready():
    if PHOTO_STORAGE_PROVIDER == 'local':
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

def upload_candidate_photo(photo: UploadFile) -> str:
    """Upload a candidate photo and return the URL saved in MySQL.

    Local storage is the development adapter. When a cloud provider is chosen,
    replace/add an adapter here while keeping the candidate API unchanged.
    """
    if PHOTO_STORAGE_PROVIDER == 'local':
        return _upload_local(photo)
    raise HTTPException(status_code=500, detail=f"Photo storage provider '{PHOTO_STORAGE_PROVIDER}' is not configured. Add its adapter in app/storage_service.py.")

def delete_candidate_photo(photo_url: str | None):
    if not photo_url or PHOTO_STORAGE_PROVIDER != 'local':
        return
    prefixes = (f'{PUBLIC_UPLOAD_BASE_URL}/', '/uploads/candidates/')
    prefix = next((item for item in prefixes if photo_url.startswith(item)), None)
    if prefix is None:
        return
    filename = photo_url.removeprefix(prefix)
    if '/' in filename or '\\' in filename:
        return
    path = UPLOAD_DIR / filename
    if path.exists() and path.is_file():
        path.unlink()

def _upload_local(photo: UploadFile) -> str:
    extension = ALLOWED_IMAGE_TYPES.get(photo.content_type or '')
    if not extension:
        raise HTTPException(status_code=400, detail='Photo must be JPEG, PNG, or WebP')
    content = photo.file.read(MAX_PHOTO_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail='Uploaded photo is empty')
    if len(content) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail=f'Photo is too large. Maximum size is {MAX_PHOTO_BYTES} bytes')
    ensure_storage_ready()
    filename = f'{secrets.token_urlsafe(18)}{extension}'
    destination = UPLOAD_DIR / filename
    destination.write_bytes(content)
    return f'/uploads/candidates/{filename}'
