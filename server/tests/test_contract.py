"""Wave-0 contract: auth cookie, role guards and patient access on the stub routers. Streams A/B keep these green with real code."""
from fastapi.testclient import TestClient

import main


def login(email):
    c = TestClient(main.app)
    assert c.post("/api/auth/login", json={"email": email, "password": "x"}).status_code == 200
    return c


def test_auth_and_roles():
    anon = TestClient(main.app)
    assert anon.get("/api/auth/me").status_code == 401
    assert anon.post("/api/auth/login", json={"email": "nobody@x", "password": "x"}).status_code == 401
    doctor, patient, admin = login("doctor@demo"), login("patient@demo"), login("admin@demo")
    assert doctor.get("/api/auth/me").json()["role"] == "doctor"
    assert len(doctor.get("/api/patients").json()) == 2
    assert patient.get("/api/patients").status_code == 403  # patients can't list patients
    assert doctor.get("/api/admin/users").status_code == 403 and len(admin.get("/api/admin/users").json()) >= 4


def test_patient_access():
    patient, doctor = login("patient@demo"), login("doctor@demo")
    assert patient.get("/api/patients/3/progress").status_code == 200
    assert patient.get("/api/patients/4/progress").status_code == 403  # another patient's data
    assert patient.post("/api/patients/3/assessments", json={}).status_code in (403, 422)  # only doctors mark
    assert doctor.get("/api/patients/3/progress").json()["improvement"]["index"] is not None
    assert patient.get("/api/plan").json()["patient_id"] == 3


def test_contract_shapes():
    doctor = login("doctor@demo")
    s = doctor.get("/api/sessions/10").json()
    assert s["reps"] and "mean_quality" in s
    assert doctor.get("/api/sessions/10/trace").json()["rate_hz"] == 20.0
    assert doctor.get("/api/patients/3/reps.csv").text.startswith("session_id,")
    bad = {"assessed_on": "2026-11-19", "rubric": {"range": 6, "smoothness": 1, "control": 1, "adherence": 1, "overall": 1}}
    assert doctor.post("/api/patients/3/assessments", json=bad).status_code == 422  # rubric is 1-5
