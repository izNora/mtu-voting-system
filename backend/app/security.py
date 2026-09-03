import hashlib, hmac, secrets
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from .config import TOKEN_PEPPER, SESSION_SECRET
ph = PasswordHasher()
serializer = URLSafeTimedSerializer(SESSION_SECRET, salt='qr-voting-gender-titles')

def create_qr_token():
    public_id = secrets.token_hex(8)
    secret = secrets.token_urlsafe(32)
    digest = hmac.new(TOKEN_PEPPER.encode(), secret.encode(), hashlib.sha256).hexdigest()
    return (public_id, secret, f'{public_id}${digest}')

def verify_qr_token(public_id, secret, stored_token):
    try:
        stored_public, stored_digest = stored_token.split('$', 1)
    except ValueError:
        return False
    calculated = hmac.new(TOKEN_PEPPER.encode(), secret.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(public_id, stored_public) and hmac.compare_digest(calculated, stored_digest)

def hash_password(password):
    return ph.hash(password)

def verify_password(password, password_hash):
    try:
        return ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False

def create_session(kind, account_id, session_version=None):
    payload = {'type': kind, 'id': account_id}
    if session_version is not None:
        payload['session_version'] = int(session_version)
    return serializer.dumps(payload)

def read_session(value, max_age=43200):
    try:
        return serializer.loads(value, max_age=max_age)
    except (BadSignature, SignatureExpired):
        return None
