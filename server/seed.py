"""Dev/demo seed: `python seed.py` (needs DATABASE_URL, tables already migrated). Idempotent: existing rows are skipped.
Passwords: env SEED_PASSWORD, else one random password printed once. Device keys are printed once (only hashes are stored)."""
import os
import secrets

from sqlalchemy import select

import db
import models as m
from security import hash_secret


def main():
    if db.SessionLocal is None:
        raise SystemExit("DATABASE_URL is not set")
    pw = os.environ.get("SEED_PASSWORD")
    generated = pw is None
    pw = pw or secrets.token_urlsafe(12)
    with db.SessionLocal() as s:
        def user(email, role, name):
            u = s.scalar(select(m.User).where(m.User.email == email))
            if u is None:
                u = m.User(email=email, role=role, name=name, pw_hash=hash_secret(pw))
                s.add(u)
                s.flush()
                print(f"created {role}: {email}")
            return u

        user("admin@demo", "admin", "Admin")
        doc = user("doctor@demo", "doctor", "Dr. Rahman")
        for email, name, dev_id in (("patient@demo", "Patient A", "imu_01"), ("patient2@demo", "Patient B", "imu_02")):
            p = user(email, "patient", name)
            if s.get(m.Patient, p.id) is None:
                s.add(m.Patient(user_id=p.id, doctor_id=doc.id))
                s.flush()
            if s.get(m.Device, dev_id) is None:
                key = secrets.token_urlsafe(24)
                s.add(m.Device(id=dev_id, key_hash=hash_secret(key), patient_id=p.id))
                print(f"device {dev_id} key (shown once): {key}")
        s.commit()
    if generated:
        print(f"password for new users (shown once): {pw}")


if __name__ == "__main__":
    main()
