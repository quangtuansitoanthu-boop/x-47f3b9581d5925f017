"""Run nine real native flows on isolated CI installs, with per-case evidence."""
import argparse
import json
import os
from pathlib import Path
import queue
import signal
import stat
import subprocess
import threading
import time


ROOT = Path.cwd().resolve()
EVIDENCE = ROOT / "build/release-evidence"
APP = ROOT / "build/ios-simulator/Build/Products/Debug-iphonesimulator/App.app"
SIMULATOR = os.environ.get("TUTAM_QA_SIMULATOR", "")
BUNDLE = "vn.quangtu.tutam"
CASES = [
    "NativeGuestSmokeTests/testExistingNotificationButtonDeliversToSystemNotificationCenter",
    "NativeGuestSmokeTests/testMotionSettingPersistsAcrossNativeDeepLinks",
    "NativeGuestSmokeTests/testRosaryBackPreservesCountInPortraitAndLandscape",
    "NativeExtendedGuestTests/testLightDarkSettingsAndGuestDeepLinkNavigation",
    "NativeExtendedGuestTests/testMeditationPauseResumeSurvivesNativeBackgrounding",
    "NativeExtendedGuestTests/testNativeCatalogExcludesWebOnlyBookAndSearchCanBeCleared",
    "NativeExtendedGuestTests/testOfflineLibrarySearchChapterReadingAndLargeTextRotation",
    "NativePersonalReminderTests/testPersonalLunarSolarCrudInvalidDateCancelAndPersistence",
    "NativePersonalReminderTests/testPersonalNearFutureReminderDeliversToSystemAndCanBeDeleted",
]
ORDER = [1, 8, 9, 2, 3, 4, 5, 6, 7]
COUNTS = ("passedTests", "failedTests", "skippedTests", "totalTestCount")


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def infrastructure_error(record, message):
    previous = record.get("infrastructureError")
    record["infrastructureError"] = f"{previous}; {message}" if previous else message


def case_passed(record):
    summary = record.get("summary") or {}
    return (
        isinstance(summary, dict)
        and record.get("completed") is True
        and not record.get("infrastructureError")
        and type(record.get("xcodeExitCode")) is int
        and record.get("xcodeExitCode") == 0
        and all(type(summary.get(key)) is int for key in COUNTS)
        and summary.get("passedTests") == 1
        and summary.get("failedTests") == 0
        and summary.get("skippedTests") == 0
        and summary.get("totalTestCount") == 1
    )


def capture_qa_events(index, identifier, fresh_install_completed):
    status = {"case": index, "identifier": identifier,
              "freshInstallCompleted": fresh_install_completed,
              "available": False, "installedMarker": "not-observed"}
    if not fresh_install_completed:
        return None, {**status, "reason": "fresh-install-not-completed"}
    if (os.environ.get("GITHUB_ACTIONS") != "true"
            or os.environ.get("TUTAM_QA_HOSTS_ISOLATED") != "1" or not SIMULATOR):
        return None, {**status, "reason": "isolated-ci-required"}
    try:
        container = subprocess.run([
            "xcrun", "simctl", "get_app_container", SIMULATOR, BUNDLE, "data",
        ], capture_output=True, text=True, check=True, timeout=15)
        raw_path = container.stdout.strip()
        if not raw_path or "\n" in raw_path or not Path(raw_path).is_absolute():
            raise ValueError("Invalid app data container")
        root = Path(raw_path).resolve(strict=True)
        # Open only fixed descendants; O_NOFOLLOW on every component prevents
        # a sandbox symlink from redirecting diagnostics outside app data.
        descriptors = []
        try:
            directory = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            descriptors.append(directory)
            for part in ("Library", "Caches"):
                directory = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                                    dir_fd=directory)
                descriptors.append(directory)
            source = os.open("tutam-qa-events.jsonl", os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                             dir_fd=directory)
            descriptors.append(source)
            if not stat.S_ISREG(os.fstat(source).st_mode):
                raise ValueError("QA events must be a regular file")
            limit = 256 * 1024
            with os.fdopen(os.dup(source), "rb") as events:
                payload = events.read(limit + 1)
            payload, truncated = payload[:limit], len(payload) > limit
            installed = False
            for line in payload.splitlines():
                try:
                    event = json.loads(line)
                    if isinstance(event, dict) and event.get("type") == "installed":
                        installed = True
                        break
                except (ValueError, UnicodeDecodeError):
                    continue
            status.update(available=True, bytesCopied=len(payload), truncated=truncated,
                          installedMarker="present" if installed else "missing")
            return payload, status
        finally:
            for descriptor in reversed(descriptors):
                os.close(descriptor)
    except (OSError, subprocess.SubprocessError, ValueError) as error:
        return None, {**status, "reason": type(error).__name__}


