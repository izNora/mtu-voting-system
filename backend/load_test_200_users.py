#!/usr/bin/env python3
"""Concurrent end-to-end load test for the CURRENT voter API flow.

For each simulated voter this follows the same API sequence as the frontend:
  1. POST /api/voter/qr/verify
  2. GET  /api/voter/session?voter_id=...
  3. GET  /api/voter/ballot?voter_id=...
  4. POST /api/voter/submit?voter_id=...

The verify response sets an HttpOnly voter cookie. Each simulated voter keeps its
own httpx.AsyncClient so that cookie is preserved for session/ballot/submit.

Run only against the TEST database seeded by load_test_seed_200.sql.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import time
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path
from urllib.parse import urlsplit

import httpx


@dataclass
class Result:
    user_no: int
    ok: bool
    stage: str
    status_code: int | None
    elapsed_ms: float
    detail: str = ""


def normalize_body(response: httpx.Response) -> tuple[dict, str]:
    request_id = response.headers.get("x-request-id", "")
    try:
        payload = response.json()
    except Exception:
        preview = response.text.replace("\r", " ").replace("\n", " ").strip()[:500]
        return {}, (
            f"non-JSON response status={response.status_code} "
            f"request_id={request_id or 'missing'} body={preview!r}"
        )

    if isinstance(payload, dict) and isinstance(payload.get("data"), dict):
        merged = dict(payload)
        merged.update(payload["data"])
        payload = merged

    if not isinstance(payload, dict):
        return {"value": payload}, ""
    return payload, ""


def error_detail(body: dict, fallback: str = "") -> str:
    detail = str(body.get("detail") or body.get("message") or fallback or "")
    error = body.get("error") if isinstance(body.get("error"), dict) else {}
    extras = []
    for key in ("code", "constraint", "mysql_code", "request_id"):
        value = error.get(key)
        if value not in (None, ""):
            extras.append(f"{key}={value}")
    return (detail + (f" [{', '.join(extras)}]" if extras else "")).strip()


def parse_qr_line(line: str) -> tuple[str, str]:
    raw = line.strip()
    if not raw or raw.startswith("#"):
        raise ValueError("empty/comment")
    fragment = urlsplit(raw).fragment if "#" in raw else raw
    if "/" not in fragment:
        raise ValueError("expected /qr-entry#PUBLIC_ID/SECRET or PUBLIC_ID/SECRET")
    public_id, secret = fragment.split("/", 1)
    public_id, secret = public_id.strip(), secret.strip()
    if not public_id or not secret:
        raise ValueError("missing public_id or secret")
    return public_id, secret


def build_selections(ballot: dict) -> list[dict]:
    titles = sorted(ballot.get("titles") or [], key=lambda x: int(x["title_id"]))
    candidates = ballot.get("candidates") or []
    if not titles:
        raise RuntimeError("ballot returned no titles")
    if not candidates:
        raise RuntimeError("ballot returned no candidates")

    by_gender: dict[str, list[dict]] = {"boy": [], "girl": []}
    for candidate in candidates:
        gender = str(candidate.get("c_gender", "")).lower()
        if gender in by_gender:
            by_gender[gender].append(candidate)
    for rows in by_gender.values():
        rows.sort(key=lambda c: (int(c.get("c_number") or 0), int(c["c_id"])))

    used: set[int] = set()
    selections: list[dict] = []
    for title in titles:
        group = str(title.get("group", "")).lower()
        options = by_gender.get(group, [])
        chosen = next((int(c["c_id"]) for c in options if int(c["c_id"]) not in used), None)
        if chosen is None:
            raise RuntimeError(f"not enough distinct {group} candidates for all {group} titles")
        used.add(chosen)
        selections.append({"title_id": int(title["title_id"]), "candidate_id": chosen})
    return selections


async def simulate_voter(
    user_no: int,
    qr: tuple[str, str],
    base_url: str,
    start_event: asyncio.Event,
    timeout_seconds: float,
) -> Result:
    public_id, secret = qr
    started = time.perf_counter()

    timeout = httpx.Timeout(timeout_seconds)
    limits = httpx.Limits(max_connections=4, max_keepalive_connections=2, keepalive_expiry=30.0)

    async with httpx.AsyncClient(
        base_url=base_url,
        timeout=timeout,
        limits=limits,
        follow_redirects=False,
    ) as client:
        await start_event.wait()
        try:
            response = await client.post(
                "/api/voter/qr/verify",
                json={"public_id": public_id, "secret": secret},
            )
            body, diagnostic = normalize_body(response)
            if response.status_code != 200 or not body.get("success"):
                return Result(user_no, False, "qr_verify", response.status_code,
                              (time.perf_counter() - started) * 1000,
                              diagnostic or error_detail(body))

            voter_id = body.get("voter_id")
            if not voter_id:
                return Result(user_no, False, "qr_verify", response.status_code,
                              (time.perf_counter() - started) * 1000, "verify returned no voter_id")

            response = await client.get("/api/voter/session", params={"voter_id": voter_id})
            body, diagnostic = normalize_body(response)
            if response.status_code != 200 or not body.get("success") or not body.get("valid"):
                return Result(user_no, False, "session", response.status_code,
                              (time.perf_counter() - started) * 1000,
                              diagnostic or error_detail(body))

            response = await client.get("/api/voter/ballot", params={"voter_id": voter_id})
            body, diagnostic = normalize_body(response)
            if response.status_code != 200 or not body.get("success"):
                return Result(user_no, False, "ballot", response.status_code,
                              (time.perf_counter() - started) * 1000,
                              diagnostic or error_detail(body))
            if body.get("submitted"):
                return Result(user_no, False, "ballot", 409,
                              (time.perf_counter() - started) * 1000,
                              "seed voter has already submitted; rerun load_test_seed_200.sql")

            selections = build_selections(body)
            response = await client.post(
                "/api/voter/submit",
                params={"voter_id": voter_id},
                json={"selections": selections},
            )
            body, diagnostic = normalize_body(response)
            elapsed = (time.perf_counter() - started) * 1000
            if response.status_code == 200 and body.get("success") and body.get("submitted"):
                return Result(user_no, True, "submit", response.status_code, elapsed,
                              body.get("message", ""))
            return Result(user_no, False, "submit", response.status_code, elapsed,
                          diagnostic or error_detail(body, str(body)))

        except httpx.TimeoutException as exc:
            return Result(user_no, False, "timeout", None,
                          (time.perf_counter() - started) * 1000, str(exc))
        except Exception as exc:
            return Result(user_no, False, "exception", None,
                          (time.perf_counter() - started) * 1000,
                          f"{type(exc).__name__}: {exc}")


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    values = sorted(values)
    pos = (len(values) - 1) * p
    lo = int(pos)
    hi = min(lo + 1, len(values) - 1)
    frac = pos - lo
    return values[lo] + (values[hi] - values[lo]) * frac


async def main_async(args) -> int:
    qr_path = Path(args.qr_file)
    if not qr_path.exists():
        print(f"ERROR: QR file not found: {qr_path}")
        return 2

    qrs: list[tuple[str, str]] = []
    for line_no, line in enumerate(qr_path.read_text(encoding="utf-8").splitlines(), 1):
        try:
            qrs.append(parse_qr_line(line))
        except ValueError as exc:
            if line.strip() and not line.strip().startswith("#"):
                print(f"ERROR line {line_no}: {exc}")
                return 2

    if len(qrs) < args.users:
        print(f"ERROR: need {args.users} QR credentials, found {len(qrs)}")
        return 2
    qrs = qrs[:args.users]
    if len(set(qrs)) != len(qrs):
        print("ERROR: duplicate QR credentials in input file")
        return 2

    print("=" * 76)
    print("MTU Voting System - concurrent voter load test")
    print("Current API flow: verify -> session -> ballot -> submit")
    print("=" * 76)
    print(f"Server:  {args.base_url}")
    print(f"Users:   {args.users}")
    print(f"Timeout: {args.timeout:.1f}s per request")
    print(f"QR file: {qr_path}")
    print("WARNING: this permanently submits ballots in the configured TEST database.")
    print()

    start_event = asyncio.Event()
    tasks = [asyncio.create_task(simulate_voter(
        i + 1, qrs[i], args.base_url.rstrip("/"), start_event, args.timeout
    )) for i in range(args.users)]

    await asyncio.sleep(0.25)
    wall_started = time.perf_counter()
    start_event.set()
    results = await asyncio.gather(*tasks)
    wall_seconds = time.perf_counter() - wall_started

    passed = [r for r in results if r.ok]
    failed = [r for r in results if not r.ok]
    latencies = [r.elapsed_ms for r in results]
    stage_counts = Counter(r.stage for r in failed)

    print("=" * 76)
    print("RESULT")
    print("=" * 76)
    print(f"Total users:      {len(results)}")
    print(f"Successful:       {len(passed)}")
    print(f"Failed:           {len(failed)}")
    print(f"Success rate:     {(len(passed) / len(results) * 100) if results else 0:.2f}%")
    print(f"Wall-clock:       {wall_seconds:.2f}s")
    print(f"Voter flows/sec:  {(len(results) / wall_seconds) if wall_seconds else 0:.2f}")
    if latencies:
        print("End-to-end latency:")
        print(f"  min    {min(latencies):.1f} ms")
        print(f"  mean   {statistics.mean(latencies):.1f} ms")
        print(f"  median {statistics.median(latencies):.1f} ms")
        print(f"  p95    {percentile(latencies, .95):.1f} ms")
        print(f"  p99    {percentile(latencies, .99):.1f} ms")
        print(f"  max    {max(latencies):.1f} ms")

    if failed:
        print("Failure stages:", dict(stage_counts))
        print("First failures:")
        for r in failed[:50]:
            print(f"  user={r.user_no:03d} stage={r.stage:<10} status={str(r.status_code):<4} "
                  f"time={r.elapsed_ms:.1f}ms detail={r.detail}")

    report = {
        "base_url": args.base_url,
        "users": len(results),
        "successful": len(passed),
        "failed": len(failed),
        "success_rate_percent": round((len(passed) / len(results) * 100) if results else 0, 2),
        "wall_seconds": round(wall_seconds, 3),
        "flows_per_second": round((len(results) / wall_seconds) if wall_seconds else 0, 3),
        "failure_stages": dict(stage_counts),
        "latency_ms": {
            "min": round(min(latencies), 2) if latencies else 0,
            "mean": round(statistics.mean(latencies), 2) if latencies else 0,
            "median": round(statistics.median(latencies), 2) if latencies else 0,
            "p95": round(percentile(latencies, .95), 2),
            "p99": round(percentile(latencies, .99), 2),
            "max": round(max(latencies), 2) if latencies else 0,
        },
        "results": [asdict(r) for r in results],
    }
    Path(args.report).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Report written to: {args.report}")
    return 0 if not failed else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--qr-file", default="load_test_qr_urls_200.txt")
    parser.add_argument("--users", type=int, default=200)
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--report", default="load_test_report.json")
    args = parser.parse_args()
    if args.users < 1 or args.users > 200:
        parser.error("--users must be between 1 and 200 for this seed set")
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    raise SystemExit(main())
