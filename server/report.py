"""Plain-language performance report for clinicians. One builder feeds both the web report and the Word file.

It only describes the patient's own data. Wording rules (not clinical thresholds, just how change is put into words):
  change vs the first sessions below CHANGE_SMALL % -> "about the same"; below CHANGE_CLEAR % -> "slightly";
  at/above CHANGE_CLEAR % -> "clearly". Quality bands reuse the game's own level rules (quality.Q_UP / Q_DOWN).
Nothing here is a diagnosis or a claim of clinical effectiveness.
"""
import io
from datetime import date, datetime, timedelta, timezone
from statistics import median

import features
from improvement import WINDOW
from quality import Q_DOWN, Q_UP, W_SMOOTH, W_TIMING
from schemas import (AssessmentOut, ClinicalReport, MethodItem, PatientFlag, PlanOut, ReportPoint, ReportSection, SessionLine,
                     SessionOut)

CHANGE_SMALL = 5.0  # |% change| below this reads "about the same"
CHANGE_CLEAR = 15.0  # at/above this reads "clearly better/worse"
CAVEAT = ("Descriptive summary of the patient's own game sessions, measured by one wrist-worn motion sensor and an optional "
          "load cell. Not a diagnosis. Scores and thresholds are engineering placeholders that have not been clinically "
          "validated. One sensor cannot detect compensatory (trunk or shoulder) movement.")

IMU_FIELDS = ("mean_quality", "mean_roll_range_deg", "mean_pitch_range_deg", "mean_speed_peaks")


def _day(d: datetime | date) -> str:
    return f"{d.day} {d:%b %Y}"


def _kind(s: SessionOut) -> str:
    imu = any(getattr(s, f) is not None for f in IMU_FIELDS)
    force = s.mean_peak_load_kg is not None
    return "mixed" if imu and force else "movement" if imu else "force" if force else "none"


def band(q: float | None) -> str | None:
    """Quality in words, using the game's own level rules."""
    if q is None:
        return None
    return "high" if q >= Q_UP else "moderate" if q >= Q_DOWN else "low"