def run_case(index):
    identifier = CASES[index - 1]
    stem = f"native-{index:02d}"
    result = EVIDENCE / f"{stem}.xcresult"
    record_path = EVIDENCE / f"{stem}-record.json"
    previous_evidence = record_path.exists() or result.exists()
    record = {
        "case": index, "identifier": identifier, "resultBundle": result.name,
        "workflowRunId": os.environ.get("GITHUB_RUN_ID"),
        "workflowRunAttempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
        "completed": False, "xcodeExitCode": None, "freshInstallCompleted": False,
    }
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    write_json(record_path, record)
    group_started = False
    fresh_install_completed = False
    try:
        if previous_evidence:
            raise RuntimeError("Refusing to reuse an existing case result bundle or record")
        if os.environ.get("TUTAM_QA_HOSTS_ISOLATED") != "1":
            raise RuntimeError("Production host isolation must be verified before native tests")
        if not APP.is_dir() or not SIMULATOR:
            raise RuntimeError("Expected compiled simulator app and CI simulator destination")
        installed = subprocess.run(
            ["xcrun", "simctl", "get_app_container", SIMULATOR, BUNDLE, "app"],
            capture_output=True, timeout=30,
        )
        if installed.returncode == 0:
            subprocess.run(["xcrun", "simctl", "terminate", SIMULATOR, BUNDLE],
                           capture_output=True, timeout=30)
            subprocess.run(["xcrun", "simctl", "uninstall", SIMULATOR, BUNDLE],
                           check=True, timeout=60)
        subprocess.run(["xcrun", "simctl", "install", SIMULATOR, str(APP)],
                       check=True, timeout=90)
        fresh_install_completed = True
        record["freshInstallCompleted"] = True
        command = [
            "xcodebuild", "-workspace", "ios/App/App.xcworkspace", "-scheme", "App",
            "-configuration", "Debug", "-sdk", "iphonesimulator",
            "-destination", f"platform=iOS Simulator,id={SIMULATOR}",
            "-derivedDataPath", "build/ios-simulator", "-resultBundlePath", str(result),
            f"-only-testing:AppUITests/{identifier}", "-parallel-testing-enabled", "NO",
            "-test-timeouts-enabled", "YES", "-default-test-execution-time-allowance", "600",
            "-maximum-test-execution-time-allowance", "600", "CODE_SIGNING_ALLOWED=NO",
            "test-without-building",
        ]
        print(f"::group::Native {index}/{len(CASES)}: {identifier}", flush=True)
        group_started = True
        with (EVIDENCE / f"{stem}.log").open("w", encoding="utf-8") as log:
            process = subprocess.Popen(command, stdout=subprocess.PIPE,
                                       stderr=subprocess.STDOUT, text=True, bufsize=1,
                                       encoding="utf-8", errors="replace", start_new_session=True)
            output = queue.Queue(maxsize=256)
            timed_out = threading.Event()
            started = time.monotonic()

            def read_output():
                try:
                    for line in process.stdout:
                        output.put(line)
                except (OSError, ValueError) as error:
                    output.put(error)
                finally:
                    output.put(None)

            def kill_xcode_group():
                timed_out.set()
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass

            # A detached child may retain stdout even after the owned process group dies.
            # Keep the reader daemonized and bound draining to five seconds after timeout.
            reader = threading.Thread(target=read_output, daemon=True)
            reader.start()
            watchdog = threading.Timer(900, kill_xcode_group)
            watchdog.start()
            try:
                while True:
                    if time.monotonic() - started >= 905:
                        infrastructure_error(record, "Xcode stdout did not close before the watchdog drain deadline")
                        break
                    try:
                        line = output.get(timeout=1)
                    except queue.Empty:
                        continue
                    if line is None:
                        break
                    if isinstance(line, Exception):
                        raise line
                    log.write(line)
                    log.flush()
                    print(line, end="", flush=True)
                record["xcodeExitCode"] = process.wait(timeout=max(1, 905 - (time.monotonic() - started)))
                if timed_out.is_set():
                    infrastructure_error(record, "Xcode exceeded the 900-second watchdog deadline")
            finally:
                watchdog.cancel()
        data = subprocess.check_output([
            "xcrun", "xcresulttool", "get", "test-results", "summary", "--path", str(result),
        ], timeout=60)
        (EVIDENCE / f"{stem}-summary.json").write_bytes(data)
        summary = json.loads(data)
        if not isinstance(summary, dict):
            raise ValueError("XCResult summary must be an object")
        record["summary"] = summary
        if any(type(summary.get(key)) is not int or summary[key] < 0 for key in COUNTS):
            infrastructure_error(record, "XCResult summary has invalid or missing test counts")
        elif summary["totalTestCount"] != 1:
            infrastructure_error(record, "Each invocation must execute exactly one test")
        elif record["xcodeExitCode"] != 0 and summary["failedTests"] == 0:
            infrastructure_error(record, "Xcode failed outside the selected test assertion")
    except (OSError, subprocess.SubprocessError, ValueError, KeyError, RuntimeError) as error:
        infrastructure_error(record, str(error))
        print(f"::error::{identifier}: {error}", flush=True)
    finally:
        if group_started:
            print("::endgroup::", flush=True)
        if not previous_evidence:
            qa_events, qa_events_status = capture_qa_events(index, identifier, fresh_install_completed)
        # Xuất ngay từng bài, kể cả assertion thất bại; bài tiếp theo không phải chờ cả suite mới có bằng chứng.
        if result.is_dir() and not previous_evidence:
            try:
                subprocess.run([
                    "xcrun", "xcresulttool", "export", "attachments", "--path", str(result),
                    "--output-path", str(EVIDENCE / f"{stem}-attachments"),
                ], check=True, timeout=120)
            except (OSError, subprocess.SubprocessError) as error:
                infrastructure_error(record, f"Attachment export failed: {error}")
        elif not previous_evidence:
            infrastructure_error(record, "No result bundle was produced")
        if not previous_evidence:
            try:
                attachments = EVIDENCE / f"{stem}-attachments"
                attachments.mkdir(parents=True, exist_ok=True)
                if qa_events is not None:
                    (attachments / "tutam-qa-events.jsonl").write_bytes(qa_events)
                write_json(attachments / "tutam-qa-events-status.json", qa_events_status)
            except OSError:
                print(f"QA events artifact unavailable for {stem} (artifact write failed).", flush=True)
        if SIMULATOR:
            try:
                subprocess.run([
                    "xcrun", "simctl", "io", SIMULATOR, "screenshot",
                    str(EVIDENCE / f"{stem}-final.png"),
                ], check=True, timeout=45)
            except (OSError, subprocess.SubprocessError) as error:
                infrastructure_error(record, f"Case screenshot failed: {error}")
        record["completed"] = True
        record["casePassed"] = case_passed(record)
        write_json(record_path, record)
    print(json.dumps({"case": index, "identifier": identifier,
                      "casePassed": record["casePassed"],
                      "infrastructureError": record.get("infrastructureError")}, ensure_ascii=False), flush=True)
    return record


