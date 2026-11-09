"""Run the seven native guest flows against independent CI-owned installations."""
import json
import os
from pathlib import Path
import subprocess
import threading


ROOT = Path.cwd().resolve()
EVIDENCE = ROOT / "build/release-evidence"
APP = ROOT / "build/ios-simulator/Build/Products/Debug-iphonesimulator/App.app"
SIMULATOR = os.environ["TUTAM_QA_SIMULATOR"]
BUNDLE = "vn.quangtu.tutam"
CASES = [
    "NativeGuestSmokeTests/testExistingNotificationButtonDeliversToSystemNotificationCenter",
    "NativeGuestSmokeTests/testMotionSettingPersistsAcrossNativeDeepLinks",
    "NativeGuestSmokeTests/testRosaryBackPreservesCountInPortraitAndLandscape",
    "NativeExtendedGuestTests/testLightDarkSettingsAndGuestDeepLinkNavigation",
    "NativeExtendedGuestTests/testMeditationPauseResumeSurvivesNativeBackgrounding",
    "NativeExtendedGuestTests/testNativeCatalogExcludesWebOnlyBookAndSearchCanBeCleared",
    "NativeExtendedGuestTests/testOfflineLibrarySearchChapterReadingAndLargeTextRotation",
]


def run_case(index, identifier):
    stem = f"native-{index:02d}"
    result = EVIDENCE / f"{stem}.xcresult"
    summary_path = EVIDENCE / f"{stem}-summary.json"
    record = {"identifier": identifier, "resultBundle": result.name}
    try:
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
        print(f"::group::Native {index}/7: {identifier}", flush=True)
        with (EVIDENCE / f"{stem}.log").open("w", encoding="utf-8") as log:
            process = subprocess.Popen(command, stdout=subprocess.PIPE,
                                       stderr=subprocess.STDOUT, text=True, bufsize=1)
            watchdog = threading.Timer(900, process.kill)
            watchdog.start()
            try:
                for line in process.stdout:
                    log.write(line)
                    log.flush()
                    print(line, end="", flush=True)
                record["xcodeExitCode"] = process.wait()
            finally:
                watchdog.cancel()
        print("::endgroup::", flush=True)
        data = subprocess.check_output([
            "xcrun", "xcresulttool", "get", "test-results", "summary", "--path", str(result),
        ], timeout=60)
        summary_path.write_bytes(data)
        summary = json.loads(data)
        record["summary"] = summary
        if summary["totalTestCount"] != 1:
            record["infrastructureError"] = "Each invocation must execute exactly one test"
        elif record["xcodeExitCode"] != 0 and summary["failedTests"] == 0:
            record["infrastructureError"] = "Xcode failed outside the selected test assertion"
    except (OSError, subprocess.SubprocessError, ValueError, KeyError) as error:
        record["infrastructureError"] = str(error)
        print(f"::error::{identifier}: {error}", flush=True)
    return record


def main():
    if os.environ.get("TUTAM_QA_HOSTS_ISOLATED") != "1":
        raise SystemExit("Production host isolation must be verified before native tests")
    if not APP.is_dir() or not SIMULATOR:
        raise SystemExit("Expected compiled simulator app and CI simulator destination")
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    records = []
    for index, identifier in enumerate(CASES, 1):
        records.append(run_case(index, identifier))
        (EVIDENCE / "native-ui-cases.json").write_text(
            json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    totals = {key: sum(case.get("summary", {}).get(key, 0) for case in records)
              for key in ["passedTests", "failedTests", "skippedTests", "totalTestCount"]}
    totals["cases"] = [{"identifier": case["identifier"],
                        "infrastructureError": case.get("infrastructureError"),
                        "xcodeExitCode": case.get("xcodeExitCode")} for case in records]
    (EVIDENCE / "native-ui-summary.json").write_text(
        json.dumps(totals, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(totals, ensure_ascii=False), flush=True)
    if (totals["passedTests"] != 7 or totals["failedTests"] != 0
            or totals["skippedTests"] != 0 or totals["totalTestCount"] != 7
            or any(case.get("infrastructureError") for case in records)):
        raise SystemExit("All seven isolated native tests must execute and pass; no failures or skips")


if __name__ == "__main__":
    main()
