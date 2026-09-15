export interface SampleFile {
  path: string;
  content: string;
}

export const SAMPLE_PYTHON_REPO: SampleFile[] = [
  {
    path: 'src/auth/password.py',
    content: `"""
Password hashing and verification utilities using bcrypt.
"""
import bcrypt
import re

MIN_PASSWORD_LENGTH = 8

def hash_password(plain_password: str) -> str:
    """Hashes a plaintext password using bcrypt with salt rounds = 12."""
    if not validate_password_strength(plain_password):
        raise ValueError("Password does not meet complexity requirements")
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(plain_password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against a stored bcrypt hash."""
    if not plain_password or not hashed_password:
        return False
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def validate_password_strength(password: str) -> bool:
    """
    Validates that a password satisfies all security requirements:
    - At least 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one numeric digit
    - At least one special character
    """
    if len(password) < MIN_PASSWORD_LENGTH:
        return False
    if not re.search(r"[A-Z]", password):
        return False
    if not re.search(r"[a-z]", password):
        return False
    if not re.search(r"[0-9]", password):
        return False
    if not re.search(r"[!@#$%^&*(),.?\\":{}|<>]", password):
        return False
    return True
`
  },
  {
    path: 'src/auth/login.py',
    content: `"""
User authentication and login API handlers.
"""
import jwt
import datetime
from typing import Optional, Dict, Any
from src.auth.password import verify_password
from src.users.service import get_user_by_username, record_login_attempt

SECRET_KEY = "jwt-app-secret-production-key"
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRY_HOURS = 24

class AuthenticationError(Exception):
    """Raised when authentication credentials fail."""
    pass

def login_user(username: str, password: str, client_ip: Optional[str] = None) -> Dict[str, Any]:
    """
    Authenticates a user with username and password.
    1. Looks up the user account by username in the database
    2. Validates user account active status
    3. Verifies provided password against stored hash using verify_password()
    4. Generates a signed JWT session token on success
    5. Records the audit log and login attempt
    """
    user = get_user_by_username(username)
    if not user:
        record_login_attempt(username, success=False, ip=client_ip)
        raise AuthenticationError("Invalid username or password")

    if not user.get("is_active", False):
        raise AuthenticationError("User account is disabled")

    is_valid = verify_password(password, user["password_hash"])
    if not is_valid:
        record_login_attempt(username, success=False, ip=client_ip)
        raise AuthenticationError("Invalid username or password")

    token = generate_access_token(user["id"], user["username"], user.get("role", "developer"))
    record_login_attempt(username, success=True, ip=client_ip)

    return {
        "access_token": token,
        "token_type": "Bearer",
        "expires_in": TOKEN_EXPIRY_HOURS * 3600,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "role": user.get("role", "developer")
        }
    }

def generate_access_token(user_id: str, username: str, role: str) -> str:
    """Generates an encrypted JWT access token with user claims and expiration timestamp."""
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "iat": datetime.datetime.utcnow(),
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=TOKEN_EXPIRY_HOURS)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)
`
  },
  {
    path: 'src/auth/middleware.py',
    content: `"""
Authentication and authorization middleware for request inspection.
"""
import jwt
from typing import Optional, Dict, Any
from src.auth.login import SECRET_KEY, JWT_ALGORITHM

class TokenExpiredError(Exception):
    pass

class InvalidTokenError(Exception):
    pass

def authenticate_request(authorization_header: Optional[str]) -> Dict[str, Any]:
    """
    Intercepts incoming HTTP requests, parses the Bearer token,
    and returns verified user claims.
    """
    if not authorization_header or not authorization_header.startswith("Bearer "):
        raise InvalidTokenError("Missing or malformed Authorization header")

    token = authorization_header.split(" ")[1].strip()
    return validate_token(token)

def validate_token(token: str) -> Dict[str, Any]:
    """
    Validates a JWT token's signature, integrity, and expiration date.
    Returns decoded token payload if valid.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise TokenExpiredError("Token has expired. Please login again.")
    except jwt.InvalidTokenError as e:
        raise InvalidTokenError(f"Invalid authentication token: {str(e)}")

def require_role(required_role: str, user_claims: Dict[str, Any]) -> bool:
    """Ensures the authenticated user has the necessary role privilege."""
    user_role = user_claims.get("role", "user")
    if user_role == "admin":
        return True
    return user_role == required_role
`
  },
  {
    path: 'src/database/connection.py',
    content: `"""
Database engine and connection pool management.
"""
import os
import psycopg2
from psycopg2 import pool
from contextlib import contextmanager
from typing import Generator

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/codebase_db")
MIN_CONNECTIONS = 2
MAX_CONNECTIONS = 20

_connection_pool: Optional[pool.SimpleConnectionPool] = None

def get_database_pool() -> pool.SimpleConnectionPool:
    """
    Initializes or returns the thread-safe PostgreSQL connection pool.
    Configured with minimum 2 and maximum 20 connections.
    """
    global _connection_pool
    if _connection_pool is None or _connection_pool.closed:
        _connection_pool = pool.SimpleConnectionPool(
            minconn=MIN_CONNECTIONS,
            maxconn=MAX_CONNECTIONS,
            dsn=DATABASE_URL
        )
    return _connection_pool

@contextmanager
def get_db_connection() -> Generator[Any, None, None]:
    """
    Context manager that leases a database connection from the pool
    and safely returns it back when finished.
    """
    connection_pool = get_database_pool()
    conn = connection_pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        connection_pool.putconn(conn)

def close_database_pool() -> None:
    """Closes all open database connections in the pool during application shutdown."""
    global _connection_pool
    if _connection_pool and not _connection_pool.closed:
        _connection_pool.closeall()
`
  },
  {
    path: 'src/users/service.py',
    content: `"""
User management service and data repository queries.
"""
from typing import Optional, Dict, Any
from src.database.connection import get_db_connection

def get_user_by_username(username: str) -> Optional[Dict[str, Any]]:
    """Fetches a user record from the PostgreSQL database by username."""
    query = "SELECT id, username, email, password_hash, role, is_active FROM users WHERE username = %s LIMIT 1"
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, (username,))
            row = cur.fetchone()
            if not row:
                return None
            return {
                "id": row[0],
                "username": row[1],
                "email": row[2],
                "password_hash": row[3],
                "role": row[4],
                "is_active": row[5]
            }

def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves user profile information by unique UUID."""
    query = "SELECT id, username, email, role, is_active FROM users WHERE id = %s"
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, (user_id,))
            row = cur.fetchone()
            if not row:
                return None
            return {
                "id": row[0],
                "username": row[1],
                "email": row[2],
                "role": row[3],
                "is_active": row[4]
            }

def record_login_attempt(username: str, success: bool, ip: Optional[str] = None) -> None:
    """Audits authentication attempts for rate limiting and security monitoring."""
    query = "INSERT INTO login_audit_logs (username, success, client_ip, created_at) VALUES (%s, %s, %s, NOW())"
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, (username, success, ip or "unknown"))
`
  },
  {
    path: 'src/main.py',
    content: `"""
Main FastAPI server initialization and route registration.
"""
from fastapi import FastAPI, Depends, HTTPException, Header
from pydantic import BaseModel, EmailStr
from src.auth.login import login_user, AuthenticationError
from src.auth.middleware import authenticate_request, InvalidTokenError, TokenExpiredError
from src.database.connection import get_database_pool, close_database_pool

app = FastAPI(title="Core Application Service", version="1.0.0")

class LoginRequest(BaseModel):
    username: str
    password: str

@app.on_event("startup")
def startup_event():
    """Warms up database connection pool on server boot."""
    get_database_pool()

@app.on_event("shutdown")
def shutdown_event():
    """Gracefully flushes connection pool upon server termination."""
    close_database_pool()

@app.post("/api/auth/login")
def login_endpoint(payload: LoginRequest):
    """
    Public login API definition.
    Receives JSON credentials, calls login_user(), and returns JWT token.
    """
    try:
        result = login_user(payload.username, payload.password)
        return result
    except AuthenticationError as e:
        raise HTTPException(status_code=401, detail=str(e))

@app.get("/api/user/profile")
def get_user_profile(authorization: str = Header(None)):
    """Protected user profile API route guarded by authenticate_request middleware."""
    try:
        user_claims = authenticate_request(authorization)
        return {"status": "ok", "user": user_claims}
    except (InvalidTokenError, TokenExpiredError) as e:
        raise HTTPException(status_code=401, detail=str(e))
`
  }
];

export const SAMPLE_TYPESCRIPT_REPO: SampleFile[] = [
  {
    path: 'src/auth/jwt.ts',
    content: `import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-123';
const TOKEN_TTL = '12h';

export interface UserTokenPayload {
  userId: string;
  email: string;
  role: 'admin' | 'developer' | 'viewer';
}

export function signJwtToken(payload: UserTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyJwtToken(token: string): UserTokenPayload {
  return jwt.verify(token, JWT_SECRET) as UserTokenPayload;
}
`
  },
  {
    path: 'src/auth/authController.ts',
    content: `import { Request, Response } from 'express';
import { signJwtToken } from './jwt';
import { findUserByEmail, verifyCredentials } from '../services/userService';

export async function handleLogin(req: Request, res: Response) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const isValid = await verifyCredentials(email, password);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const user = await findUserByEmail(email);
  const token = signJwtToken({ userId: user.id, email: user.email, role: user.role });
  return res.json({ token, user: { id: user.id, email: user.email } });
}
`
  },
  {
    path: 'src/db/client.ts',
    content: `import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  return res;
}
`
  }
];