def aggregate():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    records = []
    for index, identifier in enumerate(CASES, 1):
        path = EVIDENCE / f"native-{index:02d}-record.json"
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(record, dict):
                raise ValueError("Case record must be an object")
            if record.get("case") != index or record.get("identifier") != identifier:
                infrastructure_error(record, "Case record identifier does not match its selected test")
            if record.get("completed") is not True:
                infrastructure_error(record, "Case invocation did not finish collecting evidence")
            for key in ("GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"):
                field = "workflowRunId" if key == "GITHUB_RUN_ID" else "workflowRunAttempt"
                if os.environ.get(key) and record.get(field) != os.environ[key]:
                    infrastructure_error(record, "Case record is not from this workflow run and attempt")
            summary = record.get("summary") or {}
            if not isinstance(summary, dict) or any(type(summary.get(key)) is not int or summary[key] < 0 for key in COUNTS):
                infrastructure_error(record, "Case has no valid XCResult test counts")
                record["summary"] = {}
            elif summary["totalTestCount"] != 1:
                infrastructure_error(record, "Case invocation did not execute exactly one test")
        except (OSError, ValueError, TypeError) as error:
            record = {"case": index, "identifier": identifier, "summary": {},
                      "infrastructureError": f"Missing or unreadable case record: {error}"}
        records.append(record)
    expected_paths = {EVIDENCE / f"native-{index:02d}-record.json" for index in range(1, 10)}
    unexpected = sorted(str(path.name) for path in set(EVIDENCE.glob("native-*-record.json")) - expected_paths)
    totals = {key: sum(record.get("summary", {}).get(key, 0) for record in records) for key in COUNTS}
    totals["originalSevenPassed"] = sum(record.get("summary", {}).get("passedTests", 0) for record in records[:7])
    totals["personalReminderPassed"] = sum(record.get("summary", {}).get("passedTests", 0) for record in records[7:])
    totals["unexpectedCaseRecords"] = unexpected
    totals["cases"] = [{"case": index, "identifier": CASES[index - 1],
                        "infrastructureError": record.get("infrastructureError"),
                        "xcodeExitCode": record.get("xcodeExitCode"),
                        "casePassed": case_passed(record)} for index, record in enumerate(records, 1)]
    write_json(EVIDENCE / "native-ui-cases.json", records)
    write_json(EVIDENCE / "native-ui-summary.json", totals)
    print(json.dumps(totals, ensure_ascii=False), flush=True)
    if (totals["passedTests"] != 9 or totals["failedTests"] != 0
            or totals["skippedTests"] != 0 or totals["totalTestCount"] != 9
            or totals["originalSevenPassed"] != 7 or totals["personalReminderPassed"] != 2
            or unexpected or not all(case_passed(record) for record in records)):
        raise SystemExit("Original seven and both personal-reminder tests must execute and pass, with successful Xcode invocations and no infrastructure failures or skips")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--case", type=int, choices=range(1, 10), dest="case_index")
    mode.add_argument("--aggregate", action="store_true")
    args = parser.parse_args()
    if args.aggregate:
        aggregate()
    elif args.case_index is not None:
        if not case_passed(run_case(args.case_index)):
            raise SystemExit(1)
    else:
        for index in ORDER:
            run_case(index)
        aggregate()


if __name__ == "__main__":
    main()
