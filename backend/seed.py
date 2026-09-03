from datetime import datetime
from sqlalchemy import func, text
from app.database import SessionLocal
from app.models import Completion, Title, Major


DEFAULT_TITLES = [
    ('King', 'boy'),
    ('Queen', 'girl'),
    ('Smart', 'boy'),
    ('Style', 'girl'),
    ('Mr.Popular', 'boy'),
    ('Ms.Popular', 'girl'),
]


def main():
    db = SessionLocal()
    year = datetime.now().year

    try:
        if not db.query(Completion).filter(
            Completion.major_id == 0
        ).first():
            db.add(
                Completion(
                    major_id=0,
                    status=0,
                    year=year
                )
            )

        whole = db.get(Major, 0)
        if whole is None:
            db.execute(text("SET SESSION sql_mode = CONCAT(@@sql_mode, ',NO_AUTO_VALUE_ON_ZERO')"))
            db.add(Major(major_id=0, major='Whole'))
            db.flush()

        majors = db.query(Major).all()

        max_id = db.query(
            func.max(Title.title_id)
        ).scalar() or 0

        next_id = max_id + 1

        for major in majors:
            for title_name, group in DEFAULT_TITLES:

                exists = db.query(Title).filter(
                    Title.major_id == major.major_id,
                    func.lower(Title.title) == title_name.lower()
                ).first()

                if exists:
                    continue


                if group == 'boy' and next_id % 2 == 0:
                    next_id += 1

                if group == 'girl' and next_id % 2 == 1:
                    next_id += 1

                db.add(
                    Title(
                        title_id=next_id,
                        title=title_name,
                        major_id=major.major_id
                    )
                )

                next_id += 1

        db.commit()

        print(
            'Seed complete: default titles created for each major '
            'and the Whole completion row created.'
        )

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == '__main__':
    main()