def trend(values: list[float | None], higher_is_better: bool):
    """(signed % change, positive = better; sessions per window; sessions used), first vs last sessions, or None."""
    v = [x for x in values if x is not None]
    if len(v) < 2:
        return None
    k = min(WINDOW, len(v) // 2)
    b, c = median(v[:k]), median(v[-k:])
    if b <= 0:  # every measure here is a positive quantity; a zero/negative baseline (e.g. a drifting load cell) has no % change
        return None
    pct = (c - b) / abs(b) * 100 * (1 if higher_is_better else -1)
    return pct, k, len(v)


def change_words(pct: float) -> tuple[str, str]:
    """(phrase, tone) for a signed % change where positive = better."""
    if abs(pct) < CHANGE_SMALL:
        return "about the same as", "neutral"
    adv = "clearly" if abs(pct) >= CHANGE_CLEAR else "slightly"
    return (f"{adv} better than", "good") if pct > 0 else (f"{adv} worse than", "watch" if adv == "slightly" else "alert")


def _trend_point(label: str, values, higher_is_better: bool, what_better: str) -> ReportPoint | None:
    t = trend(values, higher_is_better)
    if t is None:
        return None
    pct, k, n = t
    words, tone = change_words(pct)
    first = "the first session" if k == 1 else f"the first {k} sessions"
    return ReportPoint(label=label, tone=tone,
                       text=f"{words.capitalize()} {first} ({'+' if pct >= 0 else ''}{pct:.0f}% from {n} sessions; {what_better}).")


def _split(sessions: list[SessionOut]):
    """(finished sessions, those with completed reps, movement sessions, force sessions), each in time order."""
    done = sorted((s for s in sessions if s.ended_at), key=lambda s: s.started_at)
    with_reps = [s for s in done if (s.n_reps or 0) > 0]
    return (done, with_reps, [s for s in with_reps if _kind(s) in ("movement", "mixed")],
            [s for s in with_reps if _kind(s) in ("force", "mixed")])


def status_of(sessions: list[SessionOut]) -> tuple[str, str]:
    """(overall status, measure it is based on): movement quality trend, else grip force trend. Shared by the report and the patient list."""
    _, _, move, force = _split(sessions)
    tq = trend([s.mean_quality for s in move], True)
    t = tq or trend([s.mean_peak_load_kg for s in force], True)
    status = "insufficient" if t is None else "improving" if t[0] >= CHANGE_SMALL else "declining" if t[0] <= -CHANGE_SMALL else "stable"
    return status, "movement quality" if tq else "grip force"


def build(*, patient_id: int, name: str, sessions: list[SessionOut], assessments: list[AssessmentOut], plan: PlanOut | None,
          flags: list[PatientFlag], now: datetime | None = None) -> ClinicalReport:
    now = now or datetime.now(timezone.utc)
    done, with_reps, move, force = _split(sessions)
    period = f"{_day(done[0].started_at)} to {_day(done[-1].started_at)}" if done else "No sessions yet"
    sections: list[ReportSection] = []

    # 1. Practice and adherence (compared only with the doctor's own plan)
    pts = []
    if done:
        days = (now - done[-1].started_at).days
        pts.append(ReportPoint(label="Last session", text="Today." if days < 1 else f"{days} day{'s' if days != 1 else ''} ago."))
    if plan and plan.sessions_per_week:
        target = plan.sessions_per_week * 4
        recent = sum(1 for s in with_reps if s.started_at >= now - timedelta(days=28))
        pts.append(ReportPoint(label="Plan", tone="good" if recent >= target else "watch",
                               text=f"{recent} of {target} planned sessions with exercises in the last 4 weeks "
                                    f"({plan.sessions_per_week} per week)."))
    empty = len(done) - len(with_reps)
    if empty:
        pts.append(ReportPoint(label="Sessions without exercises", tone="watch",
                               text=f"{empty} session{'s' if empty != 1 else ''} ended with no completed repetition "
                                    "(the game was not played through, or the sensor was not connected)."))
    sections.append(ReportSection(
        key="adherence", title="Practice and adherence", points=pts,
        summary=(f"{len(done)} session{'s' if len(done) != 1 else ''} completed; {len(with_reps)} included completed exercises."
                 if done else "No sessions completed yet.")))

    # 2. Movement quality
    qs = [s.mean_quality for s in move]
    scored = [q for q in qs if q is not None]
    pts = []
    tq = _trend_point("Trend", qs, True, "the score combines speed and smoothness")
    if tq:
        pts.append(tq)
    if scored:
        b = [band(q) for q in scored]
        pts.append(ReportPoint(label="Latest session", text=f"{band(scored[-1]).capitalize()} quality.",
                               tone={"high": "good", "moderate": "neutral", "low": "watch"}[band(scored[-1])]))
        pts.append(ReportPoint(label="All scored sessions",
                               text=f"{b.count('high')} high, {b.count('moderate')} moderate, {b.count('low')} low."))
    tqv = trend(qs, True)
    sections.append(ReportSection(
        key="quality", title="Movement quality", points=pts,
        summary=("No scored movement sessions yet." if not scored else
                 f"Movement quality is now {change_words(tqv[0])[0]} at the start." if tqv else
                 f"Only one scored session so far ({band(scored[-1])} quality).")))

    # 3. Range of movement
    pts = [p for p in (
        _trend_point("Forearm rotation (palm up and down)", [s.mean_roll_range_deg for s in move], True, "wider is better"),
        _trend_point("Forearm raising", [s.mean_pitch_range_deg for s in move], True, "higher is better"),
    ) if p]
    sections.append(ReportSection(key="range", title="Range of movement", points=pts,
                                  summary="How far the forearm turns and lifts during each exercise." if pts else
                                  "Not enough movement sessions to describe a change yet."))

    # 4. Speed and smoothness
    pts = [p for p in (
        _trend_point("Speed", [s.mean_duration_s for s in move], False, "shorter repetitions are better"),
        _trend_point("Smoothness", [s.mean_speed_peaks for s in move], False, "fewer stop-start bursts is smoother"),
    ) if p]
    sections.append(ReportSection(key="speed", title="Speed and smoothness", points=pts,
                                  summary="How quickly and how evenly each repetition is done." if pts else
                                  "Not enough movement sessions to describe a change yet."))

    # 5. Grip / press force (load cell levels only)
    if force:
        loads = [s.mean_peak_load_kg for s in force]
        pts = [p for p in (_trend_point("Trend", loads, True, "a stronger peak is better"),) if p]
        pts.append(ReportPoint(label="Latest session", text=f"Peak force about {loads[-1]:.1f} kg."))
        pts.append(ReportPoint(label="Calibration", tone="watch",
                               text="Force values in kg are only as accurate as the load cell calibration."))
        sections.append(ReportSection(key="force", title="Grip and press force", points=pts,
                                      summary=f"{len(force)} session{'s' if len(force) != 1 else ''} with load cell exercises."))

    # 6. Clinician assessments (the doctor's own marks; only described)
    marks = sorted(assessments, key=lambda a: (a.assessed_on, a.id))
    pts = []
    if marks:
        last = marks[-1]
        txt = f"Overall {last.rubric.overall} of 5 on {_day(last.assessed_on)}"
        if len(marks) > 1:
            prev = marks[-2].rubric.overall
            txt += "; no change from the previous mark." if prev == last.rubric.overall else f"; {'up' if last.rubric.overall > prev else 'down'} from {prev}."
        pts.append(ReportPoint(label="Latest mark", text=txt + ("" if txt.endswith(".") else ".")))
        pts.append(ReportPoint(label="Detail", text=f"Range {last.rubric.range}, smoothness {last.rubric.smoothness}, "
                                                    f"control {last.rubric.control}, adherence {last.rubric.adherence} (each of 5)."))
        sc = [a for a in marks if a.scale_name and a.scale_score is not None]
        if sc:
            pts.append(ReportPoint(label=sc[-1].scale_name, text=f"{sc[-1].scale_score:g} on {_day(sc[-1].assessed_on)}"
                                   + (f" (previously {sc[-2].scale_score:g})." if len(sc) > 1 and sc[-2].scale_name == sc[-1].scale_name else ".")))
        if last.comment:
            pts.append(ReportPoint(label="Comment", text=last.comment))
    sections.append(ReportSection(key="marks", title="Clinician assessments", points=pts,
                                  summary=f"{len(marks)} mark{'s' if len(marks) != 1 else ''} recorded." if marks else
                                  "No clinician marks recorded yet."))

    # 7. Points to consider
    pts = [ReportPoint(label="Alert", text=f.message, tone="alert") for f in flags]
    if len(with_reps) < 2 * WINDOW:
        pts.append(ReportPoint(label="Limited data", tone="watch",
                               text=f"Fewer than {2 * WINDOW} sessions with exercises: trends are early and may change."))
    sections.append(ReportSection(key="consider", title="Points to consider", points=pts,
                                  summary="Nothing flagged." if not pts else "Items that may need attention."))

    # Overall status and headline
    status, measure = status_of(sessions)
    head = f"{name} has completed {len(done)} session{'s' if len(done) != 1 else ''}"
    head += f" ({period})." if done else "."
    head += {"insufficient": " There is not enough data yet to describe a trend.",
             "improving": f" Overall, {measure} is better than at the start.",
             "stable": f" Overall, {measure} is about the same as at the start.",
             "declining": f" Overall, {measure} is lower than at the start; consider reviewing the plan."}[status]
    if any(p.label == "Plan" and p.tone == "watch" for p in sections[0].points):
        head += " Practice is below the planned number of sessions."

    lines = []
    for s in reversed(done):
        k = _kind(s) if (s.n_reps or 0) > 0 else "none"
        res = ("No completed repetitions" if k == "none" else
               f"{band(s.mean_quality).capitalize()} quality" if s.mean_quality is not None else
               f"Peak force about {s.mean_peak_load_kg:.1f} kg" if s.mean_peak_load_kg is not None else "Completed, not scored")
        lines.append(SessionLine(session_id=s.id, started_at=s.started_at, kind=k, reps=s.n_reps or 0, result=res))

    return ClinicalReport(patient_id=patient_id, name=name, generated_at=now, period=period, status=status, headline=head,
                          sections=sections, sessions=lines, caveat=CAVEAT)


def methods() -> list[MethodItem]:
    """How each measure is produced, in plain words. Built from the live constants so it cannot drift from the code."""
    return [
        MethodItem(title="Sensors", text=(
            "A motion sensor (ICM-42688-P accelerometer and gyroscope, 100 samples a second) is worn like a watch on the back of "
            "the wrist and sends data over Wi-Fi. It follows the forearm, not the wrist joint. An optional load cell measures "
            "squeeze or press force.")),
        MethodItem(title="Forearm angle", text=(
            "Two angles are estimated from the sensor with a complementary filter (gyroscope for quick changes, accelerometer to "
            "cancel drift): rotation, turning the palm up and down, and raising, lifting the forearm up and down.")),
        MethodItem(title="Repetition", text=(
            "The game decides when a repetition is finished (for example, the seed is planted). The server then looks at the "
            "sensor data from that repetition's time window.")),
        MethodItem(title="Range of movement", text=(
            "The difference between the largest and smallest angle during the repetition, in degrees, for rotation and for raising. "
            "Range is reported but not scored, because the game already requires a set reach to finish a task.")),
        MethodItem(title="Smoothness", text=(
            f"Rotation speed is smoothed over {features.SMOOTH_N / 100:.2f} s and its distinct bursts are counted (a burst must "
            f"stand out by at least {features.PEAK_PROM:.0%} of the repetition's top speed). A smooth movement has few bursts; "
            "a stop-start movement has many. Tuned on a small set of recordings, not validated.")),
        MethodItem(title="Movement quality score (0 to 100)", text=(
            f"{W_TIMING:.0%} timing plus {W_SMOOTH:.0%} smoothness. Each part compares the repetition with the patient's own "
            "earlier repetitions of the same task in that session (their usual time divided by this time; their usual number of "
            "bursts divided by this number), capped at 100. The first repetition of a task has nothing to compare with, so it "
            "is not scored. The score is relative to the patient, not to a healthy norm.")),
        MethodItem(title="Quality bands", text=(
            f"High: {Q_UP} or more (the game moves the patient up a level). Moderate: {Q_DOWN} to {Q_UP - 1} (the level is "
            f"repeated). Low: below {Q_DOWN} (the game moves to an easier level). The levels allowed are limited by the "
            "doctor's plan.")),
        MethodItem(title="Grip and press force", text=(
            "On load cell levels the highest force reached in each repetition is recorded, in kilograms. Accuracy depends on the "
            "load cell calibration. Force levels record force only; movement levels record movement only.")),
        MethodItem(title="How change is put into words", text=(
            f"The median of the first sessions is compared with the median of the latest sessions (up to {WINDOW} each). "
            f"A change under {CHANGE_SMALL:g}% is described as about the same, {CHANGE_SMALL:g} to {CHANGE_CLEAR:g}% as "
            f"slightly better or worse, and {CHANGE_CLEAR:g}% or more as clearly better or worse. These are wording rules, not "
            "clinical thresholds.")),
        MethodItem(title="Limitations", text=(
            "No measure here has been clinically validated, and the weights and thresholds are engineering placeholders. One "
            "wrist sensor cannot detect compensatory trunk or shoulder movement. Use the report alongside your own assessment.")),
    ]


def to_docx(r: ClinicalReport, details: list[tuple[str, str]]) -> bytes:
    """Word file of the same report. `details` = extra (label, value) rows for the header table (side, onset, plan)."""
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt, RGBColor

    doc = Document()
    st = doc.styles["Normal"]
    st.font.name, st.font.size = "Calibri", Pt(11)

    t = doc.add_heading("Rehabilitation performance report", level=0)
    t.alignment = WD_ALIGN_PARAGRAPH.LEFT
    info = doc.add_table(rows=0, cols=2)
    info.style = "Light List"
    for k, v in [("Patient", r.name), ("Period", r.period), ("Report date", _day(r.generated_at)), *details]:
        row = info.add_row().cells
        row[0].text, row[1].text = k, v

    doc.add_heading("Summary", level=1)
    status = {"improving": "Improving", "stable": "Stable", "declining": "Declining", "insufficient": "Not enough data"}[r.status]
    p = doc.add_paragraph()
    p.add_run(f"Overall: {status}. ").bold = True
    p.add_run(r.headline)

    colors = {"good": RGBColor(0x2E, 0x7D, 0x5B), "watch": RGBColor(0xA8, 0x68, 0x1A), "alert": RGBColor(0xA3, 0x3A, 0x32)}
    for sec in r.sections:
        doc.add_heading(sec.title, level=1)
        doc.add_paragraph(sec.summary)
        for pt in sec.points:
            b = doc.add_paragraph(style="List Bullet")
            lab = b.add_run(f"{pt.label}: ")
            lab.bold = True
            if pt.tone in colors:
                lab.font.color.rgb = colors[pt.tone]
            b.add_run(pt.text)

    doc.add_heading("Session log", level=1)
    played = [s for s in r.sessions if s.kind != "none"]
    if played:
        tab = doc.add_table(rows=1, cols=4)
        tab.style = "Light Grid Accent 1"
        for c, h in zip(tab.rows[0].cells, ("Date", "Exercise", "Repetitions", "Result")):
            c.text = h
        kinds = {"movement": "Movement", "force": "Grip force", "mixed": "Movement and force", "none": "None"}
        for s in played:
            row = tab.add_row().cells
            row[0].text, row[1].text, row[2].text, row[3].text = _day(s.started_at), kinds[s.kind], str(s.reps), s.result
    else:
        doc.add_paragraph("No sessions with completed exercises yet.")
    if len(r.sessions) > len(played):
        n = len(r.sessions) - len(played)
        doc.add_paragraph(f"{n} session{'s' if n != 1 else ''} with no completed exercises {'are' if n != 1 else 'is'} not listed.")

    doc.add_heading("How these measures work", level=1)
    for m in methods():
        q = doc.add_paragraph()
        q.add_run(m.title + ". ").bold = True
        q.add_run(m.text)

    c = doc.add_paragraph()
    run = c.add_run(r.caveat)
    run.italic, run.font.size = True, Pt(9)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
