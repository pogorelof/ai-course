from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select

from ..db import get_db
from ..models import User, UserAPIKeys
from ..schemas import (
    UserAPIKeysOut,
    UserAPIKeysUpdateInput,
    UserCreate,
    UserOut,
    LoginInput,
    Token,
)
from ..core.security import get_password_hash, verify_password, create_access_token, get_current_user


router = APIRouter()


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register_user(payload: UserCreate, db: Session = Depends(get_db)) -> UserOut:
    existing = db.scalar(
        select(User).where((User.username == payload.username) | (User.email == payload.email))
    )
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already registered")

    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=get_password_hash(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(payload: LoginInput, db: Session = Depends(get_db)) -> Token:
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(subject=str(user.id))
    return Token(access_token=token)


@router.get("/api-keys", response_model=UserAPIKeysOut)
def get_user_api_keys(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> UserAPIKeysOut:
    keys = db.scalar(select(UserAPIKeys).where(UserAPIKeys.user_id == current_user.id))
    if not keys:
        return UserAPIKeysOut(has_openai_key=False, has_openrouter_key=False)
    return UserAPIKeysOut(
        has_openai_key=bool(keys.openai_api_key and keys.openai_api_key.strip()),
        has_openrouter_key=bool(keys.openrouter_api_key and keys.openrouter_api_key.strip()),
    )


@router.patch("/api-keys", response_model=UserAPIKeysOut)
def update_user_api_keys(
    payload: UserAPIKeysUpdateInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserAPIKeysOut:
    if payload.openrouter_api_key:
        raise HTTPException(status_code=400, detail="OpenRouter is not available yet.")

    keys = db.scalar(select(UserAPIKeys).where(UserAPIKeys.user_id == current_user.id))
    if not keys:
        keys = UserAPIKeys(user_id=current_user.id)
        db.add(keys)
        db.flush()

    if payload.openai_api_key is not None:
        keys.openai_api_key = payload.openai_api_key
    if payload.openrouter_api_key is not None:
        keys.openrouter_api_key = payload.openrouter_api_key

    db.add(keys)
    db.commit()
    db.refresh(keys)

    return UserAPIKeysOut(
        has_openai_key=bool(keys.openai_api_key and keys.openai_api_key.strip()),
        has_openrouter_key=bool(keys.openrouter_api_key and keys.openrouter_api_key.strip()),
    )

