from pathlib import Path

import boto3
from botocore.client import Config

from app.core.config import get_settings


def get_s3_client():
    """S3-compatible client (MinIO in dev, S3/R2 in production)."""
    s = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=s.s3_endpoint_url,
        aws_access_key_id=s.s3_access_key,
        aws_secret_access_key=s.s3_secret_key,
        region_name=s.s3_region,
        config=Config(signature_version="s3v4"),
    )


def _local_path(key: str) -> Path:
    """Resolve a storage key inside the local dir, refusing anything that escapes it."""
    root = Path(get_settings().local_storage_dir).resolve()
    path = (root / key).resolve()
    if root != path and root not in path.parents:
        raise ValueError("invalid storage key")
    return path


def local_file(key: str) -> Path | None:
    """For the development file route: the file for `key`, or None."""
    try:
        path = _local_path(key)
    except ValueError:
        return None
    return path if path.is_file() else None


def _local() -> bool:
    return get_settings().storage_backend == "local"


def ensure_bucket() -> None:
    if _local():
        _local_path("").mkdir(parents=True, exist_ok=True)
        return
    s3, bucket = get_s3_client(), get_settings().s3_bucket
    existing = {b["Name"] for b in s3.list_buckets().get("Buckets", [])}
    if bucket not in existing:
        s3.create_bucket(Bucket=bucket)  # private by default


def put_object(key: str, data: bytes, content_type: str) -> None:
    if _local():
        path = _local_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return
    get_s3_client().put_object(Bucket=get_settings().s3_bucket, Key=key, Body=data, ContentType=content_type)


def get_object(key: str) -> bytes:
    if _local():
        return _local_path(key).read_bytes()
    return get_s3_client().get_object(Bucket=get_settings().s3_bucket, Key=key)["Body"].read()


def delete_object(key: str) -> None:
    if _local():
        _local_path(key).unlink(missing_ok=True)
        return
    get_s3_client().delete_object(Bucket=get_settings().s3_bucket, Key=key)


def presign_get(key: str, expires: int = 300) -> str:
    """Short-lived signed URL for a private object."""
    if _local():  # development: served by the API's /dev-files route (no signing)
        return f"/api/v1/dev-files/{key}"
    return get_s3_client().generate_presigned_url(
        "get_object", Params={"Bucket": get_settings().s3_bucket, "Key": key}, ExpiresIn=expires
    )


def object_exists(key: str) -> bool:
    from botocore.exceptions import ClientError

    if _local():
        return local_file(key) is not None
    try:
        get_s3_client().head_object(Bucket=get_settings().s3_bucket, Key=key)
        return True
    except ClientError:
        return False
