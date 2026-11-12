"""Keep ONNX graphs and external tensors in real sibling files.

VieNeu 3.8.3 fetches graph bundles from Hugging Face's symlink cache.
Some ONNX Runtime/cache layouts resolve those siblings into different blob
subdirectories. This adapter materializes the exact downloaded bytes without
changing the shared cache or weakening ONNX Runtime's path validation.
"""
from __future__ import annotations
import hashlib
import json
import os
import shutil
import tempfile
import threading
from pathlib import Path, PurePosixPath

_COPY_LOCK = threading.RLock()


def materialize_file(source, bundle_dir, filename):
    """Copy a cached file atomically; do not return symlinks or reuse stale bytes."""
    relative = PurePosixPath(str(filename).replace('\\', '/'))
    if relative.is_absolute() or not relative.parts or any(part in ('..', '') or ':' in part for part in relative.parts):
        raise ValueError('Invalid model artifact path')
    source = Path(source)
    bundle_dir = Path(bundle_dir)
    bundle_dir.mkdir(parents=True, exist_ok=True)
    target = bundle_dir.joinpath(*relative.parts)
    target.parent.mkdir(parents=True, exist_ok=True)
    # This folder is owned by the adapter. Refuse directories redirected outside it.
    if not target.parent.resolve().is_relative_to(bundle_dir.resolve()):
        raise ValueError('Model destination escapes its directory')
    stat = source.stat()
    fingerprint = {'source': str(source.resolve()), 'size': stat.st_size, 'mtime_ns': stat.st_mtime_ns}
    marker = target.with_name(target.name + '.source.json')
    with _COPY_LOCK:
        if target.is_file() and not target.is_symlink() and target.stat().st_size == stat.st_size:
            try:
                if json.loads(marker.read_text(encoding='utf-8')) == fingerprint:
                    return target
            except (OSError, ValueError):
                pass
        fd, temporary = tempfile.mkstemp(prefix='copy-', suffix='.part', dir=target.parent)
        os.close(fd)
        temporary = Path(temporary)
        try:
            shutil.copyfile(source, temporary, follow_symlinks=True)
            if temporary.stat().st_size != stat.st_size:
                raise OSError('Incomplete model copy')
            # Replaces a target symlink itself, never the shared cache it points to.
            os.replace(temporary, target)
            marker.write_text(json.dumps(fingerprint), encoding='utf-8')
        finally:
            temporary.unlink(missing_ok=True)
    return target


def fetch_bundle(repo, files, subfolder, storage, download):
    identity = json.dumps([repo, subfolder or ''], ensure_ascii=False)
    key = hashlib.sha256(identity.encode('utf-8')).hexdigest()[:20]
    destination = Path(storage) / key
    last = None
    for filename in files:
        try:
            source = download(repo, filename, repo_type='model', subfolder=subfolder or None)
        except Exception:
            if filename.endswith('.json'):
                continue  # Match the pinned SDK's optional-metadata handling.
            raise
        last = materialize_file(source, destination, filename)
    if last is None:
        raise RuntimeError('No model artifacts were downloaded')
    return destination


def install_model_copy_fix(storage):
    """Patch only VieNeu's artifact-bundle loader, before it opens ORT sessions."""
    from huggingface_hub import hf_hub_download
    from vieneu._v3_turbo_engine.onnx_runtime_lite import OnnxV3LiteEngine
    root = Path(storage)
    def cached_download(*args, **kwargs):
        # Cached models are reusable without a network metadata request. Other
        # optional models can still download later when their feature is used.
        try:
            return hf_hub_download(*args, **kwargs, local_files_only=True)
        except Exception:
            return hf_hub_download(*args, **kwargs)
    def fetch(repo, files, subfolder):
        return fetch_bundle(repo, files, subfolder, root, cached_download)
    OnnxV3LiteEngine._fetch = staticmethod(fetch)
